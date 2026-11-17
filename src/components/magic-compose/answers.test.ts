import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MagicComposeQuestions } from '@/lib/magic-compose/questions';
import { isRealDate } from '@/lib/reminder-fields';
import { CATALOG_LOCALES } from '@/i18n/config';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import {
  addPending,
  answersProblem,
  appendAnswers,
  buildFollowUp,
  formatOneDay,
  NO_ANSWERS,
  parseCount,
  removeItem,
  sameAnswers,
  startingAnswers,
  stepCount,
  timeLength,
  togglePick,
  type Answers,
} from './answers';

const OPTIONS = ['Bake something to sell', 'Staff the table', 'Set up or clean up'];
const ALL: MagicComposeQuestions = { topics: ['what', 'when', 'how_many'], whatOptions: OPTIONS };
const NOW = new Date('2026-10-24T12:00:00Z');
/** The screen's English, from the catalog. */
const problems = getTestTranslator('organizer.compose.questions.problems');
const words = getTestTranslator('organizer.compose.answers');

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

  it('turns an empty, zero or unreadable count into no limit, and rounds none', () => {
    const counts = { 'Bake something to sell': '0', 'Staff the table': '2.4', 'Bring drinks': '' };
    expect(buildFollowUp(ALL, { ...answered, counts }).howMany).toEqual([null, 2.4, null]);
  });
});

