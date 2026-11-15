import { describe, expect, it } from 'vitest';
import { matchWords, normalizeWord } from '../../server/matcher.ts';
import { wordSchema } from '../../server/validation.ts';

describe('word matcher', () => {
  it.each([
    [' Apple ', 'apple'], ['ＨＥＬＬＯ', 'hello'], ['老師', '老师'],
    ['老　 师', '老师'], ['café', 'cafe\u0301'], ['New   York', 'new york'],
  ])('normalizes %s and %s', (a, b) => {
    expect(matchWords(a, b)).toBe('matched');
  });

  it('preserves meaningful spaces and avoids automatic homophone matches', () => {
    expect(normalizeWord(' hot dog ')).toBe('hot dog');
    expect(matchWords('hot dog', 'hotdog')).toBe('different');
    expect(matchWords('colour', 'color')).toBe('different');
    expect(matchWords('老师', '老实')).toBe('different');
  });

  it('proposes curated typos in either seat', () => {
    expect(matchWords('图书管', '圖書館')).toBe('candidate');
    expect(matchWords('图书馆', '图书管')).toBe('candidate');
  });
});

describe('submission validation', () => {
  it.each(['', '   ', '　', '\u200b', '\u202E老师', 'a'.repeat(21)])('rejects invalid text %s', (word) => {
    expect(wordSchema.safeParse(word).success).toBe(false);
  });
  it('counts grapheme clusters and preserves the display string', () => {
    expect(wordSchema.parse('  👨‍👩‍👧‍👦  ')).toBe('  👨‍👩‍👧‍👦  ');
    expect(wordSchema.safeParse('é'.repeat(20)).success).toBe(true);
  });
});
