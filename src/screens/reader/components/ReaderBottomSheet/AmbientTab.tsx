import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { IconButton, TextInput } from 'react-native-paper';
import { Dialog, List, Slider } from '@components';

import { useChapterReaderSettings, useTheme } from '@hooks/persisted';
import { backgroundMusicController } from '@services/backgroundMusic/backgroundMusicController';
import { mergeSources } from '@services/backgroundMusic/types';
import {
  AMBIENT_COLORS,
  TtsAmbient,
  createAmbient,
} from '@services/ttsCharacters/types';
import MarkVisibilitySection from './MarkVisibilitySection';
import ReaderSheetPreferenceItem from './ReaderSheetPreferenceItem';

const AmbientTab: React.FC = () => {
  const theme = useTheme();
  const { tts, setChapterReaderSettings } = useChapterReaderSettings();
  const ambients = tts?.ambients ?? [];

  const [draft, setDraft] = useState<TtsAmbient | null>(null);
  const [isNew, setIsNew] = useState(false);

  const saveAmbients = (next: TtsAmbient[]) =>
    setChapterReaderSettings({ tts: { ...tts, ambients: next } });

  const startNew = () => {
    setDraft(createAmbient(ambients));
    setIsNew(true);
  };

  const startEdit = (ambient: TtsAmbient) => {
    setDraft(ambient);
    setIsNew(false);
  };

  const closeEditor = () => setDraft(null);

  const saveDraft = () => {
    if (!draft) {
      return;
    }
    const ambient = { ...draft, name: draft.name.trim() || 'Ambient' };
    saveAmbients(
      isNew
        ? [...ambients, ambient]
        : ambients.map(item => (item.id === ambient.id ? ambient : item)),
    );
    closeEditor();
  };

  const deleteDraft = () => {
    if (draft) {
      saveAmbients(ambients.filter(item => item.id !== draft.id));
    }
    closeEditor();
  };

  const addFolder = async () => {
    const folder = await backgroundMusicController.pickFolder();
    if (folder) {
      setDraft(
        current =>
          current && {
            ...current,
            sources: mergeSources(current.sources, [folder]),
          },
      );
    }
  };

  const addFiles = async () => {
    const files = await backgroundMusicController.pickFiles();
    if (files.length > 0) {
      setDraft(
        current =>
          current && {
            ...current,
            sources: mergeSources(current.sources, files),
          },
      );
    }
  };

  const removeSource = (id: string) =>
    setDraft(
      current =>
        current && {
          ...current,
          sources: current.sources.filter(source => source.id !== id),
        },
    );

  const describe = (ambient: TtsAmbient) =>
    `${
      ambient.sources.length === 0
        ? 'No tracks'
        : `${ambient.sources.length} source${
            ambient.sources.length === 1 ? '' : 's'
          }`
    } · volume ${Math.round(ambient.volume * 100)}%`;

  return (
    <BottomSheetScrollView contentContainerStyle={styles.content}>
      <Text style={[styles.hint, { color: theme.onSurfaceVariant }]}>
        Select text in the reader and choose "Ambient sound" to play a sound
        while that passage is being read. It loops, fades in and out, and stops
        when the passage ends.
      </Text>

      {ambients.map(ambient => (
        <Pressable
          key={ambient.id}
          style={styles.row}
          onPress={() => startEdit(ambient)}
        >
          <View style={[styles.dot, { backgroundColor: ambient.color }]} />
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: theme.onSurface }]}>
              {ambient.name}
            </Text>
            <Text style={{ color: theme.onSurfaceVariant }}>
              {describe(ambient)}
            </Text>
          </View>
        </Pressable>
      ))}

      <List.Item
        title="New ambient sound"
        description="Name, color, tracks and volume"
        icon="plus"
        onPress={startNew}
        theme={theme}
      />

      <MarkVisibilitySection />

      <Dialog.Root
        visible={!!draft}
        onDismiss={closeEditor}
        surfaceStyle={styles.modalContent}
      >
        <Dialog.Title>
          {isNew ? 'New ambient sound' : 'Edit ambient sound'}
        </Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView style={styles.editor}>
            <TextInput
              mode="outlined"
              label="Name"
              value={draft?.name ?? ''}
              onChangeText={name =>
                setDraft(current => current && { ...current, name })
              }
              theme={{ colors: theme }}
            />

            <Text style={[styles.label, { color: theme.onSurface }]}>
              Color
            </Text>
            <View style={styles.colors}>
              {AMBIENT_COLORS.map(color => (
                <Pressable
                  key={color}
                  accessibilityLabel={`Color ${color}`}
                  onPress={() =>
                    setDraft(current => current && { ...current, color })
                  }
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: color },
                    draft?.color === color && {
                      borderColor: theme.onSurface,
                      borderWidth: 3,
                    },
                  ]}
                />
              ))}
            </View>

            <Text style={[styles.label, { color: theme.onSurface }]}>
              Tracks
            </Text>
            <Pressable style={styles.sourceRow} onPress={addFolder}>
              <Text style={[styles.sourceAction, { color: theme.primary }]}>
                + Add folder
              </Text>
            </Pressable>
            <Pressable style={styles.sourceRow} onPress={addFiles}>
              <Text style={[styles.sourceAction, { color: theme.primary }]}>
                + Add songs
              </Text>
            </Pressable>
            {(draft?.sources ?? []).map(source => (
              <View key={source.id} style={styles.sourceRow}>
                <View style={styles.rowText}>
                  <Text
                    numberOfLines={1}
                    style={[styles.rowTitle, { color: theme.onSurface }]}
                  >
                    {source.name}
                  </Text>
                  <Text style={{ color: theme.onSurfaceVariant }}>
                    {source.type === 'folder' ? 'Folder' : 'Song'}
                  </Text>
                </View>
                <IconButton
                  icon="close"
                  size={20}
                  iconColor={theme.onSurfaceVariant}
                  accessibilityLabel={`Remove ${source.name}`}
                  onPress={() => removeSource(source.id)}
                />
              </View>
            ))}

            <Text style={[styles.label, { color: theme.onSurface }]}>
              Volume: {Math.round((draft?.volume ?? 0.4) * 100)}%
            </Text>
            <Slider
              value={draft?.volume ?? 0.4}
              min={0}
              max={1}
              step={0.05}
              showValueIndicator
              formatValue={value => `${Math.round(value * 100)}%`}
              accessibilityLabel="Ambient sound volume"
              onSlidingComplete={volume =>
                setDraft(current => current && { ...current, volume })
              }
            />

            <ReaderSheetPreferenceItem
              label="Shuffle tracks"
              description="Only matters when there is more than one track"
              value={draft?.shuffle ?? false}
              onPress={() =>
                setDraft(
                  current =>
                    current && { ...current, shuffle: !current.shuffle },
                )
              }
              theme={theme}
            />
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          {!isNew ? (
            <Dialog.Action onPress={deleteDraft}>Delete</Dialog.Action>
          ) : null}
          <Dialog.Action onPress={closeEditor}>Cancel</Dialog.Action>
          <Dialog.Action onPress={saveDraft}>Save</Dialog.Action>
        </Dialog.Actions>
      </Dialog.Root>
    </BottomSheetScrollView>
  );
};

export default React.memo(AmbientTab);

const styles = StyleSheet.create({
  content: {
    paddingBottom: 24,
  },
  hint: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
  },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  modalContent: {
    maxHeight: '85%',
  },
  editor: {
    maxHeight: 440,
    marginTop: 8,
  },
  label: {
    fontSize: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  colors: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 0,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  sourceAction: {
    fontSize: 16,
    paddingVertical: 4,
  },
});
