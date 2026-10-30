import { describe, expect, it } from 'vitest';
import { answeredNothing } from './questions';

const NONE = { picked: [], added: [] };

describe('answeredNothing', () => {
  it('is true when nothing was picked, added or dated', () => {
    expect(answeredNothing({ what: NONE })).toBe(true);
    expect(answeredNothing({ what: NONE, when: { kind: 'not_decided' } })).toBe(true);
  });

  it('is false once anything is answered', () => {
    expect(answeredNothing({ what: { picked: ['Staff the table'], added: [] } })).toBe(false);
    expect(answeredNothing({ what: { picked: [], added: ['Bring drinks'] } })).toBe(false);
    expect(answeredNothing({ what: NONE, when: { kind: 'one_day', date: '2026-11-14' } })).toBe(
      false,
    );
    expect(answeredNothing({ what: NONE, when: { kind: 'several', text: 'Saturdays' } })).toBe(
      false,
    );
  });
});
