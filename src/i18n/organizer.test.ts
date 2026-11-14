import { afterEach, describe, expect, it, vi } from 'vitest';
import { ship } from './testing/ship';

// Unit tests have no DATABASE_URL, so the real getEnv() would throw.
const env = vi.hoisted(() => ({ DEFAULT_LOCALE: undefined as string | undefined }));
vi.mock('@/lib/env', () => ({ getEnv: () => env }));

const { draftedSignupLocale, getOrganizerLocale, newSignupLocale } = await import('./organizer');

afterEach(() => {
  env.DEFAULT_LOCALE = undefined;
});

describe('getOrganizerLocale', () => {
  it('is English while only English has shipped, whatever the organizer saved or the browser asks', () => {
    expect(getOrganizerLocale({ locale: null }, null, 'participant')).toEqual({
      locale: 'en',
      source: 'default',
    });
    expect(getOrganizerLocale({ locale: 'sv' }, 'sv,en;q=0.8', 'participant')).toEqual({
      locale: 'en',
      source: 'default',
    });
  });

  it('takes the session’s saved language first', () => {
    ship('participant', ['en', 'sv']);
    env.DEFAULT_LOCALE = 'en';
    expect(getOrganizerLocale({ locale: 'sv' }, 'en', 'participant')).toEqual({
      locale: 'sv',
      source: 'setting',
    });
  });

  it('takes the instance’s DEFAULT_LOCALE before the browser', () => {
    ship('participant', ['en', 'sv']);
    env.DEFAULT_LOCALE = 'sv';
    expect(getOrganizerLocale({ locale: null }, 'en', 'participant')).toEqual({
      locale: 'sv',
      source: 'instance',
    });
  });

  it('takes the browser’s top language, or nothing from it when there is no browser', () => {
    ship('participant', ['en', 'sv']);
    expect(getOrganizerLocale({ locale: 'xx' }, 'sv-SE,en;q=0.8', 'participant')).toEqual({
      locale: 'sv',
      source: 'browser',
    });
    expect(getOrganizerLocale({ locale: null }, null, 'participant')).toEqual({
      locale: 'en',
      source: 'default',
    });
  });

  it('checks each step against the audience it is asked for', () => {
    ship('participant', ['en', 'sv']);
    expect(getOrganizerLocale({ locale: 'sv' }, 'sv', 'organizer')).toEqual({
      locale: 'en',
      source: 'default',
    });
  });
});

describe('newSignupLocale', () => {
  it('chooses nothing while only English has shipped to participants, whatever the steps say', () => {
    env.DEFAULT_LOCALE = 'en';
    expect(newSignupLocale({ locale: 'en' }, 'en')).toBeNull();
    expect(newSignupLocale({ locale: 'sv' }, 'sv-SE')).toBeNull();
    expect(newSignupLocale({ locale: null }, null)).toBeNull();
  });

  it('chooses nothing while a second language has shipped only to organizers', () => {
    ship('organizer', ['en', 'sv']);
    expect(newSignupLocale({ locale: 'sv' }, 'sv')).toBeNull();
  });

  it('once there is a choice, is the organizer’s language for participants, with the step that chose it', () => {
    ship('participant', ['en', 'sv']);
    expect(newSignupLocale({ locale: 'sv' }, 'en')).toEqual({ locale: 'sv', source: 'setting' });
    expect(newSignupLocale({ locale: null }, 'sv-SE,en;q=0.8')).toEqual({
      locale: 'sv',
      source: 'browser',
    });
    expect(newSignupLocale({ locale: null }, 'de')).toEqual({ locale: 'en', source: 'default' });
    env.DEFAULT_LOCALE = 'sv';
    expect(newSignupLocale({ locale: null }, 'en')).toEqual({ locale: 'sv', source: 'instance' });
  });
});

describe('draftedSignupLocale', () => {
  it('chooses nothing while only English has shipped to participants, whatever the draft says', () => {
    env.DEFAULT_LOCALE = 'en';
    expect(draftedSignupLocale('en', { locale: 'en' }, 'en')).toBeNull();
    expect(draftedSignupLocale('sv', { locale: 'sv' }, 'sv')).toBeNull();
    expect(draftedSignupLocale(undefined, { locale: null }, null)).toBeNull();
  });

  it('once there is a choice, takes the draft’s language when it has shipped, over the organizer’s', () => {
    ship('participant', ['en', 'sv']);
    expect(draftedSignupLocale('sv', { locale: 'en' }, 'en')).toEqual({
      locale: 'sv',
      source: 'content',
    });
    expect(draftedSignupLocale('en', { locale: 'sv' }, 'sv')).toEqual({
      locale: 'en',
      source: 'content',
    });
  });

  it('takes the organizer’s language when the draft’s hasn’t shipped, or it gives none', () => {
    ship('participant', ['en', 'sv']);
    expect(draftedSignupLocale('de', { locale: 'sv' }, 'en')).toEqual({
      locale: 'sv',
      source: 'setting',
    });
    expect(draftedSignupLocale(undefined, { locale: null }, 'sv')).toEqual({
      locale: 'sv',
      source: 'browser',
    });
    expect(draftedSignupLocale('de', { locale: null }, 'de')).toEqual({
      locale: 'en',
      source: 'default',
    });
  });

  it('checks the draft’s language against what has shipped to participants, not organizers', () => {
    ship('participant', ['en', 'de']);
    ship('organizer', ['en', 'sv']);
    expect(draftedSignupLocale('sv', { locale: null }, null)).toEqual({
      locale: 'en',
      source: 'default',
    });
  });
});
