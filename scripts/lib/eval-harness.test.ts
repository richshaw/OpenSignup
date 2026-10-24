import { describe, expect, it, vi } from 'vitest';
import type { MagicComposeDraft } from '@/lib/magic-compose/prompt';
import type { FollowUp, MagicComposeQuestions } from '@/lib/magic-compose/questions';
import {
  asksFirst,
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
