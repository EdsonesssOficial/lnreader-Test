import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { IconButton } from 'react-native-paper';
import { Dialog, List, Slider } from '@components';

import { useChapterReaderSettings, useTheme } from '@hooks/persisted';
import {
  backgroundMusicController,
  useBackgroundMusicStore,
} from '@services/backgroundMusic/backgroundMusicController';
import {
  BackgroundMusicSettings,
  MusicRepeatMode,
  MusicSource,
  mergeSources,
  normalizeBackgroundMusicSettings,
} from '@services/backgroundMusic/types';
import ReaderSheetPreferenceItem from './ReaderSheetPreferenceItem';

const REPEAT_ORDER: MusicRepeatMode[] = ['off', 'all', 'one'];
const REPEAT_LABELS: Record<MusicRepeatMode, string> = {
  off: 'Off',
  all: 'Repeat all',
  one: 'Repeat current track',
};

interface SourcesModalProps {
  visible: boolean;
  onDismiss: () => void;
  sources: MusicSource[];
  onAddFolder: () => void;
  onAddFiles: () => void;
  onRemove: (id: string) => void;
}

const SourcesModal: React.FC<SourcesModalProps> = ({
  visible,
  onDismiss,
  sources,
  onAddFolder,
  onAddFiles,
  onRemove,
}) => {
  const theme = useTheme();

  return (
    <Dialog.Root
      visible={visible}
      onDismiss={onDismiss}
      surfaceStyle={styles.modalContent}
    >
      <Dialog.Title>Music sources</Dialog.Title>
      <Dialog.ScrollArea>
        <ScrollView style={styles.sourceList}>
          <Pressable style={styles.sourceItem} onPress={onAddFolder}>
            <Text style={[styles.sourceAction, { color: theme.primary }]}>
              + Add folder
            </Text>
          </Pressable>
          <Pressable style={styles.sourceItem} onPress={onAddFiles}>
            <Text style={[styles.sourceAction, { color: theme.primary }]}>
              + Add songs
            </Text>
          </Pressable>
          {sources.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.onSurfaceVariant }]}>
              No folders or songs added yet
            </Text>
          ) : (
            sources.map(source => (
              <View key={source.id} style={styles.sourceItem}>
                <View style={styles.sourceInfo}>
                  <Text
                    numberOfLines={1}
                    style={[styles.sourceName, { color: theme.onSurface }]}
                  >
                    {source.name}
                  </Text>
                  <Text
                    style={[
                      styles.sourceType,
                      { color: theme.onSurfaceVariant },
                    ]}
                  >
                    {source.type === 'folder' ? 'Folder' : 'Song'}
                  </Text>
                </View>
                <IconButton
                  icon="close"
                  size={20}
                  iconColor={theme.onSurfaceVariant}
                  accessibilityLabel={`Remove ${source.name}`}
                  onPress={() => onRemove(source.id)}
                />
              </View>
            ))
          )}
        </ScrollView>
      </Dialog.ScrollArea>
      <Dialog.Actions>
        <Dialog.Action onPress={onDismiss}>Close</Dialog.Action>
      </Dialog.Actions>
    </Dialog.Root>
  );
};

