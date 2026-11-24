import { describe, expect, it } from 'vitest';
import { isEmbedPath, slugFromSignupPath } from './signup-path';
import { toSlug } from './slug';

describe('slugFromSignupPath', () => {
  it.each([
    ['/s/snack-duty-4k7qz', 'snack-duty-4k7qz'],
    ['/s/snack-duty-4k7qz/c/com_1', 'snack-duty-4k7qz'],
    ['/s/snack-duty-4k7qz/unsubscribe', 'snack-duty-4k7qz'],
    ['/s/snack-duty-4k7qz/', 'snack-duty-4k7qz'],
  ])('reads the slug in %s', (path, slug) => {
    expect(slugFromSignupPath(path)).toBe(slug);
  });

  it('reads every slug toSlug makes', () => {
    for (const title of ['Snack duty', 'Smørrebrød & kaffe', 'Ålänningar', '2026!', '日本語']) {
      const slug = toSlug(title, { suffix: true });
      expect(slugFromSignupPath(`/s/${slug}`)).toBe(slug);
    }
  });

  it.each([
    null,
    '',
    '/',
    '/s',
    '/s/',
    '/s//c/com_1',
    '/app/signups/abc',
    '/x/s/snack-duty',
    's/snack-duty',
    '//s/snack-duty',
    '/s/Snack-Duty',
    '/s/snack%2Dduty',
    '/s/snack%00',
    '/s/%E0%A4%A',
    '/s/snack.rsc',
    '/s/snack duty',
    "/s/x'or'1'='1",
  ])('finds no slug in %j', (path) => {
    expect(slugFromSignupPath(path)).toBeNull();
  });
});

describe('isEmbedPath', () => {
  it('is true for a signup embed', () => {
    expect(isEmbedPath('/s/team-snacks-a7vc8/embed')).toBe(true);
  });

  it.each([
    null,
    '/s/team-snacks-a7vc8',
    '/s/team-snacks-a7vc8/embed/',
    '/s/team-snacks-a7vc8/embed/more',
    '/s/team-snacks-a7vc8/c/com_1/embed',
    '/s/Team%20Snacks/embed',
    '/app/embed',
  ])('is false for %j', (path) => {
    expect(isEmbedPath(path)).toBe(false);
  });
});
