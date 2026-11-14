import { create } from 'zustand';

import NativeFile from '@modules/native-file';
import BackgroundMusic, { MusicTrack } from '@modules/native-background-music';
import { showToast } from '@utils/showToast';
import {
  BackgroundMusicSettings,
  MusicSource,
  getSourcesSignature,
} from './types';

interface BackgroundMusicState {
  trackName?: string;
  trackCount: number;
  error?: string;
}

export const useBackgroundMusicStore = create<BackgroundMusicState>(() => ({
  trackCount: 0,
}));

let tracks: MusicTrack[] = [];
let loadedSignature: string | undefined;
let requestId = 0;
let used = false;
let subscribed = false;

const stripExtension = (name: string) => name.replace(/\.[^./]+$/, '');

const subscribe = () => {
  if (subscribed) {
    return;
  }
  subscribed = true;
  BackgroundMusic.addListener('onTrackChanged', ({ index }) => {
    const track = tracks[index];
    useBackgroundMusicStore.setState({
      trackName: track ? stripExtension(track.name) : undefined,
      error: undefined,
    });
  });
  BackgroundMusic.addListener('onEnded', () => {
    useBackgroundMusicStore.setState({ trackName: undefined });
  });
  BackgroundMusic.addListener('onError', ({ message }) => {
    useBackgroundMusicStore.setState({ error: message });
  });
};

const resolveTracks = async (sources: MusicSource[]) => {
  const seen = new Set<string>();
  const resolved: MusicTrack[] = [];
  for (const source of sources) {
    let found: MusicTrack[];
    try {
      found =
        source.type === 'folder'
          ? await BackgroundMusic.listTracks(source.uri, true)
          : [{ uri: source.uri, name: source.name }];
    } catch {
      // Folder removed or access revoked: skip it, the others still play.
      found = [];
    }
    for (const track of found) {
      if (!seen.has(track.uri)) {
        seen.add(track.uri);
        resolved.push(track);
      }
    }
  }
  return resolved;
};

const applyPlaybackSettings = (settings: BackgroundMusicSettings) => {
  BackgroundMusic.setVolume(settings.volume);
  BackgroundMusic.setPitch(settings.pitch);
  BackgroundMusic.setRepeat(settings.repeat);
  BackgroundMusic.setShuffle(settings.shuffle);
};

const isCancellation = (error: unknown) =>
  (error as { code?: string } | undefined)?.code === 'ECANCELLED';

export const backgroundMusicController = {
  /** Starts or resumes the music; reloads the queue if sources changed. */
  async play(settings: BackgroundMusicSettings) {
    const id = ++requestId;
    if (!settings.enabled || settings.sources.length === 0) {
      this.stop();
      return;
    }
    used = true;
    subscribe();

    const signature = getSourcesSignature(settings.sources);
    if (signature !== loadedSignature) {
      const resolved = await resolveTracks(settings.sources);
      if (id !== requestId) {
        return;
      }
      if (resolved.length === 0) {
        useBackgroundMusicStore.setState({
          trackCount: 0,
          trackName: undefined,
          error: 'No audio files found in the selected sources',
        });
        return;
      }
      tracks = resolved;
      loadedSignature = signature;
      const startIndex = settings.shuffle
        ? Math.floor(Math.random() * resolved.length)
        : 0;
      BackgroundMusic.setQueue(
        resolved.map(track => track.uri),
        startIndex,
        settings.shuffle,
      );
      useBackgroundMusicStore.setState({
        trackCount: resolved.length,
        error: undefined,
      });
    }

    applyPlaybackSettings(settings);
    BackgroundMusic.play();
  },

  pause() {
    requestId += 1;
    if (used) {
      BackgroundMusic.pause();
    }
  },

  /** Releases the player and forgets the queue (folders are re-read later). */
  stop() {
    requestId += 1;
    if (!used) {
      return;
    }
    BackgroundMusic.stop();
    tracks = [];
    loadedSignature = undefined;
    useBackgroundMusicStore.setState({
      trackName: undefined,
      trackCount: 0,
      error: undefined,
    });
  },

  applySettings(settings: BackgroundMusicSettings) {
    if (used && settings.enabled) {
      applyPlaybackSettings(settings);
    }
  },

  next() {
    if (used) {
      BackgroundMusic.next();
    }
  },

  previous() {
    if (used) {
      BackgroundMusic.previous();
    }
  },

  async pickFolder(): Promise<MusicSource | undefined> {
    try {
      const { uri, name } = await NativeFile.pickDirectory();
      const source: MusicSource = {
        id: `folder:${uri}`,
        type: 'folder',
        uri,
        name,
      };
      return source;
    } catch (error) {
      if (!isCancellation(error)) {
        showToast(error instanceof Error ? error.message : String(error));
      }
      return undefined;
    }
  },

  async pickFiles(): Promise<MusicSource[]> {
    try {
      const picked = await BackgroundMusic.pickAudioFiles();
      return picked.map(
        (track): MusicSource => ({
          id: `file:${track.uri}`,
          type: 'file',
          uri: track.uri,
          name: track.name,
        }),
      );
    } catch (error) {
      if (!isCancellation(error)) {
        showToast(error instanceof Error ? error.message : String(error));
      }
      return [];
    }
  },
};
