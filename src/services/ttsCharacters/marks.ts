import { getMMKVObject, setMMKVObject } from '@utils/mmkv/mmkv';
import type { TtsCharacterMark } from './types';

const marksKey = (chapterId: number) => `TTS_CHARACTER_MARKS_${chapterId}`;

export const getChapterMarks = (chapterId: number): TtsCharacterMark[] =>
  getMMKVObject<TtsCharacterMark[]>(marksKey(chapterId)) ?? [];

const isMark = (value: unknown): value is TtsCharacterMark => {
  const mark = value as Partial<TtsCharacterMark> | null;
  return (
    !!mark &&
    typeof mark.block === 'number' &&
    typeof mark.start === 'number' &&
    typeof mark.end === 'number' &&
    typeof mark.text === 'string' &&
    typeof mark.char === 'string' &&
    (mark.layer === undefined ||
      mark.layer === 'character' ||
      mark.layer === 'ambient')
  );
};

/** Persists what the reader page reports; ignores malformed entries. */
export const saveChapterMarks = (chapterId: number, marks: unknown) => {
  const valid = Array.isArray(marks) ? marks.filter(isMark) : [];
  setMMKVObject(marksKey(chapterId), valid);
};
