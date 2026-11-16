import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Dialog, List, Slider } from '@components';

import { useTheme } from '@hooks/persisted';
import { backgroundMusicController } from '@services/backgroundMusic/backgroundMusicController';
import type { BackgroundMusicSettings } from '@services/backgroundMusic/types';
import ReaderSheetPreferenceItem from './ReaderSheetPreferenceItem';

interface MusicEqualizerSectionProps {
  music: BackgroundMusicSettings;
  update: (values: Partial<BackgroundMusicSettings>) => void;
}

const formatFrequency = (hz: number) =>
  hz >= 1000 ? `${parseFloat((hz / 1000).toFixed(1))} kHz` : `${hz} Hz`;

const formatDecibels = (millibels: number) => {
  const decibels = millibels / 100;
  return `${decibels > 0 ? '+' : ''}${decibels.toFixed(1)} dB`;
};

const MusicEqualizerSection: React.FC<MusicEqualizerSectionProps> = ({
  music,
  update,
}) => {
  const theme = useTheme();
  // Read once: the band layout never changes while the app is running.
  const [info] = useState(() => backgroundMusicController.getEqualizerInfo());
  const [presetsVisible, setPresetsVisible] = useState(false);

  if (!info) {
    return null;
  }

  const equalizer = music.equalizer;
  const levels = info.bands.map((_, index) => equalizer.levels[index] ?? 0);
  const presetName =
    equalizer.preset !== undefined ? info.presets[equalizer.preset] : undefined;

  const toggle = () =>
    update({
      equalizer: { ...equalizer, enabled: !equalizer.enabled, levels },
    });

  const setBand = (index: number, decibels: number) => {
    const next = [...levels];
    next[index] = Math.round(decibels * 100);
    update({ equalizer: { enabled: equalizer.enabled, levels: next } });
  };

  const reset = () =>
    update({
      equalizer: { enabled: equalizer.enabled, levels: levels.map(() => 0) },
    });

  const selectPreset = (index: number) => {
    const presetLevels = backgroundMusicController.getPresetLevels(index);
    if (presetLevels.length > 0) {
      update({
        equalizer: { enabled: true, levels: presetLevels, preset: index },
      });
    }
    setPresetsVisible(false);
  };

  return (
    <>
      <ReaderSheetPreferenceItem
        label="Equalizer"
        description="Uses the device's hardware effect, so it costs almost no CPU"
        value={equalizer.enabled}
        onPress={toggle}
        theme={theme}
      />

      {equalizer.enabled ? (
        <>
          {info.presets.length > 0 ? (
            <List.Item
              title="Preset"
              description={presetName ?? 'Custom'}
              onPress={() => setPresetsVisible(true)}
              right="chevron-right"
              theme={theme}
            />
          ) : null}

          {info.bands.map((band, index) => (
            <View key={band.centerFrequency} style={styles.sliderSection}>
              <Text style={[styles.sliderLabel, { color: theme.onSurface }]}>
                {formatFrequency(band.centerFrequency)}:{' '}
                {formatDecibels(levels[index])}
              </Text>
              <Slider
                value={levels[index] / 100}
                min={info.minLevel / 100}
                max={info.maxLevel / 100}
                step={0.5}
                showValueIndicator
                formatValue={value => `${value.toFixed(1)} dB`}
                accessibilityLabel={`Equalizer ${formatFrequency(
                  band.centerFrequency,
                )}`}
                onSlidingComplete={value => setBand(index, value)}
              />
            </View>
          ))}

          <List.Item
            title="Reset equalizer"
            description="Set every band back to 0 dB"
            onPress={reset}
            theme={theme}
          />
        </>
      ) : null}

      {info.bassBoostSupported ? (
        <View style={styles.sliderSection}>
          <Text style={[styles.sliderLabel, { color: theme.onSurface }]}>
            Bass boost: {Math.round(music.bassBoost / 10)}%
          </Text>
          <Slider
            value={music.bassBoost / 10}
            min={0}
            max={100}
            step={5}
            showValueIndicator
            formatValue={value => `${Math.round(value)}%`}
            accessibilityLabel="Background music bass boost"
            onSlidingComplete={value =>
              update({ bassBoost: Math.round(value * 10) })
            }
          />
        </View>
      ) : null}

      <Dialog.Root
        visible={presetsVisible}
        onDismiss={() => setPresetsVisible(false)}
        surfaceStyle={styles.modalContent}
      >
        <Dialog.Title>Equalizer preset</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView style={styles.presetList}>
            {info.presets.map((name, index) => (
              <Pressable
                key={name}
                style={[
                  styles.presetItem,
                  equalizer.preset === index && {
                    backgroundColor: theme.surfaceVariant,
                  },
                ]}
                onPress={() => selectPreset(index)}
              >
                <Text style={[styles.presetName, { color: theme.onSurface }]}>
                  {name}
                </Text>
                {equalizer.preset === index ? (
                  <Text style={{ color: theme.primary }}>✓</Text>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Dialog.Action onPress={() => setPresetsVisible(false)}>
            Cancel
          </Dialog.Action>
        </Dialog.Actions>
      </Dialog.Root>
    </>
  );
};

export default React.memo(MusicEqualizerSection);

const styles = StyleSheet.create({
  sliderSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sliderLabel: {
    fontSize: 16,
    marginBottom: 8,
  },
  modalContent: {
    maxHeight: '80%',
  },
  presetList: {
    maxHeight: 350,
    marginTop: 8,
  },
  presetItem: {
    borderCurve: 'continuous',
    borderRadius: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    marginBottom: 4,
  },
  presetName: {
    fontSize: 16,
  },
});