describe('answersProblem', () => {
  it('stops an end time that is not after the start time', () => {
    expect(answersProblem(ALL, { ...answered, from: '13:00', to: '09:00' }, problems)).toBe(
      'The end time must be after the start time.',
    );
    expect(answersProblem(ALL, answered, problems)).toBeNull();
  });

  it('stops a date the server would refuse, as a short year typed in or a day that does not exist', () => {
    for (const date of ['0202-11-14', '1899-12-31', '20260-11-14', '2026-02-30']) {
      expect(answersProblem(ALL, { ...answered, date }, problems)).toBe("Check the date's year.");
      expect(isRealDate(date)).toBe(false);
    }
    expect(answersProblem(ALL, { ...answered, date: '1900-01-01' }, problems)).toBeNull();
    expect(isRealDate('1900-01-01')).toBe(true);
  });

  it('stops times with no date, which would go as not decided', () => {
    const noDate = 'Add a date, or leave the times empty.';
    expect(answersProblem(ALL, { ...answered, date: '' }, problems)).toBe(noDate);
    expect(answersProblem(ALL, { ...answered, date: '', from: '' }, problems)).toBe(noDate);
    expect(answersProblem(ALL, { ...answered, date: '', from: '', to: '' }, problems)).toBeNull();
    // Times left behind under One day don't count once another answer is chosen.
    expect(
      answersProblem(ALL, { ...answered, date: '', when: 'not_decided' }, problems),
    ).toBeNull();
  });

  it('stops a count that is not a whole number, rather than rounding it', () => {
    const counts = { ...answered.counts, 'Staff the table': '2.5' };
    expect(answersProblem(ALL, { ...answered, counts }, problems)).toBe(
      'Use whole numbers for how many people.',
    );
    expect(
      answersProblem(ALL, { ...answered, counts: { 'Staff the table': '0.4' } }, problems),
    ).toBe('Use whole numbers for how many people.');
    // Past the largest count too, rather than sent as the largest.
    expect(
      answersProblem(ALL, { ...answered, counts: { 'Staff the table': '100000.5' } }, problems),
    ).toBe('Use whole numbers for how many people.');
    // A count for an item no longer on the list, or with how many not asked, isn't sent.
    expect(
      answersProblem(ALL, { ...answered, counts: { 'Set up or clean up': '2.5' } }, problems),
    ).toBeNull();
    expect(
      answersProblem(
        { topics: ['what', 'when'], whatOptions: OPTIONS },
        { ...answered, counts },
        problems,
      ),
    ).toBeNull();
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
    expect(appendAnswers('Bake sale for the PTA\n', ALL, answered, 'en', words, NOW)).toBe(
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
        { topics: ['what', 'when'], whatOptions: OPTIONS },
        { ...NO_ANSWERS, date, from, to },
        'en',
        words,
        NOW,
      );
    expect(when('09:30', '')).toBe('x\nWhen: Saturday, November 14, from 9:30am');
    expect(when('', '12:00')).toBe('x\nWhen: Saturday, November 14, until 12pm');
    expect(when('', '', '2027-01-02')).toBe('x\nWhen: Saturday, January 2, 2027');
  });

  it('keeps times that have no date yet, with no day', () => {
    const when = (from: string, to: string) =>
      appendAnswers('x', ALL, { ...NO_ANSWERS, from, to }, 'en', words, NOW);
    expect(when('09:00', '13:00')).toBe('x\nWhen: 9am to 1pm');
    expect(when('09:30', '')).toBe('x\nWhen: from 9:30am');
    expect(when('', '12:00')).toBe('x\nWhen: until 12pm');
    // Not once another answer is chosen for When.
    expect(
      appendAnswers(
        'x',
        ALL,
        { ...NO_ANSWERS, from: '09:00', when: 'not_decided' },
        'en',
        words,
        NOW,
      ),
    ).toBe('x');
  });

  it('writes a count as typed, not rounded', () => {
    const counts = { 'Staff the table': '2.5' };
    expect(
      appendAnswers(
        'x',
        ALL,
        { ...NO_ANSWERS, picked: ['Staff the table'], counts },
        'en',
        words,
        NOW,
      ),
    ).toBe('x\nWhat: Staff the table (2.5)');
  });

  it('writes several days as typed, and no counts when how many was not asked', () => {
    const several: Answers = {
      ...answered,
      when: 'several',
      several: 'every Saturday in May, 9 to 11',
    };
    expect(
      appendAnswers(
        'Bake sale',
        { topics: ['what', 'when'], whatOptions: OPTIONS },
        several,
        'en',
        words,
        NOW,
      ),
    ).toBe(
      [
        'Bake sale',
        'What: Bake something to sell, Staff the table, Bring drinks',
        'When: every Saturday in May, 9 to 11',
      ].join('\n'),
    );
  });

  it("writes the day and times in the organizer's language", () => {
    expect(appendAnswers('Loppis', ALL, { ...answered, added: [] }, 'sv', words, NOW)).toBe(
      [
        'Loppis',
        'What: Bake something to sell (no limit), Staff the table (2)',
        'When: lördag 14 november, 09:00 to 13:00',
      ].join('\n'),
    );
    expect(appendAnswers('x', ALL, { ...NO_ANSWERS, to: '12:00' }, 'sv', words, NOW)).toBe(
      'x\nWhen: until 12:00',
    );
  });

  it('adds nothing for skipped questions', () => {
    expect(appendAnswers('Bake sale ', ALL, NO_ANSWERS, 'en', words, NOW)).toBe('Bake sale ');
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

  it('keeps a fraction as typed, and steps from it to the next whole number', () => {
    expect(parseCount('2.5')).toBe(2.5);
    expect(parseCount('0.4')).toBe(0.4);
    expect(stepCount('2.5', 1)).toBe('3');
    expect(stepCount('2.5', -1)).toBe('2');
    expect(stepCount('0.4', -1)).toBe('1');
  });
});

describe('when the description already says what', () => {
  const KNOWN: MagicComposeQuestions = { topics: ['when'], whatOptions: ['Bring snacks'] };

  it('starts with what the description names picked, and asking what, with nothing picked', () => {
    expect(startingAnswers(KNOWN)).toEqual({ ...NO_ANSWERS, picked: ['Bring snacks'] });
    expect(startingAnswers(ALL)).toBe(NO_ANSWERS);
  });

  it('sends those items as picked, with no howMany when how many was not asked', () => {
    expect(buildFollowUp(KNOWN, startingAnswers(KNOWN))).toEqual({
      what: { picked: ['Bring snacks'], added: [] },
      when: { kind: 'not_decided' },
    });
  });

  it('takes an item off whichever list holds it, and typing it back picks it again', () => {
    const start = { ...startingAnswers(KNOWN), added: ['Bring drinks'] };
    const gone = removeItem(removeItem(start, 'Bring snacks'), 'Bring drinks');
    expect(gone.picked).toEqual([]);
    expect(gone.added).toEqual([]);
    expect(addPending({ ...gone, pending: 'bring snacks' }, KNOWN.whatOptions).picked).toEqual([
      'Bring snacks',
    ]);
  });
});

describe('timeLength', () => {
  it('says how long, in hours and minutes', () => {
    expect(timeLength('09:00', '09:15', 'en')).toBe('15 min');
    expect(timeLength('09:00', '13:00', 'en')).toBe('4 hr');
    expect(timeLength('09:00', '10:30', 'en')).toBe('1 hr 30 min');
    expect(timeLength('09:10', '09:15', 'en')).toBe('5 min');
  });
  it('says 1 and many of each unit the same way, and nothing for no time at all', () => {
    expect(timeLength('09:00', '10:00', 'en')).toBe('1 hr');
    expect(timeLength('09:00', '09:01', 'en')).toBe('1 min');
    expect(timeLength('09:00', '11:02', 'en')).toBe('2 hr 2 min');
    expect(timeLength('09:00', '09:00', 'en')).toBe('');
  });

  it("says how long in Swedish, in Swedish's short units", () => {
    expect(timeLength('09:00', '09:15', 'sv')).toBe('15 min');
    expect(timeLength('09:00', '10:00', 'sv')).toBe('1 tim');
    expect(timeLength('09:00', '13:00', 'sv')).toBe('4 tim');
    expect(timeLength('09:00', '10:30', 'sv')).toBe('1 tim 30 min');
    expect(timeLength('09:00', '09:00', 'sv')).toBe('');
  });
});

describe('formatOneDay', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const day = (date: string, from?: string, to?: string) => ({
    kind: 'one_day' as const,
    date,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });

  it('writes an English day in full, with the year only when it is not this one', () => {
    expect(formatOneDay(day('2026-11-14', '09:00', '13:00'), 'en', words, NOW)).toEqual({
      day: 'Saturday, November 14',
      times: '9am to 1pm',
    });
    expect(formatOneDay(day('2027-01-02'), 'en', words, NOW)).toEqual({
      day: 'Saturday, January 2, 2027',
      times: null,
    });
  });

  it('writes a Swedish day and times in Swedish', () => {
    expect(formatOneDay(day('2026-11-14', '09:00', '13:30'), 'sv', words, NOW)).toEqual({
      day: 'lördag 14 november',
      times: '09:00 to 13:30',
    });
    expect(formatOneDay(day('2027-01-02', '18:30'), 'sv', words, NOW)).toEqual({
      day: 'lördag 2 januari 2027',
      times: 'from 18:30',
    });
  });

  it('keeps the day under any time zone', () => {
    for (const tz of ['America/Los_Angeles', 'Pacific/Auckland']) {
      vi.stubEnv('TZ', tz);
      expect(formatOneDay(day('2026-11-14'), 'sv', words, NOW).day).toBe('lördag 14 november');
      expect(formatOneDay(day('2026-11-14'), 'en', words, NOW).day).toBe('Saturday, November 14');
    }
  });
});

describe('the words around the answers', () => {
  // A language besides English, whatever its catalog holds so far: each line
  // is the message asked for, in that language.
  const LOCALE = CATALOG_LOCALES.find((locale) => locale !== 'en') ?? 'en';
  const problemsIn = getStandInTranslator(LOCALE, 'organizer.compose.questions.problems');
  const wordsIn = getStandInTranslator(LOCALE, 'organizer.compose.answers');
  const message = (key: string) => `organizer.compose.${key} in ${LOCALE}`;

  it("say why answers can't go in the organizer's language", () => {
    const check = (change: Partial<Answers>) =>
      answersProblem(ALL, { ...answered, ...change }, problemsIn);
    expect(check({ date: '', from: '09:00' })).toBe(message('questions.problems.noDate'));
    expect(check({ date: '0202-11-14' })).toBe(message('questions.problems.year'));
    expect(check({ from: '13:00', to: '09:00' })).toBe(message('questions.problems.timeOrder'));
    expect(check({ counts: { 'Staff the table': '2.5' } })).toBe(
      message('questions.problems.wholeNumbers'),
    );
  });

  it("write Back's lines and the times in the organizer's language", () => {
    const counted = { ...answered, from: '09:00', to: '13:00' };
    expect(appendAnswers('Bake sale', ALL, counted, LOCALE, wordsIn, NOW)).toBe(
      ['Bake sale', message('answers.what'), message('answers.when')].join('\n'),
    );
    const day = { kind: 'one_day' as const, date: '2026-11-14' };
    expect(formatOneDay({ ...day, from: '09:00', to: '13:00' }, LOCALE, wordsIn, NOW).times).toBe(
      message('answers.fromTo'),
    );
    expect(formatOneDay({ ...day, from: '09:00' }, LOCALE, wordsIn, NOW).times).toBe(
      message('answers.from'),
    );
    expect(formatOneDay({ ...day, to: '13:00' }, LOCALE, wordsIn, NOW).times).toBe(
      message('answers.until'),
    );
  });
});
