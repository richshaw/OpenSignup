import { afterEach, describe, expect, it, vi } from 'vitest';
import { CATALOG_LOCALES } from './config';
import { ship } from './testing/ship';

// Unit tests have no DATABASE_URL, so the real getEnv() would throw.
const env = vi.hoisted(() => ({ DEFAULT_LOCALE: undefined as string | undefined }));
vi.mock('@/lib/env', () => ({ getEnv: () => env }));

const { getOrganizerAppLocale, getOrganizerLocale, newSignupLocale, signInLocale } =
  await import('./organizer');

/** Every language with a catalog besides English, each tried in turn. */
const OTHER_LANGUAGES = CATALOG_LOCALES.filter((locale) => locale !== 'en');

afterEach(() => {
  env.DEFAULT_LOCALE = undefined;
  vi.unstubAllEnvs();
});

describe.each(OTHER_LANGUAGES)('getOrganizerAppLocale, with %s', (other) => {
  it('is English while only English has shipped to organizers, whatever the organizer stored', () => {
    env.DEFAULT_LOCALE = other;
    expect(getOrganizerAppLocale({ locale: other })).toBe('en');
    expect(getOrganizerAppLocale({ locale: null })).toBe('en');
  });

  it('is the stored language, else the instance’s, else English, once shipped to organizers', () => {
    ship('organizer', ['en', other]);
    expect(getOrganizerAppLocale({ locale: other })).toBe(other);
    expect(getOrganizerAppLocale({ locale: null })).toBe('en');
    env.DEFAULT_LOCALE = other;
    expect(getOrganizerAppLocale({ locale: null })).toBe(other);
    expect(getOrganizerAppLocale({ locale: 'en' })).toBe('en');
  });

  // So the e2e specs can see the organizer app in a language that hasn't
  // shipped, and nothing else changes with it.
  it('keeps a stored language the e2e run lists, and only for the organizer’s own screens', () => {
    vi.stubEnv('E2E_UNSHIPPED_LOCALES', other);
    expect(getOrganizerAppLocale({ locale: other })).toBe(other);
    expect(getOrganizerLocale({ locale: other }, 'participant').locale).toBe('en');
    expect(getOrganizerLocale({ locale: other }, 'organizer').locale).toBe('en');
    expect(newSignupLocale({ locale: other })).toBeNull();
    env.DEFAULT_LOCALE = other;
    expect(getOrganizerAppLocale({ locale: null })).toBe('en');
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

describe.each(OTHER_LANGUAGES)('getOrganizerLocale, with %s', (other) => {
  it('is English while only English has shipped, whatever the organizer stored', () => {
    expect(getOrganizerLocale({ locale: null }, 'participant')).toEqual({
      locale: 'en',
      source: 'default',
    });
    env.DEFAULT_LOCALE = other;
    expect(getOrganizerLocale({ locale: other }, 'participant')).toEqual({
      locale: 'en',
      source: 'default',
    });
  });

  it('takes the language stored on the account first', () => {
    ship('participant', ['en', other]);
    env.DEFAULT_LOCALE = 'en';
    expect(getOrganizerLocale({ locale: other }, 'participant')).toEqual({
      locale: other,
      source: 'setting',
    });
  });

  it('takes the instance’s DEFAULT_LOCALE when nothing is stored, else English', () => {
    ship('participant', ['en', other]);
    env.DEFAULT_LOCALE = other;
    expect(getOrganizerLocale({ locale: null }, 'participant')).toEqual({
      locale: other,
      source: 'instance',
    });
    env.DEFAULT_LOCALE = undefined;
    expect(getOrganizerLocale({ locale: 'xx' }, 'participant')).toEqual({
      locale: 'en',
      source: 'default',
    });
  });

  it('checks each step against the audience it is asked for', () => {
    ship('participant', ['en', other]);
    expect(getOrganizerLocale({ locale: other }, 'organizer')).toEqual({
      locale: 'en',
      source: 'default',
    });
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
});
