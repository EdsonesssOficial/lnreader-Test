import { NativeModule, requireNativeModule } from 'expo-modules-core';

export type MusicTrack = {
  uri: string;
  name: string;
};

export type MusicRepeatMode = 'off' | 'all' | 'one';

type NativeBackgroundMusicEvents = {
  onTrackChanged: (event: { index: number; uri: string }) => void;
  onEnded: () => void;
  onError: (event: { message: string }) => void;
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
  setRepeat(mode: MusicRepeatMode): void;
  setShuffle(enabled: boolean): void;
  /** Releases the player and clears the queue. */
  release(): void;
}

export default requireNativeModule<NativeBackgroundMusicModule>(
  'NativeBackgroundMusic',
);
