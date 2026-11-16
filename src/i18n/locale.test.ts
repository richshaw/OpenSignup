import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CATALOG_LOCALES } from './config';
import { ship } from './testing/ship';

// Unit tests have no DATABASE_URL, so the real getEnv() would throw.
const env = vi.hoisted(() => ({ DEFAULT_LOCALE: undefined as string | undefined }));
vi.mock('@/lib/env', () => ({ getEnv: () => env }));

const { localeOfOrganizer, localeOfSignup, newSignupLocale, signInLocale } =
  await import('./locale');

/** Every language with a catalog besides English, each tried in turn. */
const OTHER_LANGUAGES = CATALOG_LOCALES.filter((locale) => locale !== 'en');

afterEach(() => {
  env.DEFAULT_LOCALE = undefined;
  vi.unstubAllEnvs();
});

describe.each(OTHER_LANGUAGES)('localeOfSignup, with %s', (other) => {
  it('is English while only English has shipped to participants, whatever is stored', () => {
    env.DEFAULT_LOCALE = other;
    expect(localeOfSignup(other)).toBe('en');
    expect(localeOfSignup(undefined)).toBe('en');
  });

  it('is the stored language, else the instance’s, else English, once shipped to participants', () => {
    ship('participant', ['en', other]);
    expect(localeOfSignup(other)).toBe(other);
    expect(localeOfSignup(undefined)).toBe('en');
    env.DEFAULT_LOCALE = other;
    expect(localeOfSignup(undefined)).toBe(other);
    expect(localeOfSignup('xx')).toBe(other);
    expect(localeOfSignup('en')).toBe('en');
  });

  it('asks the participants’ list, not the organizers’', () => {
    ship('organizer', ['en', other]);
    expect(localeOfSignup(other)).toBe('en');
  });

  describe('on the e2e run’s server (E2E_UNSHIPPED_LOCALES)', () => {
    it('keeps a stored language that has a catalog and is listed, though it hasn’t shipped', () => {
      vi.stubEnv('E2E_UNSHIPPED_LOCALES', other);
      expect(localeOfSignup(other)).toBe(other);
      vi.stubEnv('E2E_UNSHIPPED_LOCALES', `xx,${other}`);
      expect(localeOfSignup(other)).toBe(other);
    });

    it.each([
      ['a language that isn’t listed', other, 'xx'],
      ['a language with no catalog', 'xx', 'xx'],
      ['another case', other.toUpperCase(), other],
      ['a region', `${other}-XX`, other],
      ['an empty list', other, ''],
    ])('falls back for %s', (_label, stored, listed) => {
      vi.stubEnv('E2E_UNSHIPPED_LOCALES', listed);
      expect(localeOfSignup(stored)).toBe('en');
    });

    // What a real instance could do with it: nothing, since it only keeps a
    // language already stored, and nothing in the app stores one that hasn't
    // shipped (services/signups.ts's `checkSignupLocale`, tested there).
    it('never makes a listed language the instance’s', () => {
      vi.stubEnv('E2E_UNSHIPPED_LOCALES', other);
      env.DEFAULT_LOCALE = other;
      expect(localeOfSignup(undefined)).toBe('en');
    });
  });
});

describe.each(OTHER_LANGUAGES)('localeOfOrganizer, with %s', (other) => {
  it('is English while only English has shipped to organizers, whatever the organizer stored', () => {
    env.DEFAULT_LOCALE = other;
    expect(localeOfOrganizer({ locale: other })).toBe('en');
    expect(localeOfOrganizer({ locale: null })).toBe('en');
    expect(localeOfOrganizer(null)).toBe('en');
  });

  it('is the stored language, else the instance’s, else English, once shipped to organizers', () => {
    ship('organizer', ['en', other]);
    expect(localeOfOrganizer({ locale: other })).toBe(other);
    expect(localeOfOrganizer({ locale: null })).toBe('en');
    env.DEFAULT_LOCALE = other;
    expect(localeOfOrganizer({ locale: null })).toBe(other);
    expect(localeOfOrganizer(null)).toBe(other);
    expect(localeOfOrganizer({ locale: 'xx' })).toBe(other);
    expect(localeOfOrganizer({ locale: 'en' })).toBe('en');
  });

  // The two lists ship together, but each screen asks its own.
  it('asks the organizers’ list, not the participants’', () => {
    ship('participant', ['en', other]);
    env.DEFAULT_LOCALE = other;
    expect(localeOfOrganizer({ locale: other })).toBe('en');
  });

  // So the e2e specs can see the organizer app in a language that hasn't
  // shipped, and nothing else changes with it.
  it('keeps a stored language the e2e run lists, and only for the organizer’s own screens', () => {
    vi.stubEnv('E2E_UNSHIPPED_LOCALES', other);
    expect(localeOfOrganizer({ locale: other })).toBe(other);
    expect(newSignupLocale({ locale: other })).toBeNull();
    env.DEFAULT_LOCALE = other;
    expect(localeOfOrganizer({ locale: null })).toBe('en');
    expect(localeOfOrganizer(null)).toBe('en');
    vi.stubEnv('E2E_UNSHIPPED_LOCALES', 'xx');
    expect(localeOfOrganizer({ locale: other })).toBe('en');
  });
});

