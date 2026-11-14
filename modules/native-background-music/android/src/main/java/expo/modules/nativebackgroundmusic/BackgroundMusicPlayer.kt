package expo.modules.nativebackgroundmusic

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.PlaybackParams
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.PowerManager

/**
 * Queue-based music player used as TTS background music.
 *
 * It deliberately never requests audio focus: the TTS session owns focus, and
 * this player only has to mix underneath the voice. Every public method is safe
 * to call from any thread; the work is posted to the main thread, which is
 * where all MediaPlayer state lives.
 */
internal class BackgroundMusicPlayer(
    private val context: Context,
    private val onTrackChanged: (index: Int, uri: String) -> Unit,
    private val onEnded: () -> Unit,
    private val onError: (message: String) -> Unit,
) {
    private val handler = Handler(Looper.getMainLooper())

    private var mediaPlayer: MediaPlayer? = null
    private var prepared = false
    private var queue: List<String> = emptyList()
    private var order: List<Int> = emptyList()
    private var cursor = 0
    private var shuffle = false
    private var repeat = REPEAT_ALL
    private var volume = 0.5f
    private var pitch = 1f
    private var wantsPlaying = false
    private var failedInRow = 0

    fun setQueue(uris: List<String>, startIndex: Int, shuffleEnabled: Boolean) {
        handler.post {
            releasePlayer()
            queue = uris
            shuffle = shuffleEnabled
            failedInRow = 0
            rebuildOrder(startIndex.coerceIn(0, (uris.size - 1).coerceAtLeast(0)))
        }
    }

    fun play() {
        handler.post {
            wantsPlaying = true
            val player = mediaPlayer
            if (player == null) {
                startCurrent()
            } else if (prepared) {
                startPlayback(player)
            }
        }
    }

    fun pause() {
        handler.post {
            wantsPlaying = false
            val player = mediaPlayer
            if (player != null && prepared && player.isPlaying) {
                try {
                    player.pause()
                } catch (_: IllegalStateException) {
                    // Player is being torn down.
                }
            }
        }
    }

    fun stop() {
        handler.post {
            wantsPlaying = false
            releasePlayer()
        }
    }

    fun next() {
        handler.post { advance(manual = true) }
    }

    fun previous() {
        handler.post {
            if (order.isNotEmpty()) {
                cursor = if (cursor > 0) cursor - 1 else order.size - 1
                startCurrent()
            }
        }
    }

    fun setVolume(value: Float) {
        handler.post {
            volume = value.coerceIn(0f, 1f)
            try {
                mediaPlayer?.setVolume(volume, volume)
            } catch (_: IllegalStateException) {
                // Applied again when the next track starts.
            }
        }
    }

    fun setPitch(value: Float) {
        handler.post {
            pitch = value.coerceIn(MIN_PITCH, MAX_PITCH)
            val player = mediaPlayer
            if (player != null && prepared && player.isPlaying) {
                applyPitch(player)
            }
        }
    }

    fun setRepeat(mode: String) {
        handler.post {
            repeat = mode
            try {
                mediaPlayer?.isLooping = mode == REPEAT_ONE
            } catch (_: IllegalStateException) {
                // Applied again when the next track starts.
            }
        }
    }

    fun setShuffle(enabled: Boolean) {
        handler.post {
            if (shuffle != enabled) {
                shuffle = enabled
                if (queue.isNotEmpty()) rebuildOrder(currentQueueIndex())
            }
        }
    }

    fun release() {
        handler.post {
            wantsPlaying = false
            releasePlayer()
            queue = emptyList()
            order = emptyList()
            cursor = 0
        }
    }

    private fun currentQueueIndex(): Int = order.getOrNull(cursor) ?: 0

    /** Rebuilds the play order so that [current] is the track being played. */
    private fun rebuildOrder(current: Int) {
        if (queue.isEmpty()) {
            order = emptyList()
            cursor = 0
            return
        }
        val indices = queue.indices.toMutableList()
        if (shuffle) {
            indices.remove(current)
            indices.shuffle()
            indices.add(0, current)
            order = indices
            cursor = 0
        } else {
            order = indices
            cursor = current
        }
    }

    /** New shuffled cycle that does not start with the track that just ended. */
    private fun reshuffle(last: Int) {
        val indices = queue.indices.toMutableList()
        indices.shuffle()
        if (indices.size > 1 && indices[0] == last) {
            val swap = indices.size - 1
            indices[0] = indices[swap].also { indices[swap] = indices[0] }
        }
        order = indices
        cursor = 0
    }

    private fun advance(manual: Boolean) {
        if (order.isEmpty()) return
        if (cursor + 1 < order.size) {
            cursor += 1
            startCurrent()
        } else if (repeat == REPEAT_ALL || manual) {
            if (shuffle) reshuffle(currentQueueIndex()) else cursor = 0
            startCurrent()
        } else {
            releasePlayer()
            wantsPlaying = false
            cursor = 0
            onEnded()
        }
    }

    private fun startCurrent() {
        releasePlayer()
        val index = order.getOrNull(cursor) ?: return
        val uri = queue.getOrNull(index) ?: return
        val player = MediaPlayer()
        mediaPlayer = player
        prepared = false
        try {
            player.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build(),
            )
            player.setWakeMode(context, PowerManager.PARTIAL_WAKE_LOCK)
            player.setDataSource(context, Uri.parse(uri))
            player.setVolume(volume, volume)
            player.isLooping = repeat == REPEAT_ONE
            player.setOnPreparedListener { ready ->
                if (mediaPlayer === ready) {
                    prepared = true
                    failedInRow = 0
                    if (wantsPlaying) startPlayback(ready)
                }
            }
            player.setOnCompletionListener { finished ->
                if (mediaPlayer === finished) advance(manual = false)
            }
            player.setOnErrorListener { failed, what, extra ->
                if (mediaPlayer === failed) {
                    handleTrackError("Playback error ($what/$extra)")
                }
                true
            }
            player.prepareAsync()
            onTrackChanged(index, uri)
        } catch (e: Exception) {
            handleTrackError(e.message ?: "Unable to open track")
        }
    }

    private fun handleTrackError(message: String) {
        failedInRow += 1
        if (failedInRow >= queue.size.coerceAtLeast(1)) {
            releasePlayer()
            wantsPlaying = false
            onError(message)
        } else {
            advance(manual = true)
        }
    }

    private fun startPlayback(player: MediaPlayer) {
        try {
            if (!player.isPlaying) player.start()
            if (pitch != 1f) applyPitch(player)
        } catch (_: IllegalStateException) {
            // Player was released while the request was queued.
        }
    }

    private fun applyPitch(player: MediaPlayer) {
        try {
            player.playbackParams = PlaybackParams().setSpeed(1f).setPitch(pitch)
        } catch (_: Exception) {
            // Some devices reject pitch changes; keep the original pitch.
        }
    }

    private fun releasePlayer() {
        val player = mediaPlayer
        mediaPlayer = null
        prepared = false
        if (player != null) {
            try {
                player.setOnPreparedListener(null)
                player.setOnCompletionListener(null)
                player.setOnErrorListener(null)
                player.release()
            } catch (_: Exception) {
                // Nothing left to clean up.
            }
        }
    }

    companion object {
        const val REPEAT_OFF = "off"
        const val REPEAT_ALL = "all"
        const val REPEAT_ONE = "one"
        private const val MIN_PITCH = 0.5f
        private const val MAX_PITCH = 2f
    }
}
