import { afterEach, describe, expect, it, vi } from 'vitest';
import { CATALOG_LOCALES } from './config';
import { ship } from './testing/ship';

// Unit tests have no DATABASE_URL, so the real getEnv() would throw.
const env = vi.hoisted(() => ({ DEFAULT_LOCALE: undefined as string | undefined }));
vi.mock('@/lib/env', () => ({ getEnv: () => env }));

const { getOrganizerLocale, newSignupLocale } = await import('./organizer');

/** Every language with a catalog besides English, each tried in turn. */
const OTHER_LANGUAGES = CATALOG_LOCALES.filter((locale) => locale !== 'en');

afterEach(() => {
  env.DEFAULT_LOCALE = undefined;
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
