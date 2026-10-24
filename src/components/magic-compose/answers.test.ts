import { describe, expect, it } from 'vitest';
import { EARLIEST_DATE_YEAR } from '@/lib/magic-compose/limits';
import type { MagicComposeQuestions } from '@/lib/magic-compose/questions';
import { isRealDate, MIN_DATE_YEAR } from '@/lib/reminder-fields';
import {
  addPending,
  answersProblem,
  appendAnswers,
  buildFollowUp,
  NO_ANSWERS,
  parseCount,
  sameAnswers,
  stepCount,
  togglePick,
  type Answers,
} from './answers';

const OPTIONS = ['Bake something to sell', 'Staff the table', 'Set up or clean up'];
const ALL: MagicComposeQuestions = { topics: ['what', 'when', 'how_many'], whatOptions: OPTIONS };
const NOW = new Date('2026-10-24T12:00:00Z');

const answered: Answers = {
  ...NO_ANSWERS,
  picked: ['Bake something to sell', 'Staff the table'],
  added: ['Bring drinks'],
  date: '2026-11-14',
  from: '09:00',
  to: '13:00',
  counts: { 'Staff the table': '2', 'Bring drinks': '1' },
};

describe('buildFollowUp', () => {
  it('sends the picks, the own items, the day and one count per item', () => {
    expect(buildFollowUp(ALL, answered)).toEqual({
      what: { picked: ['Bake something to sell', 'Staff the table'], added: ['Bring drinks'] },
      when: { kind: 'one_day', date: '2026-11-14', from: '09:00', to: '13:00' },
      howMany: [null, 2, 1],
    });
  });

  it('sends only the topics that were asked', () => {
    const whatOnly = buildFollowUp({ topics: ['what'], whatOptions: OPTIONS }, answered);
    expect(whatOnly).toEqual({
      what: { picked: ['Bake something to sell', 'Staff the table'], added: ['Bring drinks'] },
    });
  });

  it('sends no counts when there is nothing to count', () => {
    expect(buildFollowUp(ALL, { ...NO_ANSWERS, counts: { 'Staff the table': '2' } })).toEqual({
      what: { picked: [], added: [] },
      when: { kind: 'not_decided' },
    });
  });

  it('calls a day with no date, or several days left empty, not decided', () => {
    expect(buildFollowUp(ALL, { ...answered, date: '' }).when).toEqual({ kind: 'not_decided' });
    expect(buildFollowUp(ALL, { ...answered, when: 'several', several: '  \n ' }).when).toEqual({
      kind: 'not_decided',
    });
    expect(buildFollowUp(ALL, { ...answered, when: 'not_decided' }).when).toEqual({
      kind: 'not_decided',
    });
  });

  it('leaves out a time that was left empty, and tidies the several-days text', () => {
    expect(buildFollowUp(ALL, { ...answered, from: '', to: '13:00' }).when).toEqual({
      kind: 'one_day',
      date: '2026-11-14',
      to: '13:00',
    });
    expect(
      buildFollowUp(ALL, { ...answered, when: 'several', several: ' every Saturday\nin May ' })
        .when,
    ).toEqual({ kind: 'several', text: 'every Saturday in May' });
  });

  it('turns an empty, zero or unreadable count into no limit, and rounds the rest', () => {
    const counts = { 'Bake something to sell': '0', 'Staff the table': '2.4', 'Bring drinks': '' };
    expect(buildFollowUp(ALL, { ...answered, counts }).howMany).toEqual([null, 2, null]);
  });

  it('sends every asked topic skipped for Draft with placeholders, whatever the boxes hold', () => {
    expect(buildFollowUp(ALL, answered, { placeholders: true })).toEqual({
      what: { picked: [], added: [] },
      when: { kind: 'not_decided' },
      placeholders: true,
    });
    expect(
      buildFollowUp({ topics: ['what', 'how_many'], whatOptions: OPTIONS }, answered, {
        placeholders: true,
      }),
    ).toEqual({ what: { picked: [], added: [] }, placeholders: true });
  });
});

describe('answersProblem', () => {
  it('stops an end time that is not after the start time', () => {
    expect(answersProblem(buildFollowUp(ALL, { ...answered, from: '13:00', to: '09:00' }))).toBe(
      'The end time must be after the start time.',
    );
    expect(answersProblem(buildFollowUp(ALL, answered))).toBeNull();
  });

  it('stops a date the server would refuse for its year, as a short year typed in', () => {
    for (const date of ['0202-11-14', '1899-12-31', '20260-11-14']) {
      expect(answersProblem(buildFollowUp(ALL, { ...answered, date }))).toBe(
        "Check the date's year.",
      );
      expect(isRealDate(date)).toBe(false);
    }
    expect(answersProblem(buildFollowUp(ALL, { ...answered, date: '1900-01-01' }))).toBeNull();
    expect(isRealDate('1900-01-01')).toBe(true);
  });

  it("takes the server's earliest year", () => {
    expect(EARLIEST_DATE_YEAR).toBe(MIN_DATE_YEAR);
  });
});

