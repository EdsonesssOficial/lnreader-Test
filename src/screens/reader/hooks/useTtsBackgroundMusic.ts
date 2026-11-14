import { useEffect, useRef } from 'react';

import type { TtsPlaybackState } from '@modules/nitro-tts';
import { backgroundMusicController } from '@services/backgroundMusic/backgroundMusicController';
import {
  BackgroundMusicSettings,
  getSourcesSignature,
  normalizeBackgroundMusicSettings,
} from '@services/backgroundMusic/types';

/** Avoids a pause/resume blip when TTS briefly leaves `playing`. */
const PAUSE_DEBOUNCE_MS = 400;

/**
 * Keeps the background music in step with the TTS session: it plays while the
 * voice is reading and pauses (without losing its position) otherwise.
 */
export const useTtsBackgroundMusic = (
  ttsState: TtsPlaybackState,
  stored?: Partial<BackgroundMusicSettings>,
) => {
  const settings = normalizeBackgroundMusicSettings(stored);
  const { enabled, volume, pitch, repeat, shuffle } = settings;
  const sourcesSignature = getSourcesSignature(settings.sources);

  const settingsRef = useRef(settings);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
  });

  useEffect(() => {
    if (enabled) {
      backgroundMusicController.applySettings(settingsRef.current);
    }
  }, [enabled, volume, pitch, repeat, shuffle]);

  useEffect(() => {
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    if (!enabled) {
      backgroundMusicController.stop();
    } else if (ttsState === 'playing') {
      void backgroundMusicController.play(settingsRef.current);
    } else if (ttsState !== 'loading') {
      pauseTimerRef.current = setTimeout(() => {
        backgroundMusicController.pause();
      }, PAUSE_DEBOUNCE_MS);
    }
  }, [enabled, ttsState, sourcesSignature]);

  useEffect(
    () => () => {
      if (pauseTimerRef.current) {
        clearTimeout(pauseTimerRef.current);
      }
      backgroundMusicController.stop();
    },
    [],
  );
};
