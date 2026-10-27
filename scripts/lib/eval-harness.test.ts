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

  it('reads a "TBD: date 1" placeholder in a date field as no date', async () => {
    expect(await setCheck('TBD: date 1')).toBe('pass');
    expect(await setCheck('tbd')).toBe('pass');
    expect(await setCheck('2027-06-05')).toBe('fail');
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
});

describe('askedBeforeCreating', () => {
  it('passes a reply that asks, with a "?" or by asking for details', () => {
    for (const reply of [
      'What will people sign up for, and when?',
      "Let me know what people will sign up for and the dates, and I'll set it up.",
      'Please share the game dates and how many families you need for each.',
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
      'Done: the signup is ready.',
    ]) {
      expect(askedBeforeCreating(reply).outcome, reply).toBe('fail');
    }
  });
});
