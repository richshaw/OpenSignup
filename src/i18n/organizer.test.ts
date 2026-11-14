import { afterEach, describe, expect, it, vi } from 'vitest';
import { OTHER_LOCALE, withRegion } from './testing/locales';
import { ship } from './testing/ship';

// Unit tests have no DATABASE_URL, so the real getEnv() would throw.
const env = vi.hoisted(() => ({ DEFAULT_LOCALE: undefined as string | undefined }));
vi.mock('@/lib/env', () => ({ getEnv: () => env }));

const { getOrganizerLocale, newSignupLocale } = await import('./organizer');

afterEach(() => {
  env.DEFAULT_LOCALE = undefined;
});

describe('getOrganizerLocale', () => {
  it('is English while only English has shipped, whatever the organizer saved or the browser asks', () => {
    expect(getOrganizerLocale({ locale: null }, null, 'participant')).toEqual({
      locale: 'en',
      source: 'default',
    });
    expect(
      getOrganizerLocale({ locale: OTHER_LOCALE }, `${OTHER_LOCALE},en;q=0.8`, 'participant'),
    ).toEqual({
      locale: 'en',
      source: 'default',
    });
  });

  it('takes the session’s saved language first', () => {
    ship('participant', ['en', OTHER_LOCALE]);
    env.DEFAULT_LOCALE = 'en';
    expect(getOrganizerLocale({ locale: OTHER_LOCALE }, 'en', 'participant')).toEqual({
      locale: OTHER_LOCALE,
      source: 'setting',
    });
  });

  it('takes the instance’s DEFAULT_LOCALE before the browser', () => {
    ship('participant', ['en', OTHER_LOCALE]);
    env.DEFAULT_LOCALE = OTHER_LOCALE;
    expect(getOrganizerLocale({ locale: null }, 'en', 'participant')).toEqual({
      locale: OTHER_LOCALE,
      source: 'instance',
    });
  });

  it('takes the browser’s top language, or nothing from it when there is no browser', () => {
    ship('participant', ['en', OTHER_LOCALE]);
    expect(
      getOrganizerLocale({ locale: 'xx' }, `${withRegion(OTHER_LOCALE)},en;q=0.8`, 'participant'),
    ).toEqual({
      locale: OTHER_LOCALE,
      source: 'browser',
    });
    expect(getOrganizerLocale({ locale: null }, null, 'participant')).toEqual({
      locale: 'en',
      source: 'default',
    });
  });

  it('checks each step against the audience it is asked for', () => {
    ship('participant', ['en', OTHER_LOCALE]);
    expect(getOrganizerLocale({ locale: OTHER_LOCALE }, OTHER_LOCALE, 'organizer')).toEqual({
      locale: 'en',
      source: 'default',
    });
  });
});

describe('newSignupLocale', () => {
  it('chooses nothing while only English has shipped to participants, whatever the steps say', () => {
    env.DEFAULT_LOCALE = 'en';
    expect(newSignupLocale({ locale: 'en' }, 'en')).toBeNull();
    expect(newSignupLocale({ locale: OTHER_LOCALE }, withRegion(OTHER_LOCALE))).toBeNull();
    expect(newSignupLocale({ locale: null }, null)).toBeNull();
  });

  it('chooses nothing while a second language has shipped only to organizers', () => {
    ship('organizer', ['en', OTHER_LOCALE]);
    expect(newSignupLocale({ locale: OTHER_LOCALE }, OTHER_LOCALE)).toBeNull();
  });

  it('once there is a choice, is the organizer’s language for participants, with the step that chose it', () => {
    ship('participant', ['en', OTHER_LOCALE]);
    expect(newSignupLocale({ locale: OTHER_LOCALE }, 'en')).toEqual({
      locale: OTHER_LOCALE,
      source: 'setting',
    });
    expect(newSignupLocale({ locale: null }, `${withRegion(OTHER_LOCALE)},en;q=0.8`)).toEqual({
      locale: OTHER_LOCALE,
      source: 'browser',
    });
    expect(newSignupLocale({ locale: null }, 'de')).toEqual({ locale: 'en', source: 'default' });
    env.DEFAULT_LOCALE = OTHER_LOCALE;
    expect(newSignupLocale({ locale: null }, 'en')).toEqual({
      locale: OTHER_LOCALE,
      source: 'instance',
    });
  });
});
