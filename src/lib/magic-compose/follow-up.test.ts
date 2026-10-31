import { describe, expect, it } from 'vitest';
import { buildFollowUpMessages, buildReplyNowMessages, FollowUpSchema } from './follow-up';
import { buildMessages } from './prompt';
import type { FollowUp } from './questions';

const NOW = new Date('2026-10-24T12:00:00Z');

function issue(input: unknown): string | undefined {
  const r = FollowUpSchema.safeParse(input);
  return r.success ? undefined : r.error.issues[0]?.message;
}

describe('FollowUpSchema', () => {
  const answers: FollowUp = {
    what: { picked: ['Bake something to sell', 'Staff the table'], added: ['Bring drinks'] },
    when: { kind: 'one_day', date: '2026-11-14', from: '09:00', to: '13:00' },
    howMany: [null, 2, 1],
  };

  it('accepts a full set of answers', () => {
    expect(FollowUpSchema.parse(answers)).toEqual(answers);
  });

  it('accepts every answer left blank', () => {
    const blank = { what: { picked: [], added: [] }, when: { kind: 'not_decided' } };
    expect(FollowUpSchema.parse(blank)).toEqual(blank);
  });

  it('accepts several days as text, and a day with only a date or one time', () => {
    for (const when of [
      { kind: 'several', text: 'every Saturday in May, 9 to 11' },
      { kind: 'one_day', date: '2026-11-14' },
      { kind: 'one_day', date: '2026-11-14', from: '09:00' },
      { kind: 'one_day', date: '2026-11-14', to: '13:00' },
    ]) {
      expect(
        FollowUpSchema.safeParse({ what: { picked: [], added: ['Run a game'] }, when }).success,
      ).toBe(true);
    }
  });

  it('tidies the organizer’s items: trimmed, one space for any run of whitespace', () => {
    const r = FollowUpSchema.parse({ what: { picked: [], added: ['  Bring\n\n  drinks '] } });
    expect(r.what.added).toEqual(['Bring drinks']);
  });

  it('rejects a date that is not a real day', () => {
    expect(issue({ ...answers, when: { kind: 'one_day', date: '2026-02-30' } })).toMatch(
      /real day/,
    );
    expect(issue({ ...answers, when: { kind: 'one_day', date: '14/11/2026' } })).toMatch(
      /real day/,
    );
  });

  it('rejects times out of order, or equal', () => {
    expect(
      issue({
        ...answers,
        when: { kind: 'one_day', date: '2026-11-14', from: '13:00', to: '09:00' },
      }),
    ).toMatch(/after the start/);
    expect(
      issue({
        ...answers,
        when: { kind: 'one_day', date: '2026-11-14', from: '09:00', to: '09:00' },
      }),
    ).toMatch(/after the start/);
  });

  it('rejects a time that does not exist', () => {
    expect(
      issue({ ...answers, when: { kind: 'one_day', date: '2026-11-14', from: '24:00' } }),
    ).toMatch(/HH:MM/);
  });

  it('rejects a count that is not a whole number from 1', () => {
    expect(issue({ ...answers, howMany: [null, 2.5, 1] })).toMatch(/whole/);
    expect(issue({ ...answers, howMany: [null, 0, 1] })).toMatch(/start at 1/);
    expect(issue({ ...answers, howMany: [null, '2', 1] })).toBeDefined();
    expect(issue({ ...answers, howMany: [null, 10_000, 1] })).toMatch(/9999/);
  });

  it('rejects counts that do not line up with the items', () => {
    expect(issue({ ...answers, howMany: [2, 1] })).toMatch(/one count for each/);
    expect(issue({ what: { picked: [], added: [] }, howMany: [] })).toMatch(/one count for each/);
  });

  it('rejects the same item twice, in any case, across picked and added', () => {
    expect(issue({ what: { picked: ['Staff the table'], added: ['staff the TABLE'] } })).toMatch(
      /once/,
    );
  });

  it('rejects more than 12 items, more than 4 picked, or an item over 80 characters', () => {
    const many = Array.from({ length: 13 }, (_, i) => `Item ${i}`);
    expect(issue({ what: { picked: [], added: many } })).toMatch(/12/);
    expect(issue({ what: { picked: ['A', 'B', 'C', 'D', 'E'], added: [] } })).toBeDefined();
    expect(issue({ what: { picked: [], added: ['x'.repeat(81)] } })).toMatch(/80/);
    expect(issue({ what: { picked: [], added: ['   '] } })).toMatch(/blank/);
  });

  it('rejects keys it does not know, and a body without what', () => {
    expect(issue({ ...answers, questions: { topics: ['what'] } })).toBeDefined();
    expect(issue({ when: { kind: 'not_decided' } })).toBeDefined();
    expect(
      issue({ ...answers, when: { kind: 'one_day', date: '2026-11-14', note: 'x' } }),
    ).toBeDefined();
  });
});

