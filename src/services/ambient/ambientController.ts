import BackgroundMusic, { MusicTrack } from '@modules/native-background-music';
import { resolveTracks } from '@services/backgroundMusic/backgroundMusicController';
import { getSourcesSignature } from '@services/backgroundMusic/types';
import type { TtsAmbient } from '@services/ttsCharacters/types';

/** Cross-fade between ambient sounds. */
const FADE_MS = 1500;
/** Fade used when the voice pauses or resumes. */
const PAUSE_FADE_MS = 400;

const trackCache = new Map<string, MusicTrack[]>();
let currentAmbient: TtsAmbient | undefined;
let started = false;
let paused = false;
let requestId = 0;
let used = false;

export const ambientController = {
  async play(ambient: TtsAmbient) {
    const id = ++requestId;
    used = true;
    currentAmbient = ambient;
    started = false;
    paused = false;

    const key = `${ambient.id}:${getSourcesSignature(ambient.sources)}`;
    let tracks = trackCache.get(key);
    if (!tracks) {
      tracks = await resolveTracks(ambient.sources);
      if (id !== requestId) {
        return;
      }
      trackCache.set(key, tracks);
    }
    if (tracks.length === 0) {
      currentAmbient = undefined;
      return;
    }
    if (paused) {
      // Paused while the folder was being read: resume() starts it.
      return;
    }
    BackgroundMusic.playAmbient(
      tracks.map(track => track.uri),
      ambient.volume,
      FADE_MS,
      ambient.shuffle,
    );
    started = true;
  },

  /** Makes `ambient` the one playing; `undefined` fades the sound out. */
  sync(ambient?: TtsAmbient) {
    if (!ambient) {
      if (currentAmbient) {
        this.stop();
      }
      return;
    }
    if (currentAmbient?.id !== ambient.id) {
      void this.play(ambient);
      return;
    }
    currentAmbient = ambient;
    if (paused) {
      this.resume();
    } else if (started) {
      BackgroundMusic.setAmbientVolume(ambient.volume);
    }
  },

  pause() {
    if (!currentAmbient) {
      return;
    }
    paused = true;
    if (started) {
      BackgroundMusic.pauseAmbient(PAUSE_FADE_MS);
    }
  },

  resume() {
    if (!currentAmbient) {
      return;
    }
    paused = false;
    if (started) {
      BackgroundMusic.resumeAmbient(PAUSE_FADE_MS);
    } else {
      void this.play(currentAmbient);
    }
  },

  stop(fadeMs = FADE_MS) {
    requestId += 1;
    if (used) {
      BackgroundMusic.stopAmbient(fadeMs);
    }
    currentAmbient = undefined;
    started = false;
    paused = false;
  },

  /** Stops right away and forgets the folder listings. */
  reset() {
    this.stop(0);
    trackCache.clear();
  },
};
