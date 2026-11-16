import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { MagicComposeDraft } from '@/lib/magic-compose/prompt';
import type { FollowUp, MagicComposeQuestions } from '@/lib/magic-compose/questions';
import {
  askedBeforeCreating,
  asksFirst,
  DEV_EVALS_FILE,
  runOneCase,
  type EvalCase,
  type EvalRunner,
  type Produced,
} from './eval-harness';

const DRAFT: MagicComposeDraft = {
  title: 'Bake sale',
  description: '',
  fields: [{ ref: 'what', label: 'What', fieldType: 'text', choices: undefined }],
  slots: [{ values: { what: 'Staff the table' }, capacity: 2 }],
  groupBy: undefined,
};

const ASKS_ALL: MagicComposeQuestions = {
  topics: ['what', 'when', 'how_many'],
  whatOptions: ['Bake something to sell', 'Staff the table'],
};

const ANSWERS: FollowUp = {
  what: { picked: ['Staff the table'], added: [] },
  when: { kind: 'one_day', date: '2027-05-08' },
  howMany: [2],
};

const drafted: Produced = { status: 'draft', raw: DRAFT, draft: DRAFT, ms: 1 };
const asks = (questions: MagicComposeQuestions): Produced => ({
  status: 'questions',
  raw: { questions },
  questions,
  ms: 1,
});

function evalCase(over: Partial<EvalCase>): EvalCase {
  return { id: 'ev_test', tags: [], runner: 'llm', prompt: 'Bake sale', expect: {}, ...over };
}

function runner(first: Produced, second?: Produced) {
  const answer = vi.fn<NonNullable<EvalRunner['answer']>>(async () => second ?? drafted);
  const produce = vi.fn<EvalRunner['produce']>(async () => first);
  return { snapshotDir: '', schemaName: 'test', produce, answer };
}

const failed = (checks: { key: string; outcome: string }[]) =>
  checks.filter((c) => c.outcome === 'fail').map((c) => c.key);

/** A case from dev-evals.json as it stands, by the start of its id. */
function devCase(idPrefix: string): EvalCase {
  const { cases } = JSON.parse(readFileSync(DEV_EVALS_FILE, 'utf8')) as { cases: EvalCase[] };
  const c = cases.find((x) => x.id.startsWith(idPrefix));
  if (!c) throw new Error(`no case ${idPrefix} in dev-evals.json`);
  return c;
}

const draftOf = (over: Partial<MagicComposeDraft>): Produced => {
  const draft = { ...DRAFT, ...over };
  return { status: 'draft', raw: draft, draft, ms: 1 };
};

describe('questions.must_ask', () => {
  it('expects questions when true, a draft when false, and decides over other questions keys', () => {
    expect(asksFirst(evalCase({ expect: { 'questions.must_ask': true } }))).toBe(true);
    expect(asksFirst(evalCase({ expect: { 'questions.must_ask': false } }))).toBe(false);
    expect(asksFirst(evalCase({ expect: { 'questions.topics_must_include': ['what'] } }))).toBe(
      true,
    );
    expect(
      asksFirst(
        evalCase({
          expect: { 'questions.must_ask': false, 'questions.options_count_range': [2, 4] },
        }),
      ),
    ).toBe(false);
    expect(asksFirst(evalCase({ expect: { 'slots.count': 1 } }))).toBe(false);
  });

  it('passes a draft when false, and fails questions as unexpected', async () => {
    const c = evalCase({ expect: { 'questions.must_ask': false, 'slots.count': 1 } });

    const draft = await runOneCase(runner(drafted), c);
    expect(failed(draft.checks)).toEqual([]);
    expect(draft.checks.find((ch) => ch.key === 'questions.must_ask')?.outcome).toBe('pass');

    const asked = await runOneCase(runner(asks(ASKS_ALL)), c);
    expect(failed(asked.checks)).toEqual(['unexpected_questions']);
  });

  it('marks a case with answers that says it must not ask as broken, before any call', async () => {
    const r = runner(asks(ASKS_ALL));
    const run = await runOneCase(
      r,
      evalCase({ answers: ANSWERS, expect: { 'questions.must_ask': false } }),
    );
    expect(run.status).toBe('broken');
    expect(r.produce).not.toHaveBeenCalled();
  });
});

