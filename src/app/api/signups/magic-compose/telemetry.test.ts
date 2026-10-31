import { describe, expect, it } from 'vitest';
import type { FollowUp } from '@/lib/magic-compose/questions';
import { answeredPayload } from './telemetry';

const NEITHER = { retried: false, gaveUp: false };

describe('answeredPayload', () => {
  it('counts a full set of answers', () => {
    const followUp: FollowUp = {
      what: { picked: ['Bake something to sell', 'Staff the table'], added: ['Bring drinks'] },
      when: { kind: 'one_day', date: '2026-11-14', from: '09:00', to: '13:00' },
      howMany: [null, 2, 1],
    };
    expect(answeredPayload(followUp, NEITHER)).toEqual({
      answered: ['what', 'when'],
      skipped: [],
      picked: 2,
      added: 1,
      limits: 2,
      retried: false,
      gaveUp: false,
    });
  });

  it('marks every topic skipped when nothing was answered', () => {
    const followUp: FollowUp = {
      what: { picked: [], added: [] },
      when: { kind: 'not_decided' },
    };
    expect(answeredPayload(followUp, { retried: true, gaveUp: true })).toEqual({
      answered: [],
      skipped: ['what', 'when'],
      picked: 0,
      added: 0,
      limits: 0,
      retried: true,
      gaveUp: true,
    });
  });

  it('leaves out a topic that was not asked, and counts several days as an answer', () => {
    expect(answeredPayload({ what: { picked: ['Run a game'], added: [] } }, NEITHER)).toMatchObject(
      { answered: ['what'], skipped: [] },
    );
    expect(
      answeredPayload(
        { what: { picked: [], added: [] }, when: { kind: 'several', text: 'every Saturday' } },
        NEITHER,
      ),
    ).toMatchObject({ answered: ['when'], skipped: ['what'] });
  });

  it('holds codes and counts only, never what the organizer picked, typed or chose', () => {
    const followUp: FollowUp = {
      what: { picked: ['Maple class'], added: ['Bring "lemonade", please'] },
      when: { kind: 'several', text: 'every Saturday in May, 9 to 11' },
      howMany: [7, null],
    };
    const stored = JSON.stringify(answeredPayload(followUp, NEITHER));
    for (const text of ['Maple', 'lemonade', 'Saturday', 'May', '9 to 11', '7']) {
      expect(stored).not.toContain(text);
    }
    const oneDay = JSON.stringify(
      answeredPayload(
        {
          what: { picked: [], added: ['Set up'] },
          when: { kind: 'one_day', date: '2026-11-14', from: '09:00' },
        },
        NEITHER,
      ),
    );
    for (const text of ['Set up', '2026', '09:00']) expect(oneDay).not.toContain(text);
  });
});