describe('buildFollowUpMessages', () => {
  const user = (followUp: FollowUp, firmly = false) =>
    buildFollowUpMessages('Bake sale for the PTA', followUp, { firmly, now: NOW })[1]!.content;

  it('keeps the system prompt and puts the description and the answers in one user message', () => {
    const messages = buildFollowUpMessages(
      'Bake sale',
      { what: { picked: ['A'], added: [] } },
      { now: NOW },
    );
    expect(messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(messages[0]!.content).toContain('2026-10-24');
  });

  it('lists every answer under its label, the organizer’s words quoted', () => {
    expect(
      user({
        what: {
          picked: ['Bake something to sell', 'Staff the table'],
          added: ['Bring "drinks", cups'],
        },
        when: { kind: 'one_day', date: '2026-11-14', from: '09:00', to: '13:00' },
        howMany: [null, 2, 1],
      }),
    ).toBe(
      [
        'Bake sale for the PTA',
        '',
        'Answers to your questions:',
        '- What people sign up for: "Bake something to sell", "Staff the table", "Bring \\"drinks\\", cups"',
        '- When: 2026-11-14, 09:00 to 13:00',
        '- How many people for each: "Bake something to sell": no limit, "Staff the table": 2, "Bring \\"drinks\\", cups": 1',
        '',
        "Use these exact values. Draft the signup now. Don't ask questions.",
      ].join('\n'),
    );
  });

  it('marks a skipped what and when as placeholders, and leaves out what was not asked', () => {
    const text = user({ what: { picked: [], added: [] }, when: { kind: 'not_decided' } });
    expect(text).toContain('- What people sign up for: not given, use a TBD: placeholder');
    expect(text).toContain('- When: not given, use a TBD: placeholder');
    expect(text).not.toContain('How many');
    expect(user({ what: { picked: ['A'], added: [] } })).not.toContain('- When');
  });

  it('words each kind of when', () => {
    const when = (w: FollowUp['when']) => user({ what: { picked: ['A'], added: [] }, when: w });
    expect(when({ kind: 'several', text: 'every Saturday in May' })).toContain(
      '- When: "every Saturday in May"',
    );
    expect(when({ kind: 'one_day', date: '2026-11-14' })).toContain('- When: 2026-11-14\n');
    expect(when({ kind: 'one_day', date: '2026-11-14', from: '09:00' })).toContain(
      '- When: 2026-11-14, from 09:00',
    );
    expect(when({ kind: 'one_day', date: '2026-11-14', to: '13:00' })).toContain(
      '- When: 2026-11-14, until 13:00',
    );
  });

  it('ends the retry with a firmer line', () => {
    const text = user({ what: { picked: ['A'], added: [] } }, true);
    expect(text).toMatch(
      /Reply with a draft or a refusal now: questions can't be answered here\.[^\n]*$/,
    );
    expect(text).not.toContain("Don't ask questions.");
  });
});

describe('buildReplyNowMessages', () => {
  it('sends the description again with the firm line, under the same system prompt', () => {
    const messages = buildReplyNowMessages('Bake sale for the PTA', { now: NOW });
    expect(messages[0]).toEqual(buildMessages('x', NOW)[0]);
    expect(messages[1]).toEqual({
      role: 'user',
      content:
        "Bake sale for the PTA\n\nReply with a draft or a refusal now: questions can't be answered here. Use a TBD: placeholder for anything missing.",
    });
  });
});
