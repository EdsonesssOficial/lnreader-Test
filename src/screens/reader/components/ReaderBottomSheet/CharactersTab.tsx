import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { TextInput } from 'react-native-paper';
import { Dialog, List, Slider } from '@components';

import { Tts, TtsVoice } from '@modules/nitro-tts';
import { useChapterReaderSettings, useTheme } from '@hooks/persisted';
import {
  CHARACTER_COLORS,
  CHARACTER_PITCH_RANGE,
  CHARACTER_RATE_RANGE,
  TtsCharacter,
  createCharacter,
} from '@services/ttsCharacters/types';
import MarkVisibilitySection from './MarkVisibilitySection';
import { VoicePickerModal } from './TTSTab';

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const CharactersTab: React.FC = () => {
  const theme = useTheme();
  const { tts, setChapterReaderSettings } = useChapterReaderSettings();
  const characters = tts?.characters ?? [];

  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [draft, setDraft] = useState<TtsCharacter | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);

  // Character voices come from the engine selected in the TTS tab.
  const engineName = tts?.engine?.name;
  useEffect(() => {
    Tts.getVoices(engineName).then(result => {
      setVoices([...result].sort((a, b) => a.name.localeCompare(b.name)));
    });
  }, [engineName]);

  const saveCharacters = (next: TtsCharacter[]) =>
    setChapterReaderSettings({ tts: { ...tts, characters: next } });

  const startNew = () => {
    setDraft(
      createCharacter(characters, {
        rate: clamp(
          tts?.rate ?? 1,
          CHARACTER_RATE_RANGE.min,
          CHARACTER_RATE_RANGE.max,
        ),
      }),
    );
    setIsNew(true);
  };

  const startEdit = (character: TtsCharacter) => {
    setDraft(character);
    setIsNew(false);
  };

  const closeEditor = () => setDraft(null);

  const saveDraft = () => {
    if (!draft) {
      return;
    }
    const character = { ...draft, name: draft.name.trim() || 'Character' };
    saveCharacters(
      isNew
        ? [...characters, character]
        : characters.map(item => (item.id === character.id ? character : item)),
    );
    closeEditor();
  };

  const deleteDraft = () => {
    if (draft) {
      saveCharacters(characters.filter(item => item.id !== draft.id));
    }
    closeEditor();
  };

  const describe = (character: TtsCharacter) =>
    `${character.voice?.name ?? 'Narrator voice'} · ${character.rate.toFixed(
      2,
    )}x · pitch ${character.pitch.toFixed(2)}`;

  return (
    <BottomSheetScrollView contentContainerStyle={styles.content}>
      <Text style={[styles.hint, { color: theme.onSurfaceVariant }]}>
        Select text in the reader and choose "Script character" to read it with
        a character's voice. Text without a character is read by the narrator.
      </Text>

      <View style={styles.row}>
        <View style={[styles.dot, styles.narratorDot]} />
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: theme.onSurface }]}>
            Narrator
          </Text>
          <Text style={{ color: theme.onSurfaceVariant }}>
            Uses the voice, speed and pitch from the TTS tab
          </Text>
        </View>
      </View>

      {characters.map(character => (
        <Pressable
          key={character.id}
          style={styles.row}
          onPress={() => startEdit(character)}
        >
          <View style={[styles.dot, { backgroundColor: character.color }]} />
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: theme.onSurface }]}>
              {character.name}
            </Text>
            <Text style={{ color: theme.onSurfaceVariant }}>
              {describe(character)}
            </Text>
          </View>
        </Pressable>
      ))}

      <List.Item
        title="New character"
        description="Name, color, voice, speed and pitch"
        icon="plus"
        onPress={startNew}
        theme={theme}
      />

      <MarkVisibilitySection />

      <Dialog.Root
        visible={!!draft && !voiceModalVisible}
        onDismiss={closeEditor}
        surfaceStyle={styles.modalContent}
      >
        <Dialog.Title>
          {isNew ? 'New character' : 'Edit character'}
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
              theme={{ colors: { ...theme } }}
            />

            <Text style={[styles.label, { color: theme.onSurface }]}>
              Color
            </Text>
            <View style={styles.colors}>
              {CHARACTER_COLORS.map(color => (
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

            <List.Item
              title="Voice"
              description={draft?.voice?.name ?? 'Narrator voice'}
              onPress={() => setVoiceModalVisible(true)}
              right="chevron-right"
              theme={theme}
            />

            <Text style={[styles.label, { color: theme.onSurface }]}>
              Speed: {(draft?.rate ?? 1).toFixed(2)}x
            </Text>
            <Slider
              value={draft?.rate ?? 1}
              min={CHARACTER_RATE_RANGE.min}
              max={CHARACTER_RATE_RANGE.max}
              step={0.05}
              showValueIndicator
              formatValue={value => `${value.toFixed(2)}x`}
              accessibilityLabel="Character speed"
              onSlidingComplete={rate =>
                setDraft(current => current && { ...current, rate })
              }
            />

            <Text style={[styles.label, { color: theme.onSurface }]}>
              Pitch: {(draft?.pitch ?? 1).toFixed(2)}
            </Text>
            <Slider
              value={draft?.pitch ?? 1}
              min={CHARACTER_PITCH_RANGE.min}
              max={CHARACTER_PITCH_RANGE.max}
              step={0.05}
              showValueIndicator
              formatValue={value => value.toFixed(2)}
              accessibilityLabel="Character pitch"
              onSlidingComplete={pitch =>
                setDraft(current => current && { ...current, pitch })
              }
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

      <VoicePickerModal
        visible={voiceModalVisible}
        onDismiss={() => setVoiceModalVisible(false)}
        voices={voices}
        currentVoice={draft?.voice}
        onSelect={voice =>
          setDraft(current => current && { ...current, voice })
        }
      />
    </BottomSheetScrollView>
  );
};

export default React.memo(CharactersTab);

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
  narratorDot: {
    borderWidth: 2,
    borderColor: '#888888',
  },
  modalContent: {
    maxHeight: '85%',
  },
  editor: {
    maxHeight: 420,
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
});