describe('a case with answers', () => {
  it('is broken, with no call made, when its answers fail FollowUpSchema', async () => {
    const r = runner(asks(ASKS_ALL));
    const bad = { ...ANSWERS, when: { kind: 'one_day', date: '2027-02-30' } } as FollowUp;
    const run = await runOneCase(r, evalCase({ answers: bad }));
    expect(run.status).toBe('broken');
    expect(run.checks[0]?.detail).toMatch(/FollowUpSchema at when\.date/);
    expect(r.produce).not.toHaveBeenCalled();
    expect(r.answer).not.toHaveBeenCalled();
  });

  it('sends only the topics the first call asked about, and what always', async () => {
    const r = runner(
      asks({ topics: ['what'], whatOptions: ['Bake something to sell', 'Staff the table'] }),
    );
    const run = await runOneCase(r, evalCase({ answers: ANSWERS }));
    expect(r.answer).toHaveBeenCalledWith(expect.anything(), { what: ANSWERS.what });
    expect(run.answersSent).toEqual({ what: ANSWERS.what });

    const all = runner(asks(ASKS_ALL));
    await runOneCase(all, evalCase({ answers: ANSWERS }));
    expect(all.answer).toHaveBeenCalledWith(expect.anything(), ANSWERS);
  });

  it('sends the answers as written when the first call drafted', async () => {
    const r = runner(drafted);
    const run = await runOneCase(r, evalCase({ answers: ANSWERS }));
    expect(r.answer).toHaveBeenCalledWith(expect.anything(), ANSWERS);
    expect(failed(run.checks)).toEqual(['first:expected_questions_but_drafted']);
  });

  it('fails a reply to the answers that asks again, in any shape, as asked_again', async () => {
    const again: Produced = {
      status: 'asked_again',
      raw: { questions: { topics: ['when'] } },
      ms: 1,
    };
    const run = await runOneCase(
      runner(asks(ASKS_ALL), again),
      evalCase({ answers: ANSWERS, expect: { 'slots.count': 1 } }),
    );
    expect(run.status).toBe('ok');
    expect(run.checks).toContainEqual({
      key: 'asked_again',
      outcome: 'fail',
      detail: 'asked about when instead of drafting',
    });
    expect(run.checks.find((ch) => ch.key === 'slots.count')?.outcome).toBe('skip');
  });

  it("keeps the first call's checks when the second call fails, and says which call failed", async () => {
    const down: Produced = { status: 'llm_failed', code: 'timeout', message: 'no answer', ms: 1 };
    const run = await runOneCase(
      runner(asks(ASKS_ALL), down),
      evalCase({
        answers: ANSWERS,
        expect: { 'questions.topics_must_equal': ['what', 'when', 'how_many'] },
      }),
    );
    expect(run.status).toBe('llm_failed');
    expect(run.llmErrorMessage).toBe('second call: no answer');
    expect(run.checks.map((ch) => `${ch.key} ${ch.outcome}`)).toEqual([
      'first:questions.must_ask pass',
      'first:questions.topics_must_equal pass',
    ]);
  });
});

describe('questions.options_must_not_contain_date_or_number', () => {
  const c = evalCase({ expect: { 'questions.options_must_not_contain_date_or_number': true } });
  const check = async (whatOptions: string[]) => {
    const run = await runOneCase(runner(asks({ topics: ['what'], whatOptions })), c);
    return run.checks.find((ch) => ch.key === 'questions.options_must_not_contain_date_or_number');
  };

  it('flags French counts, months and weekdays, accents or not', async () => {
    for (const option of [
      'Apporter deux gâteaux',
      'Tenir le stand en décembre',
      'Aider samedi',
      'Vingt crêpes',
    ]) {
      expect((await check([option, 'Ranger la salle']))?.outcome, option).toBe('fail');
    }
  });

  it('lets French articles through', async () => {
    expect((await check(['Faire un gâteau', 'Tenir une table']))?.outcome).toBe('pass');
  });
});