describe('sameAnswers', () => {
  it('tells a real change from boxes left as they were', () => {
    expect(sameAnswers(answered, { ...answered, counts: { ...answered.counts } })).toBe(true);
    expect(sameAnswers(answered, { ...answered, to: '14:00' })).toBe(false);
    expect(sameAnswers(answered, { ...answered, picked: ['Staff the table'] })).toBe(false);
    expect(
      sameAnswers(answered, { ...answered, counts: { ...answered.counts, 'Bring drinks': '2' } }),
    ).toBe(false);
  });
});

describe('appendAnswers', () => {
  it('adds the answers to the description as plain lines, items as typed', () => {
    expect(appendAnswers('Bake sale for the PTA\n', buildFollowUp(ALL, answered), NOW)).toBe(
      [
        'Bake sale for the PTA',
        'What: Bake something to sell (no limit), Staff the table (2), Bring drinks (1)',
        'When: Saturday, November 14, 9am to 1pm',
      ].join('\n'),
    );
  });

  it('writes one time alone, half hours, and the year when it is not this one', () => {
    const when = (from: string, to: string, date = '2026-11-14') =>
      appendAnswers(
        'x',
        buildFollowUp(
          { topics: ['what', 'when'], whatOptions: OPTIONS },
          {
            ...NO_ANSWERS,
            date,
            from,
            to,
          },
        ),
        NOW,
      );
    expect(when('09:30', '')).toBe('x\nWhen: Saturday, November 14, from 9:30am');
    expect(when('', '12:00')).toBe('x\nWhen: Saturday, November 14, until 12pm');
    expect(when('', '', '2027-01-02')).toBe('x\nWhen: Saturday, January 2, 2027');
  });

  it('writes several days as typed, and no counts when how many was not asked', () => {
    const followUp = buildFollowUp(
      { topics: ['what', 'when'], whatOptions: OPTIONS },
      { ...answered, when: 'several', several: 'every Saturday in May, 9 to 11' },
    );
    expect(appendAnswers('Bake sale', followUp, NOW)).toBe(
      [
        'Bake sale',
        'What: Bake something to sell, Staff the table, Bring drinks',
        'When: every Saturday in May, 9 to 11',
      ].join('\n'),
    );
  });

  it('adds nothing for skipped questions', () => {
    expect(appendAnswers('Bake sale ', buildFollowUp(ALL, NO_ANSWERS), NOW)).toBe('Bake sale ');
  });
});

describe('picking and adding', () => {
  it('keeps picks in the order the options came', () => {
    let a = togglePick(NO_ANSWERS, 'Set up or clean up', OPTIONS);
    a = togglePick(a, 'Bake something to sell', OPTIONS);
    expect(a.picked).toEqual(['Bake something to sell', 'Set up or clean up']);
    expect(togglePick(a, 'Bake something to sell', OPTIONS).picked).toEqual(['Set up or clean up']);
  });

  it('adds own items tidied, picks an option typed by name, and drops repeats', () => {
    let a = addPending({ ...NO_ANSWERS, pending: '  Bring \n drinks ' }, OPTIONS);
    expect(a).toMatchObject({ added: ['Bring drinks'], pending: '' });
    a = addPending({ ...a, pending: 'staff the table' }, OPTIONS);
    expect(a).toMatchObject({ picked: ['Staff the table'], added: ['Bring drinks'] });
    a = addPending({ ...a, pending: 'BRING DRINKS' }, OPTIONS);
    expect(a).toMatchObject({ added: ['Bring drinks'], pending: '' });
    expect(addPending({ ...a, pending: '   ' }, OPTIONS)).toEqual({ ...a, pending: '' });
  });

  it('stops at 12 items, and cuts an item at 80 characters', () => {
    const added = Array.from({ length: 11 }, (_, i) => `Item ${i + 1}`);
    const twelve = { ...NO_ANSWERS, picked: ['Staff the table'], added };
    expect(togglePick(twelve, 'Bake something to sell', OPTIONS)).toBe(twelve);
    expect(addPending({ ...twelve, pending: 'Another' }, OPTIONS).added).toEqual(added);
    const eleven = { ...twelve, added: added.slice(1), pending: 'x'.repeat(90) };
    expect(addPending(eleven, OPTIONS).added).toContain('x'.repeat(80));
  });
});

describe('counts', () => {
  it('reads an empty box as no limit and caps at the most', () => {
    expect(parseCount('')).toBeNull();
    expect(parseCount(undefined)).toBeNull();
    expect(parseCount('-3')).toBeNull();
    expect(parseCount('12000')).toBe(9999);
  });

  it('steps from no limit to 1, and never below 1', () => {
    expect(stepCount('', 1)).toBe('1');
    expect(stepCount('', -1)).toBe('1');
    expect(stepCount('1', -1)).toBe('1');
    expect(stepCount('2', 1)).toBe('3');
    expect(stepCount('9999', 1)).toBe('9999');
  });
});