const BackgroundMusicSection: React.FC = () => {
  const theme = useTheme();
  const { tts, setChapterReaderSettings } = useChapterReaderSettings();
  const { trackName, trackCount, error } = useBackgroundMusicStore();
  const [sourcesVisible, setSourcesVisible] = useState(false);

  const music = normalizeBackgroundMusicSettings(tts?.backgroundMusic);

  const update = (values: Partial<BackgroundMusicSettings>) => {
    setChapterReaderSettings({
      tts: { ...tts, backgroundMusic: { ...music, ...values } },
    });
  };

  const addFolder = async () => {
    const folder = await backgroundMusicController.pickFolder();
    if (folder) {
      update({ sources: mergeSources(music.sources, [folder]) });
    }
  };

  const addFiles = async () => {
    const files = await backgroundMusicController.pickFiles();
    if (files.length > 0) {
      update({ sources: mergeSources(music.sources, files) });
    }
  };

  const removeSource = (id: string) => {
    update({ sources: music.sources.filter(source => source.id !== id) });
  };

  const cycleRepeat = () => {
    const index = REPEAT_ORDER.indexOf(music.repeat);
    update({ repeat: REPEAT_ORDER[(index + 1) % REPEAT_ORDER.length] });
  };

  return (
    <>
      <List.SubHeader theme={theme}>Background music</List.SubHeader>

      <ReaderSheetPreferenceItem
        label="Play background music"
        description="Plays softly underneath the voice while TTS is reading"
        value={music.enabled}
        onPress={() => update({ enabled: !music.enabled })}
        theme={theme}
      />

      {music.enabled ? (
        <>
          <List.Item
            title="Music sources"
            description={
              music.sources.length === 0
                ? 'No folders or songs selected'
                : `${music.sources.length} selected`
            }
            onPress={() => setSourcesVisible(true)}
            right="chevron-right"
            theme={theme}
          />

          <View style={styles.sliderSection}>
            <Text style={[styles.sliderLabel, { color: theme.onSurface }]}>
              Music volume: {Math.round(music.volume * 100)}%
            </Text>
            <Slider
              value={music.volume}
              min={0}
              max={1}
              step={0.05}
              showValueIndicator
              formatValue={value => `${Math.round(value * 100)}%`}
              accessibilityLabel="Background music volume"
              onSlidingComplete={value => update({ volume: value })}
            />
          </View>

          <View style={styles.sliderSection}>
            <Text style={[styles.sliderLabel, { color: theme.onSurface }]}>
              Music pitch: {music.pitch.toFixed(2)}
            </Text>
            <Slider
              value={music.pitch}
              min={0.5}
              max={2}
              step={0.05}
              showValueIndicator
              formatValue={value => value.toFixed(2)}
              accessibilityLabel="Background music pitch"
              onSlidingComplete={value => update({ pitch: value })}
            />
          </View>

          <List.Item
            title="Repeat"
            description={REPEAT_LABELS[music.repeat]}
            onPress={cycleRepeat}
            theme={theme}
          />

          <ReaderSheetPreferenceItem
            label="Shuffle"
            value={music.shuffle}
            onPress={() => update({ shuffle: !music.shuffle })}
            theme={theme}
          />

          <View style={styles.playerRow}>
            <View style={styles.playerInfo}>
              <Text
                numberOfLines={1}
                style={[styles.sliderLabel, { color: theme.onSurface }]}
              >
                {trackName ?? 'Starts with the voice'}
              </Text>
              <Text
                style={[
                  styles.sourceType,
                  { color: error ? theme.error : theme.onSurfaceVariant },
                ]}
              >
                {error ?? (trackCount > 0 ? `${trackCount} tracks` : ' ')}
              </Text>
            </View>
            <IconButton
              icon="skip-previous"
              iconColor={theme.onSurface}
              disabled={trackCount === 0}
              accessibilityLabel="Previous track"
              onPress={() => backgroundMusicController.previous()}
            />
            <IconButton
              icon="skip-next"
              iconColor={theme.onSurface}
              disabled={trackCount === 0}
              accessibilityLabel="Next track"
              onPress={() => backgroundMusicController.next()}
            />
          </View>

          <SourcesModal
            visible={sourcesVisible}
            onDismiss={() => setSourcesVisible(false)}
            sources={music.sources}
            onAddFolder={addFolder}
            onAddFiles={addFiles}
            onRemove={removeSource}
          />
        </>
      ) : null}
    </>
  );
};

export default React.memo(BackgroundMusicSection);

const styles = StyleSheet.create({
  sliderSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sliderLabel: {
    fontSize: 16,
    marginBottom: 8,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingStart: 16,
    paddingEnd: 8,
  },
  playerInfo: {
    flex: 1,
  },
  modalContent: {
    maxHeight: '80%',
  },
  sourceList: {
    maxHeight: 380,
    marginTop: 8,
  },
  sourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  sourceInfo: {
    flex: 1,
  },
  sourceName: {
    fontSize: 16,
  },
  sourceType: {
    fontSize: 12,
  },
  sourceAction: {
    fontSize: 16,
    paddingVertical: 4,
  },
  emptyText: {
    textAlign: 'center',
    padding: 20,
    fontSize: 14,
  },
});
