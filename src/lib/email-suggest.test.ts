import { describe, expect, it } from 'vitest';
import { suggestEmail } from './email-suggest';

describe('suggestEmail', () => {
  it('suggests gmail.com for gmial.com', () => {
    expect(suggestEmail('test@gmial.com')).toBe('test@gmail.com');
  });

  it('suggests yahoo.com for yaho.com', () => {
    expect(suggestEmail('test@yaho.com')).toBe('test@yahoo.com');
  });

  it('suggests outlook.com for outllok.com', () => {
    expect(suggestEmail('test@outllok.com')).toBe('test@outlook.com');
  });

  it('returns null for known-good addresses', () => {
    expect(suggestEmail('a@gmail.com')).toBeNull();
    expect(suggestEmail('a@icloud.com')).toBeNull();
  });

  it('returns null when domain is too different', () => {
    expect(suggestEmail('a@my-domain.com')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(suggestEmail('nope')).toBeNull();
  });
});

describe('suggestEmail with a signup language', () => {
  it('suggests Swedish addresses on a Swedish signup', () => {
    expect(suggestEmail('test@hotmial.se', 'sv')).toBe('test@hotmail.se');
    expect(suggestEmail('test@lve.se', 'sv')).toBe('test@live.se');
    expect(suggestEmail('test@telia.cmo', 'sv')).toBe('test@telia.com');
    expect(suggestEmail('test@comhem.see', 'sv')).toBe('test@comhem.se');
  });

  it('leaves a known Swedish address alone on a Swedish signup', () => {
    for (const domain of ['hotmail.se', 'live.se', 'telia.com', 'bahnhof.se', 'gmail.com']) {
      expect(suggestEmail(`a@${domain}`, 'sv')).toBeNull();
    }
  });

  it('still suggests the international domains on a Swedish signup', () => {
    expect(suggestEmail('test@gmial.com', 'sv')).toBe('test@gmail.com');
  });

  it('knows no Swedish addresses on an English signup', () => {
    expect(suggestEmail('test@hotmial.se', 'en')).toBeNull();
    expect(suggestEmail('test@lve.se', 'en')).toBeNull();
    expect(suggestEmail('test@telia.cmo', 'en')).toBeNull();
    expect(suggestEmail('a@hotmail.se', 'en')).toBeNull();
  });

  it('gives an English signup the same hints as no language', () => {
    for (const email of [
      'test@gmial.com',
      'test@yaho.com',
      'test@outllok.com',
      'a@gmail.com',
      'a@my-domain.com',
      'nope',
    ]) {
      expect(suggestEmail(email, 'en')).toBe(suggestEmail(email));
    }
  });

  it('does not correct another country hotmail on an English signup', () => {
    expect(suggestEmail('a@hotmail.de', 'en')).toBeNull();
    expect(suggestEmail('a@hotmail.fr', 'en')).toBeNull();
  });
});
