import { describe, expect, it } from 'vitest';
import { toKebab } from './kebab';

describe('toKebab', () => {
  it('spells out letters that have no accent to strip', () => {
    expect(toKebab('Smørrebrød')).toBe('smorrebrod');
    expect(toKebab('Æblekage')).toBe('aeblekage');
    expect(toKebab('Straße')).toBe('strasse');
    expect(toKebab('Łódź')).toBe('lodz');
  });

  it.each([
    ['ø', 'o'],
    ['Ø', 'o'],
    ['æ', 'ae'],
    ['Æ', 'ae'],
    ['œ', 'oe'],
    ['Œ', 'oe'],
    ['ß', 'ss'],
    ['ẞ', 'ss'],
    ['ł', 'l'],
    ['Ł', 'l'],
    ['đ', 'd'],
    ['Đ', 'd'],
    ['þ', 'th'],
    ['Þ', 'th'],
    ['ð', 'd'],
    ['Ð', 'd'],
  ])('maps %s to %s', (letter, spelled) => {
    expect(toKebab(`a${letter}b`)).toBe(`a${spelled}b`);
  });

  it('maps a mapped letter that also carries an accent', () => {
    expect(toKebab('ǿ')).toBe('o');
  });

  it('strips accents from letters that decompose, as before', () => {
    expect(toKebab('Åsa och Märta på Öland')).toBe('asa-och-marta-pa-oland');
    expect(toKebab('Crèche rota — Été / Hiver')).toBe('creche-rota-ete-hiver');
  });

  it('leaves scripts it cannot spell in Latin letters empty', () => {
    expect(toKebab('Волонтёры')).toBe('');
    expect(toKebab('志愿者')).toBe('');
  });
});
