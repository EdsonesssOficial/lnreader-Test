import { RefObject, useEffect, useRef } from 'react';

import type { TtsPlaybackState } from '@modules/nitro-tts';
import { ambientController } from '@services/ambient/ambientController';
import { getSourcesSignature } from '@services/backgroundMusic/types';
import type { TtsAmbient } from '@services/ttsCharacters/types';

/**
 * Plays the ambient sound assigned to the passage the voice is reading, and
 * fades it out when the passage has none.
 *
 * `ambientQueueRef` holds the ambient id (or null) of every queue item, in the
 * same order as the native TTS queue.
 */
export const useTtsAmbient = (
  ttsState: TtsPlaybackState,
  progressIndex: number,
  ambientQueueRef: RefObject<(string | null)[]>,
  ambients?: TtsAmbient[],
) => {
  const ambientsRef = useRef(ambients);
  useEffect(() => {
    ambientsRef.current = ambients;
  });

  // Re-evaluates when an ambient sound is edited while it is playing.
  const signature = (ambients ?? [])
    .map(
      ambient =>
        `${ambient.id}:${getSourcesSignature(ambient.sources)}:` +
        `${ambient.volume}:${ambient.shuffle}`,
    )
    .join('|');

  useEffect(() => {
    if (ttsState === 'playing') {
      const id = ambientQueueRef.current?.[progressIndex];
      ambientController.sync(
        id ? ambientsRef.current?.find(item => item.id === id) : undefined,
      );
    } else if (ttsState === 'paused') {
      ambientController.pause();
    } else if (ttsState !== 'loading') {
      ambientController.stop();
    }
  }, [ttsState, progressIndex, signature, ambientQueueRef]);

  useEffect(
    () => () => {
      ambientController.reset();
    },
    [],
  );
};
