import { describe, expect, it } from 'vitest';
import { urlBreakSegments } from './url-breaks';

describe('urlBreakSegments', () => {
  it('splits after /, -, ?, & and =, never inside a word', () => {
    expect(
      urlBreakSegments(
        'https://signup.example.org/s/bake-sale-volunteers-fsq80/c/com_1?token=tok&x=1',
      ),
    ).toEqual([
      'https://',
      'signup.example.org/',
      's/',
      'bake-',
      'sale-',
      'volunteers-',
      'fsq80/',
      'c/',
      'com_1?',
      'token=',
      'tok&',
      'x=',
      '1',
    ]);
  });

  it('keeps a run of break characters together, so :// stays whole', () => {
    expect(urlBreakSegments('https://a//b')).toEqual(['https://', 'a//', 'b']);
    expect(urlBreakSegments('//a-')).toEqual(['//', 'a-']);
  });

  it('joins back to exactly the URL, so a copy by hand still works', () => {
    const url = 'https://example.test/s/example-signup/c/com_1?token=abcDEF123';
    expect(urlBreakSegments(url).join('')).toBe(url);
  });

  it('leaves a string with no break points whole', () => {
    expect(urlBreakSegments('abcDEF123')).toEqual(['abcDEF123']);
    expect(urlBreakSegments('')).toEqual(['']);
  });
});
