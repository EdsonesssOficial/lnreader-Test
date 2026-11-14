import type { MusicRepeatMode } from '@modules/native-background-music';

export type { MusicRepeatMode };

export interface MusicSource {
  /** Stable key: `folder:<uri>` or `file:<uri>`. */
  id: string;
  type: 'folder' | 'file';
  uri: string;
  name: string;
}

export interface BackgroundMusicSettings {
  enabled: boolean;
  sources: MusicSource[];
  /** 0..1 */
  volume: number;
  /** 0.5..2 */
  pitch: number;
  repeat: MusicRepeatMode;
  shuffle: boolean;
}

export const defaultBackgroundMusicSettings: BackgroundMusicSettings = {
  enabled: false,
  sources: [],
  volume: 0.4,
  pitch: 1,
  repeat: 'all',
  shuffle: false,
};

export const normalizeBackgroundMusicSettings = (
  stored?: Partial<BackgroundMusicSettings>,
): BackgroundMusicSettings => ({
  ...defaultBackgroundMusicSettings,
  ...stored,
  sources: stored?.sources ?? [],
});

/** Identifies the queue contents, ignoring playback options. */
export const getSourcesSignature = (sources: MusicSource[]): string =>
  sources.map(source => source.id).join('|');

export const mergeSources = (
  current: MusicSource[],
  added: MusicSource[],
): MusicSource[] => {
  const known = new Set(current.map(source => source.id));
  const merged = [...current];
  for (const source of added) {
    if (!known.has(source.id)) {
      known.add(source.id);
      merged.push(source);
    }
  }
  return merged;
};
