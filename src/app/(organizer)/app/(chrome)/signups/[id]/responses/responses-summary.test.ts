import { describe, expect, it } from 'vitest';
import { CATALOG_LOCALES } from '@/i18n/config';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { noResponsesLine, summarizeResponses } from './responses-summary';

const english = getTestTranslator('organizer.responses');

const text = (s: ReturnType<typeof summarizeResponses>) => [s.count, ...s.rest].join(' · ');

describe('summarizeResponses', () => {
  it('says "sign-up" for one', () => {
    expect(text(summarizeResponses([{ id: 'a', status: 'confirmed' }], new Map(), english))).toBe(
      '1 sign-up',
    );
  });

  it('counts confirmed, tentative and waitlist as sign-ups, and leaves out zero parts', () => {
    const rows = [
      { id: 'a', status: 'confirmed' },
      { id: 'b', status: 'tentative' },
      { id: 'c', status: 'waitlist' },
    ] as const;
    expect(text(summarizeResponses(rows, new Map(), english))).toBe('3 sign-ups');
  });

  it('splits cancelled from removed, and leaves out the old half of a move', () => {
    const rows = [
      { id: 'a', status: 'confirmed' },
      { id: 'b', status: 'confirmed' },
      { id: 'c', status: 'cancelled' },
      { id: 'd', status: 'cancelled' },
      { id: 'e', status: 'cancelled' },
    ] as const;
    const ended = new Map([
      ['d', 'removed'],
      ['e', 'moved'],
    ] as const);
    expect(text(summarizeResponses(rows, ended, english))).toBe(
      '2 sign-ups · 1 cancelled · 1 removed',
    );
  });

  it('still reads 0 sign-ups when everyone dropped out', () => {
    const rows = [
      { id: 'a', status: 'cancelled' },
      { id: 'b', status: 'cancelled' },
    ] as const;
    expect(text(summarizeResponses(rows, new Map(), english))).toBe('0 sign-ups · 2 cancelled');
  });

  it('prints large counts without a separator, as before', () => {
    const rows = Array.from({ length: 1234 }, (_, i) => ({
      id: `c${i}`,
      status: i < 1000 ? 'cancelled' : 'confirmed',
    }));
    expect(text(summarizeResponses(rows, new Map(), english))).toBe(
      '234 sign-ups · 1000 cancelled',
    );
  });
});

describe('noResponsesLine', () => {
  it('tells a draft’s organizer that people can sign up once it’s published', () => {
    // A draft shows no public link, so there's nothing to share yet.
    expect(noResponsesLine('draft', english)).toBe(
      'Nobody has signed up yet. People can sign up once you publish and share it.',
    );
  });

  it('points an open signup at its public link', () => {
    expect(noResponsesLine('open', english)).toBe(
      'Nobody has signed up yet. Share the public link to start collecting.',
    );
  });

  it('says nobody signed up once it’s closed, and why nobody will on an archived one', () => {
    // "Closed", in the header, already says people can't sign up now; "archived" doesn't.
    expect(noResponsesLine('closed', english)).toBe('Nobody signed up.');
    expect(noResponsesLine('archived', english)).toBe(
      "Nobody signed up. People can't sign up now.",
    );
  });

  it('never calls what people did a "signup", which is the page', () => {
    for (const status of ['draft', 'open', 'closed', 'archived'] as const) {
      expect(noResponsesLine(status, english)).not.toMatch(/signups?\b/i);
    }
  });
});

/** Every language with a catalog but English. */
const OTHER_LOCALES = CATALOG_LOCALES.filter((locale) => locale !== 'en');

describe.each(OTHER_LOCALES)('in %s', (locale) => {
  const t = getStandInTranslator(locale, 'organizer.responses');
  const say = (key: string) => `organizer.responses.${key} in ${locale}`;

  it('takes each part of the summary from the catalog', () => {
    const rows = [
      { id: 'a', status: 'confirmed' },
      { id: 'b', status: 'cancelled' },
      { id: 'c', status: 'cancelled' },
    ] as const;
    expect(summarizeResponses(rows, new Map([['c', 'removed']]), t)).toEqual({
      count: say('summary.signUps'),
      rest: [say('summary.cancelled'), say('summary.removed')],
    });
  });

  it('takes each status’s empty line from the catalog', () => {
    for (const status of ['draft', 'open', 'closed', 'archived'] as const) {
      expect(noResponsesLine(status, t)).toBe(say(`empty.${status}`));
    }
  });
});
