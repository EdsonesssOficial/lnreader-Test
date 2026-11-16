import React from 'react';
import { Alert } from 'react-native';
import { List } from '@components';

import { useChapterReaderSettings, useTheme } from '@hooks/persisted';
import {
  MarkVisibility,
  defaultMarkVisibility,
} from '@services/ttsCharacters/types';
import { useChapterContext } from '../../ChapterContext';
import ReaderSheetPreferenceItem from './ReaderSheetPreferenceItem';

/**
 * Controls which marks (character and ambient colors) the reader paints over
 * the text, and clears every mark of the open chapter.
 */
const MarkVisibilitySection: React.FC = () => {
  const theme = useTheme();
  const { tts, setChapterReaderSettings } = useChapterReaderSettings();
  const { webViewRef } = useChapterContext();

  const visibility: MarkVisibility = {
    ...defaultMarkVisibility,
    ...tts?.marksVisibility,
  };

  const update = (values: Partial<MarkVisibility>) => {
    setChapterReaderSettings({
      tts: { ...tts, marksVisibility: { ...visibility, ...values } },
    });
  };

  const clearMarks = () => {
    Alert.alert(
      'Clear all marks',
      'Remove every character and ambient mark from this chapter? ' +
        'The characters and ambient sounds themselves are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () =>
            webViewRef.current?.injectJavaScript(
              'window.ttsCharacters?.clearAll(); true;',
            ),
        },
      ],
    );
  };

  return (
    <>
      <List.SubHeader theme={theme}>Marks in the text</List.SubHeader>
      <ReaderSheetPreferenceItem
        label="Show character colors"
        description="Turn both colors off to see the clean text"
        value={visibility.characters}
        onPress={() => update({ characters: !visibility.characters })}
        theme={theme}
      />
      <ReaderSheetPreferenceItem
        label="Show ambient sound colors"
        value={visibility.ambients}
        onPress={() => update({ ambients: !visibility.ambients })}
        theme={theme}
      />
      <ReaderSheetPreferenceItem
        label="Blend colors where they overlap"
        description={
          'Off: the character is the highlight ' +
          'and the ambient sound an underline'
        }
        value={visibility.blend}
        onPress={() => update({ blend: !visibility.blend })}
        theme={theme}
      />
      <List.Item
        title="Clear all marks in this chapter"
        description="Removes every character and ambient mark"
        icon="delete-sweep"
        onPress={clearMarks}
        theme={theme}
      />
    </>
  );
};

export default React.memo(MarkVisibilitySection);
