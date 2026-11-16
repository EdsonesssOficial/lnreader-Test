package expo.modules.nativebackgroundmusic

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.PlaybackParams
import android.media.audiofx.BassBoost
import android.media.audiofx.Equalizer
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
    private var speed = 1f
    private var wantsPlaying = false
    private var failedInRow = 0

    /**
     * One audio session shared by every track, so the effects below are created
     * once and keep working across track changes instead of being rebuilt.
     */
    private val effectsSession: Int =
        (context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager)
            ?.generateAudioSessionId() ?: AudioManager.ERROR
    private var equalizer: Equalizer? = null
    private var bassBoost: BassBoost? = null

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
                applyPlaybackParams(player)
            }
        }
    }

    fun setSpeed(value: Float) {
        handler.post {
            speed = value.coerceIn(MIN_SPEED, MAX_SPEED)
            val player = mediaPlayer
            if (player != null && prepared && player.isPlaying) {
                applyPlaybackParams(player)
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
            releaseEffects()
        }
    }

    /** Band layout of the device equalizer, or null when it is unsupported. */
    @Synchronized
    fun getEqualizerInfo(): Map<String, Any?>? {
        val eq = ensureEqualizer() ?: return null
        return try {
            val range = eq.bandLevelRange
            val bandCount = eq.numberOfBands.toInt()
            mapOf(
                "minLevel" to range[0].toInt(),
                "maxLevel" to range[1].toInt(),
                "bands" to (0 until bandCount).map { band ->
                    mapOf("centerFrequency" to eq.getCenterFreq(band.toShort()) / 1000)
                },
                "presets" to (0 until eq.numberOfPresets.toInt()).map { preset ->
                    eq.getPresetName(preset.toShort())
                },
                "bassBoostSupported" to isBassBoostSupported(),
            )
        } catch (_: Exception) {
            null
        }
    }

    /** Applies the levels (millibels, one per band) and switches the equalizer on or off. */
    @Synchronized
    fun setEqualizer(enabled: Boolean, levels: List<Int>) {
        val eq = (if (enabled) ensureEqualizer() else equalizer) ?: return
        try {
            if (enabled) {
                val range = eq.bandLevelRange
                val bandCount = minOf(eq.numberOfBands.toInt(), levels.size)
                for (band in 0 until bandCount) {
                    val level = levels[band].coerceIn(range[0].toInt(), range[1].toInt())
                    eq.setBandLevel(band.toShort(), level.toShort())
                }
            }
            eq.setEnabled(enabled)
        } catch (_: Exception) {
            // The effect may have been reclaimed by the system; it is rebuilt on demand.
            equalizer = null
        }
    }

    @Synchronized
    fun getPresetLevels(index: Int): List<Int> {
        val eq = ensureEqualizer() ?: return emptyList()
        return try {
            eq.usePreset(index.toShort())
            (0 until eq.numberOfBands.toInt()).map { band ->
                eq.getBandLevel(band.toShort()).toInt()
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    /** [strength] is 0..1000; 0 turns the effect off. */
    @Synchronized
    fun setBassBoost(strength: Int) {
        if (effectsSession <= 0) return
        try {
            if (strength <= 0) {
                bassBoost?.setEnabled(false)
            } else {
                val effect = bassBoost ?: BassBoost(0, effectsSession).also { bassBoost = it }
                if (effect.strengthSupported) {
                    effect.setStrength(strength.coerceIn(0, 1000).toShort())
                    effect.setEnabled(true)
                }
            }
        } catch (_: Exception) {
            bassBoost = null
        }
    }

    private fun isBassBoostSupported(): Boolean {
        if (effectsSession <= 0) return false
        return try {
            val effect = bassBoost ?: BassBoost(0, effectsSession).also { bassBoost = it }
            effect.strengthSupported
        } catch (_: Exception) {
            false
        }
    }

    private fun ensureEqualizer(): Equalizer? {
        if (effectsSession <= 0) return null
        equalizer?.let { return it }
        return try {
            Equalizer(0, effectsSession).also { equalizer = it }
        } catch (_: Exception) {
            null
        }
    }

    @Synchronized
    private fun releaseEffects() {
        try {
            equalizer?.release()
            bassBoost?.release()
        } catch (_: Exception) {
            // Nothing left to clean up.
        }
        equalizer = null
        bassBoost = null
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
            attachEffectsSession(player)
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

    /** Must run while the player is idle, before the data source is set. */
    private fun attachEffectsSession(player: MediaPlayer) {
        if (effectsSession <= 0) return
        try {
            player.audioSessionId = effectsSession
        } catch (_: Exception) {
            // Effects will not apply, but the music still plays.
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
            if (pitch != 1f || speed != 1f) applyPlaybackParams(player)
        } catch (_: IllegalStateException) {
            // Player was released while the request was queued.
        }
    }

    private fun applyPlaybackParams(player: MediaPlayer) {
        try {
            player.playbackParams = PlaybackParams().setSpeed(speed).setPitch(pitch)
        } catch (_: Exception) {
            // Some devices reject speed/pitch changes; keep the original sound.
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
        private const val MIN_SPEED = 0.5f
        private const val MAX_SPEED = 2f
    }
}
