import { Converter } from 'opencc-js';

const traditionalToSimplified = Converter({ from: 't', to: 'cn' });
// Candidates are full words, not interchangeable characters. Each still needs two votes.
const typoPairs: ReadonlyArray<readonly [string, string]> = [
  ['再接再厉', '再接再励'],
  ['迫不及待', '迫不急待'],
  ['一如既往', '一如继往'],
  ['明信片', '名信片'],
  ['图书馆', '图书管'],
  ['草莓', '草梅'],
  ['巧克力', '巧克立'],
  ['咖啡', '咖非'],
];
const pairKey = (a: string, b: string) => [a, b].sort().join('\0');
const candidates = new Set(typoPairs.map(([a, b]) => pairKey(a, b)));

export function normalizeWord(original: string) {
  return traditionalToSimplified(original.normalize('NFKC').trim().toLowerCase()
    .replace(/\p{White_Space}+/gu, ' ')
    .replace(/(?<=\p{Script=Han}) (?=\p{Script=Han})/gu, '')).normalize('NFC');
}

export function compareNormalized(a: string, b: string): 'matched' | 'candidate' | 'different' {
  if (a === b && a.length > 0) return 'matched';
  return candidates.has(pairKey(a, b)) ? 'candidate' : 'different';
}

export function matchWords(a: string, b: string) {
  return compareNormalized(normalizeWord(a), normalizeWord(b));
}