describe('slot_dates.*', () => {
  const dated = (date: string) =>
    draftOf({
      title: 'Class picnic',
      fields: [
        { ref: 'what', label: 'What', fieldType: 'text', choices: undefined },
        { ref: 'date', label: 'Date', fieldType: 'date', choices: undefined },
      ],
      slots: [{ values: { what: 'TBD: item 1', date }, capacity: 1 }],
    });
  const setCheck = async (date: string) => {
    const c = evalCase({ expect: { 'slot_dates.set_must_equal': [] } });
    const run = await runOneCase(runner(dated(date)), c);
    return run.checks.find((ch) => ch.key === 'slot_dates.set_must_equal')?.outcome;
  };

  it('counts only real days, as the converter keeps only those', async () => {
    expect(await setCheck('TBD: date 1')).toBe('pass');
    expect(await setCheck('tbd')).toBe('pass');
    expect(await setCheck('Saturday')).toBe('pass');
    expect(await setCheck('TBD (2027-06-05)')).toBe('pass');
    expect(await setCheck('2027-06-05')).toBe('fail');
    expect(await setCheck(' 2027-06-05 ')).toBe('fail');
  });

  it('passes ev_037 on a placeholder draft whose date field says TBD', async () => {
    const run = await runOneCase(runner(asks(ASKS_ALL), dated('TBD: date 1')), devCase('ev_037'));
    expect(run.status).toBe('ok');
    expect(failed(run.checks)).toEqual([]);
  });
});

describe('must_express_target_via_one_of', () => {
  it('takes a quantity field for ev_002, the bake sale with 80 cookies, 40 brownies and 30 cupcakes', async () => {
    const quantities = draftOf({
      title: 'Bake sale for the 5th grade trip',
      description: 'Bring your batch by 8am on Friday, May 22, 2026.',
      fields: [
        { ref: 'item', label: 'Item', fieldType: 'text', choices: undefined },
        { ref: 'quantity', label: 'Quantity', fieldType: 'number', choices: undefined },
      ],
      slots: [
        { values: { item: 'Cookies', quantity: 80 }, capacity: 1 },
        { values: { item: 'Brownies', quantity: 40 }, capacity: 1 },
        { values: { item: 'Cupcakes', quantity: 30 }, capacity: 1 },
      ],
    });
    const run = await runOneCase(runner(quantities), devCase('ev_002'));
    expect(failed(run.checks)).toEqual([]);
    expect(run.checks.find((ch) => ch.key === 'must_express_target_via_one_of')?.outcome).toBe(
      'pass',
    );
  });
});

describe('ev_031, the French bake sale', () => {
  const options = async (whatOptions: string[]) => {
    const run = await runOneCase(
      runner(asks({ topics: ['what', 'when', 'how_many'], whatOptions })),
      devCase('ev_031'),
    );
    return failed(run.checks);
  };

  it('passes options in French about the bake sale', async () => {
    expect(await options(['Faire un gâteau', 'Tenir le stand'])).toEqual([]);
    expect(await options(['Préparer des crêpes', 'Aider à la vente'])).toEqual([]);
  });

  it('fails options in French about something else, articles and all', async () => {
    expect(
      await options(['Apporter des collations', 'Conduire aux matchs', "Aider à l'entraînement"]),
    ).toEqual(['questions.options_must_mention_any']);
  });

  it('fails options in English, even with words French shares', async () => {
    expect(await options(['Run the stand', 'Drinks table'])).toContain(
      'questions.options_must_mention_any',
    );
  });
});

