import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Audience, SHIPPED } from './config';

// Unit tests have no DATABASE_URL, so the real getEnv() would throw. Swedish
// has no catalog yet, so the environment's own parse would refuse it.
const env = vi.hoisted(() => ({ DEFAULT_LOCALE: undefined as string | undefined }));
vi.mock('@/lib/env', () => ({ getEnv: () => env }));

const { getOrganizerLocale, newSignupLocale } = await import('./organizer');

// Only English has shipped today. The tests that need a choice ship Swedish by
// changing the list itself, so config.ts's own `isShipped` sees it too.
const asShippedToday = { ...SHIPPED };
function ship(audience: Audience, locales: string[]) {
  (SHIPPED as Record<Audience, readonly string[]>)[audience] = locales;
}
afterEach(() => {
  Object.assign(SHIPPED, asShippedToday);
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
