import type { TtsVoice } from '@modules/nitro-tts';
import type { MusicSource } from '@services/backgroundMusic/types';

/**
 * A voice profile used to read the passages the user assigned to it. The
 * narrator is not a profile: it is the main TTS configuration, and it reads
 * everything that has no character.
 */
export interface TtsCharacter {
  id: string;
  name: string;
  /** `#rrggbb`, also used to tint the assigned text in the reader. */
  color: string;
  /** Voice of the main TTS engine; the narrator voice is used when absent. */
  voice?: TtsVoice;
  rate: number;
  pitch: number;
}

/**
 * An ambient sound: one or more tracks that play, looping, while the text
 * assigned to it is being read.
 */
export interface TtsAmbient {
  id: string;
  name: string;
  /** `#rrggbb`, also used to tint the assigned text in the reader. */
  color: string;
  sources: MusicSource[];
  /** 0..1 */
  volume: number;
  shuffle: boolean;
}

/** Which kind of assignment a mark is; marks without a layer are characters. */
export type MarkLayer = 'character' | 'ambient';

/**
 * A stretch of text assigned to a character or to an ambient sound. Offsets
 * are character positions inside the text of the `block`-th readable element
 * of the chapter. A character mark and an ambient mark may overlap.
 */
export interface TtsCharacterMark {
  block: number;
  start: number;
  end: number;
  /** Assigned text, used to re-anchor the mark if the chapter text shifts. */
  text: string;
  /** Id of the character, or of the ambient sound when `layer` is ambient. */
  char: string;
  layer?: MarkLayer;
}

/** What the reader paints over the text; all off shows the clean text. */
export interface MarkVisibility {
  characters: boolean;
  ambients: boolean;
  /**
   * Where both overlap: one blended color, or the character as highlight and
   * the ambient sound as an underline.
   */
  blend: boolean;
}

export const defaultMarkVisibility: MarkVisibility = {
  characters: true,
  ambients: true,
  blend: true,
};

export const AMBIENT_COLORS = [
  '#26A69A',
  '#42A5F5',
  '#AB47BC',
  '#FFA726',
  '#EF5350',
  '#66BB6A',
  '#8D6E63',
  '#78909C',
];

export const CHARACTER_COLORS = [
  '#E57373',
  '#F06292',
  '#BA68C8',
  '#7986CB',
  '#4FC3F7',
  '#4DB6AC',
  '#81C784',
  '#FFD54F',
  '#FFB74D',
  '#A1887F',
];

export const CHARACTER_RATE_RANGE = { min: 0.5, max: 3 };
export const CHARACTER_PITCH_RANGE = { min: 0.5, max: 2 };

/**
 * The native queue only carries `id` and `text` per paragraph, so the voice of
 * a character travels in the id: `index US voice US rate US pitch`.
 * The native player strips it back out before speaking.
 */
export const PARAGRAPH_FIELD_SEPARATOR = '\u001f';

export const encodeParagraphId = (
  index: number,
  character?: TtsCharacter,
): string => {
  if (!character) {
    return String(index);
  }
  return [
    String(index),
    character.voice?.identifier ?? '',
    String(character.rate),
    String(character.pitch),
  ].join(PARAGRAPH_FIELD_SEPARATOR);
};

const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;

export const createAmbient = (existing: TtsAmbient[]): TtsAmbient => {
  const used = new Set(existing.map(ambient => ambient.color));
  const color =
    AMBIENT_COLORS.find(candidate => !used.has(candidate)) ??
    AMBIENT_COLORS[existing.length % AMBIENT_COLORS.length];
  return {
    id: newId('amb'),
    name: `Ambient ${existing.length + 1}`,
    color,
    sources: [],
    volume: 0.4,
    shuffle: false,
  };
};

export const createCharacter = (
  existing: TtsCharacter[],
  defaults: { rate?: number; pitch?: number } = {},
): TtsCharacter => {
  const used = new Set(existing.map(character => character.color));
  const color =
    CHARACTER_COLORS.find(candidate => !used.has(candidate)) ??
    CHARACTER_COLORS[existing.length % CHARACTER_COLORS.length];
  return {
    id: newId('char'),
    name: `Character ${existing.length + 1}`,
    color,
    rate: defaults.rate ?? 1,
    pitch: defaults.pitch ?? 1,
  };
};