describe('language_must_be', () => {
  const field = (ref: string, label: string, fieldType: 'text' | 'date' | 'time' = 'text') => ({
    ref,
    label,
    fieldType,
    choices: undefined,
  });
  const SWEDISH = draftOf({
    title: 'Fika efter skolavslutningen',
    description: 'Två familjer tar med varje sak.',
    fields: [field('sak', 'Sak'), field('datum', 'Datum', 'date')],
    slots: [{ values: { sak: 'Kaffe', datum: '2027-06-11' }, capacity: 2 }],
  });
  const ENGLISH = draftOf({
    title: 'Coffee after the last day of school',
    description: 'Two families bring each item.',
    fields: [field('item', 'Item'), field('date', 'Date', 'date')],
    slots: [{ values: { item: 'Coffee', date: '2027-06-11' }, capacity: 2 }],
  });
  const GERMAN = draftOf({
    title: 'Helfer für das Sommerfest',
    description: 'Wir brauchen drei Personen je Schicht.',
    fields: [field('aufgabe', 'Aufgabe'), field('zeit', 'Zeit', 'time')],
    slots: [{ values: { aufgabe: 'Aufbau', zeit: '09:00' }, capacity: 3 }],
  });
  const check = async (reply: Produced, language: unknown) => {
    const run = await runOneCase(
      runner(reply),
      evalCase({ expect: { language_must_be: language } }),
    );
    return run.checks.find((c) => c.key === 'language_must_be')!;
  };

  it('passes a draft in the language it names, and fails it for any other', async () => {
    expect((await check(SWEDISH, 'sv')).outcome).toBe('pass');
    expect((await check(SWEDISH, 'en')).outcome).toBe('fail');
    expect((await check(GERMAN, 'de')).outcome).toBe('pass');
    expect((await check(GERMAN, 'sv')).outcome).toBe('fail');
  });

  it('fails an English draft where Swedish is expected, saying which words it read', async () => {
    expect(await check(ENGLISH, 'sv')).toEqual({
      key: 'language_must_be',
      outcome: 'fail',
      detail: "doesn't read as sv (en: the, each, of, bring, item)",
    });
  });

  it('keeps accents, so "för" is Swedish and "für" German, never English "for"', async () => {
    const title = (t: string) =>
      draftOf({
        title: t,
        fields: [field('n', 'N')],
        slots: [{ values: { n: '1' }, capacity: 1 }],
      });
    expect((await check(title('Kakor för klassen'), 'sv')).outcome).toBe('pass');
    expect((await check(title('Kuchen für die Klasse'), 'de')).outcome).toBe('pass');
    expect((await check(title('Cakes for the class'), 'en')).outcome).toBe('pass');
    expect((await check(title('Kakor för klassen'), 'en')).outcome).toBe('fail');
  });

  it('scores the options of a questions reply', async () => {
    const options = (whatOptions: string[]) => asks({ topics: ['what'], whatOptions });
    expect((await check(options(['Ta med fika', 'Hjälpa till vid bordet']), 'sv')).outcome).toBe(
      'pass',
    );
    expect((await check(options(['Bring snacks', 'Help at the table']), 'sv')).outcome).toBe(
      'fail',
    );
  });

  it('skips a refusal, and a language it has no words for', async () => {
    const refused: Produced = { status: 'refusal', raw: {}, refusalReason: 'Nej.', ms: 1 };
    expect((await check(refused, 'sv')).outcome).toBe('skip');
    expect((await check(SWEDISH, 'fi')).outcome).toBe('skip');
  });
});

describe('draft_must_contain_exactly', () => {
  const kept = (title: string, description: string) =>
    runOneCase(
      runner(draftOf({ title, description })),
      evalCase({
        expect: { draft_must_contain_exactly: ['Winter Lights Concert', 'Brookside Library'] },
      }),
    ).then((run) => failed(run.checks));

  it('passes names written as given, and fails them translated or recased', async () => {
    expect(await kept('Winter Lights Concert', 'Konserten på Brookside Library.')).toEqual([]);
    expect(await kept('Winter Lights-konserten', 'Konserten på Brookside Library.')).toEqual([
      'draft_must_contain_exactly',
    ]);
    expect(await kept('Winter Lights Concert', 'Konserten på Brookside library.')).toEqual([
      'draft_must_contain_exactly',
    ]);
  });
});

describe('organizerLanguage', () => {
  it('runs a case that sets it only for a runner that tells the model', async () => {
    const c = evalCase({ organizerLanguage: 'sv', expect: { 'slots.count': 1 } });

    const untold = runner(drafted);
    const skipped = await runOneCase(untold, c);
    expect(skipped.status).toBe('skipped');
    expect(skipped.checks[0]?.detail).toMatch(/only Magic Compose is told/);
    expect(untold.produce).not.toHaveBeenCalled();

    const told = { ...runner(drafted), tellsOrganizerLanguage: true };
    const run = await runOneCase(told, c);
    expect(run.status).toBe('ok');
    expect(told.produce).toHaveBeenCalledWith(c);
  });

  it('is set on the case too short to tell, and on no case of a language it decides', () => {
    expect(devCase('ev_045').organizerLanguage).toBe('sv');
    for (const id of ['ev_042', 'ev_043', 'ev_044']) {
      expect(devCase(id).organizerLanguage, id).toBeUndefined();
    }
  });
});