describe.each(OTHER_LANGUAGES)('signInLocale, with %s', (other) => {
  it('is English while only English has shipped to organizers, whatever the instance sets', () => {
    expect(signInLocale()).toBe('en');
    env.DEFAULT_LOCALE = other;
    expect(signInLocale()).toBe('en');
  });

  it('is the instance’s DEFAULT_LOCALE once that has shipped to organizers, else English', () => {
    ship('organizer', ['en', other]);
    expect(signInLocale()).toBe('en');
    env.DEFAULT_LOCALE = other;
    expect(signInLocale()).toBe(other);
    env.DEFAULT_LOCALE = 'en';
    expect(signInLocale()).toBe('en');
  });

  it('asks the organizers’ list, not the participants’', () => {
    ship('participant', ['en', other]);
    env.DEFAULT_LOCALE = other;
    expect(signInLocale()).toBe('en');
  });

  // The e2e run's list only keeps a language stored on a row, and nobody
  // signing in has one yet.
  it('is not changed by the e2e run’s unshipped languages', () => {
    vi.stubEnv('E2E_UNSHIPPED_LOCALES', other);
    env.DEFAULT_LOCALE = other;
    expect(signInLocale()).toBe('en');
  });
});

describe.each(OTHER_LANGUAGES)('newSignupLocale, with %s', (other) => {
  it('chooses nothing while only English has shipped to participants, whatever the steps say', () => {
    env.DEFAULT_LOCALE = 'en';
    expect(newSignupLocale({ locale: 'en' })).toBeNull();
    expect(newSignupLocale({ locale: other })).toBeNull();
    expect(newSignupLocale({ locale: null })).toBeNull();
  });

  it('chooses nothing while a second language has shipped only to organizers', () => {
    ship('organizer', ['en', other]);
    expect(newSignupLocale({ locale: other })).toBeNull();
  });

  it('once there is a choice, is the organizer’s stored language, else the instance’s, else English', () => {
    ship('participant', ['en', other]);
    expect(newSignupLocale({ locale: other })).toEqual({ locale: other, source: 'setting' });
    expect(newSignupLocale({ locale: null })).toEqual({ locale: 'en', source: 'default' });
    env.DEFAULT_LOCALE = other;
    expect(newSignupLocale({ locale: null })).toEqual({ locale: other, source: 'instance' });
    expect(newSignupLocale({ locale: 'en' })).toEqual({ locale: 'en', source: 'setting' });
  });

  it('checks each step against the participants’ list, not the organizers’', () => {
    ship('participant', ['en', 'xx']);
    ship('organizer', ['en', other]);
    env.DEFAULT_LOCALE = other;
    expect(newSignupLocale({ locale: other })).toEqual({ locale: 'en', source: 'default' });
  });

  // A language the e2e run lists may be shown, never stored: createSignup
  // would refuse it. Here a second language has shipped, so there is a
  // choice, and an organizer stores a third that the run lists.
  it('never stores a language the e2e run lists', () => {
    ship('participant', ['en', 'xx']);
    vi.stubEnv('E2E_UNSHIPPED_LOCALES', other);
    expect(newSignupLocale({ locale: other })).toEqual({ locale: 'en', source: 'default' });
    env.DEFAULT_LOCALE = 'xx';
    expect(newSignupLocale({ locale: other })).toEqual({ locale: 'xx', source: 'instance' });
  });
});

/** Every source file under src/, tests left out, relative to the repo. */
function sourceFiles(dir = resolve(import.meta.dirname, '..')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|mjs|cjs)$/.test(entry.name) && !/\.test\./.test(entry.name)
      ? [relative(resolve(import.meta.dirname, '../..'), path)]
      : [];
  });
}

describe('E2E_UNSHIPPED_LOCALES', () => {
  // It shows a language that hasn't shipped, so it must stay where its
  // fence is: read in one private function (`keptForTests`), for showing
  // only, and named in the warning a process logs when it's set. A module
  // that read it anywhere else could start storing or offering one.
  it('is read only by src/i18n/locale.ts, and named in the start-up warning', () => {
    const readers = sourceFiles().filter((file) => {
      const code = readFileSync(resolve(import.meta.dirname, '../..', file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)\/\/.*$/gm, '');
      return code.includes('E2E_UNSHIPPED_LOCALES');
    });
    expect(readers.sort()).toEqual(['src/i18n/locale.ts', 'src/i18n/unshipped-warning.ts']);
  });
});
