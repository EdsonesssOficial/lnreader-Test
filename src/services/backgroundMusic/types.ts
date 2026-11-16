import type { MusicRepeatMode } from '@modules/native-background-music';

export type { MusicRepeatMode };

export interface MusicSource {
  /** Stable key: `folder:<uri>` or `file:<uri>`. */
  id: string;
  type: 'folder' | 'file';
  uri: string;
  name: string;
}

export interface EqualizerSettings {
  enabled: boolean;
  /** Millibels (1 dB = 100), one per band of the device equalizer. */
  levels: number[];
  /** Device preset the levels came from; cleared on manual changes. */
  preset?: number;
}

export interface BackgroundMusicSettings {
  enabled: boolean;
  sources: MusicSource[];
  /** 0..1 */
  volume: number;
  /** 0.5..2 */
  pitch: number;
  /** 0.5..2 */
  speed: number;
  repeat: MusicRepeatMode;
  shuffle: boolean;
  equalizer: EqualizerSettings;
  /** 0..1000 */
  bassBoost: number;
}

export const defaultBackgroundMusicSettings: BackgroundMusicSettings = {
  enabled: false,
  sources: [],
  volume: 0.4,
  pitch: 1,
  speed: 1,
  repeat: 'all',
  shuffle: false,
  equalizer: { enabled: false, levels: [] },
  bassBoost: 0,
};

export const normalizeBackgroundMusicSettings = (
  stored?: Partial<BackgroundMusicSettings>,
): BackgroundMusicSettings => ({
  ...defaultBackgroundMusicSettings,
  ...stored,
  sources: stored?.sources ?? [],
  equalizer: {
    ...defaultBackgroundMusicSettings.equalizer,
    ...stored?.equalizer,
    levels: stored?.equalizer?.levels ?? [],
  },
});

/** Identifies the equalizer curve, so effects can react to level changes. */
export const getEqualizerSignature = (equalizer: EqualizerSettings): string =>
  `${equalizer.enabled}:${equalizer.levels.join(',')}`;

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
