import { describe, expect, it } from 'vitest';
import { noResponsesLine, summarizeResponses } from './responses-summary';

const text = (s: ReturnType<typeof summarizeResponses>) => [s.count, ...s.rest].join(' · ');

describe('summarizeResponses', () => {
  it('says "sign-up" for one', () => {
    expect(text(summarizeResponses([{ id: 'a', status: 'confirmed' }], new Map()))).toBe(
      '1 sign-up',
    );
  });

  it('counts confirmed, tentative and waitlist as sign-ups, and leaves out zero parts', () => {
    const rows = [
      { id: 'a', status: 'confirmed' },
      { id: 'b', status: 'tentative' },
      { id: 'c', status: 'waitlist' },
    ] as const;
    expect(text(summarizeResponses(rows, new Map()))).toBe('3 sign-ups');
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
    expect(text(summarizeResponses(rows, ended))).toBe('2 sign-ups · 1 cancelled · 1 removed');
  });

  it('still reads 0 sign-ups when everyone dropped out', () => {
    const rows = [
      { id: 'a', status: 'cancelled' },
      { id: 'b', status: 'cancelled' },
    ] as const;
    expect(text(summarizeResponses(rows, new Map()))).toBe('0 sign-ups · 2 cancelled');
  });
});

describe('noResponsesLine', () => {
  it('tells a draft’s organizer that people can sign up once it’s published', () => {
    // A draft shows no public link, so there's nothing to share yet.
    expect(noResponsesLine('draft')).toBe(
      'Nobody has signed up yet. People can sign up once you publish and share it.',
    );
  });

  it('points an open signup at its public link', () => {
    expect(noResponsesLine('open')).toBe(
      'Nobody has signed up yet. Share the public link to start collecting.',
    );
  });

  it('says nobody signed up once it’s closed, and why nobody will on an archived one', () => {
    // A closed signup's banner already says people can't sign up now.
    expect(noResponsesLine('closed')).toBe('Nobody signed up.');
    expect(noResponsesLine('archived')).toBe('Nobody signed up. People can’t sign up now.');
  });

  it('never calls what people did a "signup", which is the page', () => {
    for (const status of ['draft', 'open', 'closed', 'archived'] as const) {
      expect(noResponsesLine(status)).not.toMatch(/signups?\b/i);
    }
  });
});
