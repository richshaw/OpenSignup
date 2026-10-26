/**
 * Latin letters NFKD leaves whole, so stripping accents can't reach them.
 * Without this, "Smørrebrød" came out as `sm-rrebr-d`.
 */
const SPELLED: Readonly<Record<string, string>> = {
  ø: 'o',
  Ø: 'O',
  æ: 'ae',
  Æ: 'AE',
  œ: 'oe',
  Œ: 'OE',
  ß: 'ss',
  ẞ: 'SS',
  ł: 'l',
  Ł: 'L',
  đ: 'd',
  Đ: 'D',
  þ: 'th',
  Þ: 'TH',
  ð: 'd',
  Ð: 'D',
};
const SPELLED_LETTER = new RegExp(`[${Object.keys(SPELLED).join('')}]`, 'g');

/**
 * Lowercase kebab-case with accents stripped: the text rule behind signup
 * slugs and field refs. No Node imports, so the builder can use it too.
 * Other scripts (Cyrillic, Greek, Chinese) come out empty and callers fall
 * back to a fixed word.
 */
export function toKebab(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(SPELLED_LETTER, (letter) => SPELLED[letter] ?? letter)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
