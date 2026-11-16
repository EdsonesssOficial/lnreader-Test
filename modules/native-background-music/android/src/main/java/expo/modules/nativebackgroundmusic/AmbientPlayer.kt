package expo.modules.nativebackgroundmusic

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.PowerManager

/**
 * Plays one ambient sound at a time, looping, with fade in/out. It is
 * independent from [BackgroundMusicPlayer], so music and ambience mix under the
 * voice. Like the music player it never requests audio focus.
 *
 * Every public method is safe to call from any thread.
 */
internal class AmbientPlayer(
    private val context: Context,
    private val onError: (message: String) -> Unit,
) {
    private val handler = Handler(Looper.getMainLooper())
    private var current: Channel? = null
    private val leaving = mutableSetOf<Channel>()

    fun play(uris: List<String>, volume: Float, fadeMs: Long, shuffle: Boolean) {
        handler.post {
            retire(current, fadeMs)
            current = null
            if (uris.isNotEmpty()) {
                val channel = Channel(uris, volume.coerceIn(0f, 1f), shuffle)
                current = channel
                channel.start()
                channel.fadeTo(1f, fadeMs)
            }
        }
    }

    fun stop(fadeMs: Long) {
        handler.post {
            retire(current, fadeMs)
            current = null
        }
    }

    fun pause(fadeMs: Long) {
        handler.post { current?.pause(fadeMs) }
    }

    fun resume(fadeMs: Long) {
        handler.post { current?.resume(fadeMs) }
    }

    fun setVolume(volume: Float) {
        handler.post { current?.setVolume(volume.coerceIn(0f, 1f)) }
    }

    fun release() {
        handler.post {
            current?.release()
            current = null
            leaving.toList().forEach { it.release() }
            leaving.clear()
        }
    }

    private fun retire(channel: Channel?, fadeMs: Long) {
        if (channel == null) return
        leaving.add(channel)
        channel.fadeTo(0f, fadeMs) {
            channel.release()
            leaving.remove(channel)
        }
    }

    private inner class Channel(
        private val uris: List<String>,
        private var volume: Float,
        shuffle: Boolean,
    ) {
        private val order: List<Int> =
            if (shuffle) uris.indices.shuffled() else uris.indices.toList()
        private var cursor = 0
        private var player: MediaPlayer? = null
        private var prepared = false
        private var wantsPlaying = true
        private var level = 0f
        private var ramp: Runnable? = null
        private var failedInRow = 0
        private var released = false

        fun start() {
            released = false
            startTrack()
        }

        fun setVolume(value: Float) {
            volume = value
            applyVolume()
        }

        fun pause(fadeMs: Long) {
            wantsPlaying = false
            fadeTo(0f, fadeMs) {
                val active = player
                if (!released && active != null && prepared && active.isPlaying) {
                    try {
                        active.pause()
                    } catch (_: IllegalStateException) {
                        // Being torn down.
                    }
                }
            }
        }

        fun resume(fadeMs: Long) {
            wantsPlaying = true
            val active = player
            if (active != null && prepared) {
                try {
                    if (!active.isPlaying) active.start()
                } catch (_: IllegalStateException) {
                    // Being torn down.
                }
            }
            fadeTo(1f, fadeMs)
        }

        /** Moves the fade level to [target] over [durationMs], then runs [done]. */
        fun fadeTo(target: Float, durationMs: Long, done: (() -> Unit)? = null) {
            ramp?.let { handler.removeCallbacks(it) }
            ramp = null
            if (durationMs <= 0) {
                level = target
                applyVolume()
                done?.invoke()
                return
            }
            val from = level
            val steps = (durationMs / STEP_MS).toInt().coerceAtLeast(1)
            var step = 0
            val runnable = object : Runnable {
                override fun run() {
                    step += 1
                    level = from + (target - from) * step / steps
                    applyVolume()
                    if (step < steps) {
                        handler.postDelayed(this, STEP_MS)
                    } else {
                        ramp = null
                        done?.invoke()
                    }
                }
            }
            ramp = runnable
            handler.post(runnable)
        }

        fun release() {
            released = true
            ramp?.let { handler.removeCallbacks(it) }
            ramp = null
            releasePlayer()
        }

        private fun applyVolume() {
            try {
                player?.setVolume(volume * level, volume * level)
            } catch (_: IllegalStateException) {
                // Applied again when the next track starts.
            }
        }

        private fun startTrack() {
            releasePlayer()
            val uri = uris.getOrNull(order.getOrNull(cursor) ?: return) ?: return
            val mediaPlayer = MediaPlayer()
            player = mediaPlayer
            prepared = false
            try {
                mediaPlayer.setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build(),
                )
                mediaPlayer.setWakeMode(context, PowerManager.PARTIAL_WAKE_LOCK)
                mediaPlayer.setDataSource(context, Uri.parse(uri))
                mediaPlayer.setVolume(volume * level, volume * level)
                mediaPlayer.isLooping = uris.size == 1
                mediaPlayer.setOnPreparedListener { ready ->
                    if (player === ready && !released) {
                        prepared = true
                        failedInRow = 0
                        if (wantsPlaying) ready.start()
                    }
                }
                mediaPlayer.setOnCompletionListener { finished ->
                    if (player === finished && !released) {
                        cursor = (cursor + 1) % order.size
                        startTrack()
                    }
                }
                mediaPlayer.setOnErrorListener { failed, _, _ ->
                    if (player === failed && !released) handleTrackError("Playback error")
                    true
                }
                mediaPlayer.prepareAsync()
            } catch (e: Exception) {
                handleTrackError(e.message ?: "Unable to open track")
            }
        }

        private fun handleTrackError(message: String) {
            failedInRow += 1
            if (failedInRow >= uris.size) {
                releasePlayer()
                onError(message)
            } else {
                cursor = (cursor + 1) % order.size
                startTrack()
            }
        }

        private fun releasePlayer() {
            val active = player
            player = null
            prepared = false
            if (active != null) {
                try {
                    active.setOnPreparedListener(null)
                    active.setOnCompletionListener(null)
                    active.setOnErrorListener(null)
                    active.release()
                } catch (_: Exception) {
                    // Nothing left to clean up.
                }
            }
        }
    }

    companion object {
        private const val STEP_MS = 50L
    }
}