describe('the language cases, ev_042 to ev_045', () => {
  const field = (ref: string, label: string, fieldType: 'text' | 'date' | 'time' = 'text') => ({
    ref,
    label,
    fieldType,
    choices: undefined,
  });
  const told = (reply: Produced) => ({ ...runner(reply), tellsOrganizerLanguage: true });

  it('pass ev_042 on a Swedish draft of the four things, two families each', async () => {
    const swedish = draftOf({
      title: 'Fika efter skolavslutningen',
      description: 'Två familjer tar med varje sak.',
      fields: [field('sak', 'Sak'), field('datum', 'Datum', 'date'), field('tid', 'Tid', 'time')],
      slots: ['Kaffe', 'Kanelbullar', 'Saft', 'Frukt'].map((sak) => ({
        values: { sak, datum: '2027-06-11', tid: '13:00' },
        capacity: 2,
      })),
    });
    expect(failed((await runOneCase(told(swedish), devCase('ev_042'))).checks)).toEqual([]);
  });

  it('pass ev_043 on a German draft of the three shifts, three people each', async () => {
    const shift = (aufgabe: string, zeit: string) => ({
      values: { aufgabe, datum: '2027-06-19', zeit },
      capacity: 3,
    });
    const german = draftOf({
      title: 'Helfer für das Sommerfest',
      description: 'Wir brauchen jeweils drei Personen.',
      fields: [
        field('aufgabe', 'Aufgabe'),
        field('datum', 'Datum', 'date'),
        field('zeit', 'Uhrzeit', 'time'),
      ],
      slots: [shift('Aufbau', '09:00'), shift('Kuchenstand', '11:00'), shift('Abbau', '16:00')],
    });
    expect(failed((await runOneCase(told(german), devCase('ev_043'))).checks)).toEqual([]);
  });

  it('pass ev_044 on a Swedish draft that keeps the concert and the venue as written', async () => {
    const slot = (uppgift: string, tid: string, capacity: number) => ({
      values: { uppgift, datum: '2027-12-12', tid },
      capacity,
    });
    const swedish = draftOf({
      title: 'Frivilliga till Winter Lights Concert',
      description: 'Hjälp oss på Brookside Library söndag 12 december.',
      fields: [
        field('uppgift', 'Uppgift'),
        field('datum', 'Datum', 'date'),
        field('tid', 'Tid', 'time'),
      ],
      slots: [slot('Ställa i ordning stolar', '16:00', 2), slot('Servera kaffe', '18:00', 3)],
    });
    expect(failed((await runOneCase(told(swedish), devCase('ev_044'))).checks)).toEqual([]);

    const english = draftOf({
      ...(swedish as Extract<Produced, { status: 'draft' }>).draft,
      title: 'Volunteers for the Winter Lights Concert',
      description: 'Help us at Brookside Library on Sunday, December 12.',
    });
    expect(failed((await runOneCase(told(english), devCase('ev_044'))).checks)).toEqual([
      'language_must_be',
    ]);
  });

  it('pass ev_045 on a Swedish draft of the three dishes, and fail an English one', async () => {
    const dishes = (title: string, dish: string, date: string) =>
      draftOf({
        title,
        description: '',
        fields: [field('dish', dish), field('date', date, 'date')],
        slots: ['Pizza', 'Sushi', 'Tapas'].map((d) => ({
          values: { dish: d, date: '2027-05-29' },
          capacity: 1,
        })),
      });
    const swedish = dishes('Pizza, sushi och tapas', 'Rätt', 'Datum');
    expect(failed((await runOneCase(told(swedish), devCase('ev_045'))).checks)).toEqual([]);
    const english = dishes('Pizza, sushi and tapas', 'Dish', 'Date');
    expect(failed((await runOneCase(told(english), devCase('ev_045'))).checks)).toEqual([
      'language_must_be',
    ]);
  });
});

describe('askedBeforeCreating', () => {
  it('passes a reply that asks, with a "?" or by asking for details', () => {
    for (const reply of [
      'What will people sign up for, and when?',
      "Let me know what people will sign up for and the dates, and I'll set it up.",
      'Please share the game dates and how many families you need for each.',
      'Please tell me the dates and how many people you need.',
      'Before I create it, I’ll need the dates of the games.',
      'I need a few details first: what people sign up for, when, and how many.',
    ]) {
      expect(askedBeforeCreating(reply).outcome, reply).toBe('pass');
    }
  });

  it('fails an empty reply, and one that asks for nothing, such as a refusal', () => {
    expect(askedBeforeCreating(' \n')).toEqual({
      key: 'asked_before_creating',
      outcome: 'fail',
      detail: 'empty reply: neither asked nor created',
    });
    for (const reply of [
      "I can't help with that.",
      "I can't create that signup. Let me know if there's anything else.",
      "I can't set that up. Let me know what else I can help with.",
      "Please tell me if you'd like something different.",
      'Done: the signup is ready.',
    ]) {
      expect(askedBeforeCreating(reply).outcome, reply).toBe('fail');
    }
  });
});
