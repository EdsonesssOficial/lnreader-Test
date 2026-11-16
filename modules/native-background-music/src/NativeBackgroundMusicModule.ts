import { NativeModule, requireNativeModule } from 'expo-modules-core';

export type MusicTrack = {
  uri: string;
  name: string;
};

export type MusicRepeatMode = 'off' | 'all' | 'one';

export type EqualizerInfo = {
  bands: { /** Hz */ centerFrequency: number }[];
  /** millibels (1 dB = 100) */
  minLevel: number;
  maxLevel: number;
  presets: string[];
  bassBoostSupported: boolean;
};

type NativeBackgroundMusicEvents = {
  onTrackChanged: (event: { index: number; uri: string }) => void;
  onEnded: () => void;
  onError: (event: { message: string }) => void;
  onAmbientError: (event: { message: string }) => void;
};

declare class NativeBackgroundMusicModule extends NativeModule<NativeBackgroundMusicEvents> {
  /** Opens the system picker (multi-select) and persists read access. */
  pickAudioFiles(): Promise<MusicTrack[]>;
  /** Lists the audio files of a folder previously returned by a SAF picker. */
  listTracks(treeUri: string, recursive: boolean): Promise<MusicTrack[]>;
  /** Replaces the queue. Does not start playback; call `play()`. */
  setQueue(uris: string[], startIndex: number, shuffle: boolean): void;
  play(): void;
  pause(): void;
  /** Releases the current track; the queue is kept. */
  stop(): void;
  next(): void;
  previous(): void;
  /** 0..1 */
  setVolume(volume: number): void;
  /** 0.5..2, independent from speed */
  setPitch(pitch: number): void;
  /** 0.5..2, independent from pitch on devices that support it */
  setSpeed(speed: number): void;
  setRepeat(mode: MusicRepeatMode): void;
  setShuffle(enabled: boolean): void;
  /** Band layout of the hardware equalizer, or null when unsupported. */
  getEqualizerInfo(): EqualizerInfo | null;
  /** `levels` are millibels, one per band. */
  setEqualizer(enabled: boolean, levels: number[]): void;
  /** Levels (millibels) of a device preset. */
  getPresetLevels(index: number): number[];
  /** 0..1000, 0 disables the effect. */
  setBassBoost(strength: number): void;
  /**
   * Plays an ambient sound (one track looping, or the tracks in sequence)
   * next to the music, replacing the current one with a cross-fade.
   */
  playAmbient(
    uris: string[],
    volume: number,
    fadeMs: number,
    shuffle: boolean,
  ): void;
  stopAmbient(fadeMs: number): void;
  pauseAmbient(fadeMs: number): void;
  resumeAmbient(fadeMs: number): void;
  /** 0..1 */
  setAmbientVolume(volume: number): void;
  /** Releases the player and clears the queue. */
  release(): void;
}

export default requireNativeModule<NativeBackgroundMusicModule>(
  'NativeBackgroundMusic',
);
