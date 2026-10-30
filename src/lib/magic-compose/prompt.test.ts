import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RULES_IN_BOTH } from '@/lib/signup-rules';
import { SignupCreateInputSchema } from '@/schemas/signups';
import { SlotFieldInputSchema } from '@/schemas/slot-fields';
import { buildFollowUpMessages } from './follow-up';
import { WHAT_OPTION_MAX_LENGTH, WHAT_OPTIONS_MAX, WHAT_OPTIONS_MIN } from './limits';
import {
  DraftFieldSchema,
  FullDraftSchema,
  MagicComposeDraftSchema,
  MAX_FIELDS,
  MAX_SLOTS,
  QuestionsSchema,
  asksQuestions,
  buildMessages,
  isQuestionsReply,
} from './prompt';
import { QUESTION_TOPICS } from './questions';

describe('system prompt', () => {
  const sys = buildMessages('x')[0]!.content;

  it('lists the closed fieldType enum', () => {
    expect(sys).toContain('text, date, time, number, enum');
  });

  it('contains the "slots are the atom" rule', () => {
    expect(sys.toLowerCase()).toContain('slots are the atom');
  });

  it('forbids personal-data slot fields', () => {
    expect(sys.toLowerCase()).toMatch(/social security|government id|date of birth/);
  });

  it('forbids inventing dates / capacities', () => {
    expect(sys.toLowerCase()).toMatch(/never invent dates/);
  });

  it('specifies kebab-case refs', () => {
    expect(sys.toLowerCase()).toMatch(/kebab/);
  });

  it('forbids emitting IDs/slugs/status', () => {
    expect(sys).toMatch(/sig_/);
    expect(sys.toLowerCase()).toMatch(/status/);
  });

  it('caps fields and slots', () => {
    expect(sys).toContain(String(MAX_FIELDS));
    expect(sys).toContain(String(MAX_SLOTS));
  });

  it('describes the structured refusal pattern', () => {
    expect(sys).toContain('refusalReason');
  });

  it('carries every rule it shares with the MCP server instructions, word for word', () => {
    for (const rule of RULES_IN_BOTH) expect(sys).toContain(rule);
  });

  it('describes the questions reply with the limits QuestionsSchema checks', () => {
    expect(sys).toContain('{ "questions": { "topics": [');
    for (const topic of QUESTION_TOPICS) expect(sys).toContain(`"${topic}"`);
    expect(sys).toContain(
      `${WHAT_OPTIONS_MIN} to ${WHAT_OPTIONS_MAX} kinds of thing people could sign up for, in the prompt's language, each at most ${WHAT_OPTION_MAX_LENGTH} characters.`,
    );
    expect(sys).toContain('Never a date, a time or a count');
  });

  // follow-up.ts words the second call's message; these hold the prompt to its words.
  const followUp = buildFollowUpMessages('Bake sale', {
    what: { picked: ['Staff the table'], added: [] },
    howMany: [null],
  })[1]!.content;

  it('never answers a message carrying answers with questions, by the label they come under', () => {
    const label = followUp.split('\n').find((l) => l.startsWith('Answers to'));
    expect(label).toBe('Answers to your questions:');
    expect(sys).toContain(`"${label}" is never answered with questions.`);
  });

  it('reads "no limit", as an answer puts it, as a null capacity, and nothing else', () => {
    expect(followUp).toContain('"Staff the table": no limit');
    expect(sys).toContain(
      `"capacity": <integer, 1 by default; null only if the prompt or answers say there's no limit>`,
    );
    expect(sys).toContain(
      'No limit ("unlimited", "as many as want") means null; never null as a guess.',
    );
  });

  // Each worked example's OUTPUT is a reply the server would take as it stands.
  const examples = [
    ...sys.matchAll(/^Example ([A-Z]) — [^\n]*\n\nUSER: "([^"]*)"\n\nOUTPUT:\n(\{[\s\S]*?\n\})$/gm),
  ].map(([, name, user, output]) => ({ name, user, reply: JSON.parse(output!) as unknown }));

  it('has worked examples A to F, each a reply MagicComposeDraftSchema takes', () => {
    expect(examples.map((e) => e.name)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    for (const e of examples) expect(MagicComposeDraftSchema.safeParse(e.reply).success).toBe(true);
  });

  // ev_008 was Example C word for word, and ev_034 held rule 4's "e.g.", so each scored
  // recall of the prompt's own words, not the rules.
  it("has no worked example or e.g. whose words are, or hold, an eval case's", () => {
    const file = path.join(__dirname, '../../../evals/magic-compose/dev-evals.json');
    const { cases } = JSON.parse(readFileSync(file, 'utf8')) as {
      cases: { id: string; prompt: string }[];
    };
    // Whole words only, with a space either side, so "art" doesn't match inside "party".
    const words = (s: string) =>
      ` ${s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()} `;
    const system = buildMessages('x')[0]!.content;
    const quoted = [...system.matchAll(/e\.g\. "([^"]+)"/g)].map((m) => m[1]!);
    expect(quoted.length).toBeGreaterThan(0);
    const texts = [
      ...examples.map((e) => ({ name: `Example ${e.name}`, text: e.user! })),
      ...quoted.map((q) => ({ name: `e.g. "${q}"`, text: q })),
    ];
    for (const t of texts) {
      const own = words(t.text);
      for (const c of cases) {
        const prompt = words(c.prompt);
        // A prompt with no Latin letters or digits (ev_014's empty one) has nothing to compare.
        if (prompt.trim() === '') continue;
        expect(own.includes(prompt) || prompt.includes(own), `${t.name} vs ${c.id}`).toBe(false);
      }
    }
  });

  it('asks about the vague soccer prompt in Example C', () => {
    const c = examples.find((e) => e.name === 'C')!;
    expect(c.user).toBe("Make a signup for my kid's soccer team");
    expect(QuestionsSchema.parse(c.reply).questions.topics).toEqual(['what', 'when', 'how_many']);
  });

  it('drafts placeholder performances in Example D, which says what but not when', () => {
    const d = examples.find((e) => e.name === 'D')!;
    const draft = FullDraftSchema.parse(d.reply);
    expect(draft.slots.map((s) => s.values.performance)).toEqual([
      'TBD: performance 1',
      'TBD: performance 2',
      'TBD: performance 3',
    ]);
    expect(draft.slots.every((s) => s.capacity === 2)).toBe(true);
  });

  it('drafts the item list in Example E as it stands: no date field, no placeholders, capacity 1', () => {
    const e = examples.find((x) => x.name === 'E')!;
    const draft = FullDraftSchema.parse(e.reply);
    expect(draft.fields.map((f) => f.fieldType)).toEqual(['text']);
    expect(draft.slots.map((s) => s.values.item)).toEqual([
      'Canopy tent',
      'Camp stove',
      'Cooler',
      'Lantern',
    ]);
    expect(draft.slots.every((s) => s.capacity === 1)).toBe(true);
  });

  // A one-day draft with its date only in the description gets no reminders (#685).
  it('puts the one day of Example F in a date field on every slot, with its start time', () => {
    const f = examples.find((x) => x.name === 'F')!;
    const draft = FullDraftSchema.parse(f.reply);
    expect(draft.fields.map((x) => x.fieldType)).toEqual(['text', 'date', 'time']);
    expect(draft.slots.length).toBeGreaterThan(1);
    expect(draft.slots.every((s) => s.values.date === '2026-06-06')).toBe(true);
    expect(draft.slots.every((s) => s.values.time === '09:00')).toBe(true);
  });
});

describe('buildMessages', () => {
  it('returns a system + user pair', () => {
    const out = buildMessages('hello world');
    expect(out).toHaveLength(2);
    expect(out[0]?.role).toBe('system');
    expect(out[1]).toEqual({ role: 'user', content: 'hello world' });
  });

  it("injects today's date into the system prompt", () => {
    const out = buildMessages('hello', new Date('2026-05-15T12:00:00Z'));
    expect(out[0]?.content).toContain("Today's date is 2026-05-15");
  });

  // Characterization: the prompt is tuned against evals, so any refactor of
  // how it is assembled must leave the bytes the model reads unchanged.
  // A plain read, not a file snapshot: `vitest -u` cannot rewrite it and a missing file fails.
  // Changing the prompt on purpose: write the new render over the golden yourself, and only
  // after an eval run (`pnpm eval:magic-compose`) says the new wording is no worse.
  it('renders the system prompt byte for byte as the golden file has it', () => {
    const out = buildMessages('x', new Date('2026-05-15T00:00:00Z'));
    const golden = readFileSync(path.join(__dirname, '__golden__/system-prompt.txt'), 'utf8');
    expect(out[0]?.content).toBe(golden);
  });
});

describe('MagicComposeDraftSchema', () => {
  const valid = {
    title: 'U9 snack duty',
    description: 'Saturdays in spring.',
    fields: [
      { ref: 'date', label: 'Date', fieldType: 'date' },
      { ref: 'opponent', label: 'Opponent', fieldType: 'text' },
    ],
    slots: [{ values: { date: '2026-04-25', opponent: 'Hawks' }, capacity: 2 }],
  };

  it('accepts a well-formed draft', () => {
    const r = MagicComposeDraftSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it('rejects an out-of-enum fieldType', () => {
    const r = MagicComposeDraftSchema.safeParse({
      ...valid,
      fields: [{ ref: 'essay', label: 'Essay', fieldType: 'essay' }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects non-kebab refs', () => {
    const r = MagicComposeDraftSchema.safeParse({
      ...valid,
      fields: [{ ref: 'CamelCase', label: 'X', fieldType: 'text' }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects too many fields', () => {
    const fields = Array.from({ length: MAX_FIELDS + 1 }, (_, i) => ({
      ref: `f-${i}`,
      label: `F${i}`,
      fieldType: 'text' as const,
    }));
    const r = MagicComposeDraftSchema.safeParse({ ...valid, fields });
    expect(r.success).toBe(false);
  });

  it('rejects too many slots', () => {
    const slots = Array.from({ length: MAX_SLOTS + 1 }, () => ({ values: {} }));
    const r = MagicComposeDraftSchema.safeParse({ ...valid, slots });
    expect(r.success).toBe(false);
  });

  it('rejects an empty title', () => {
    const r = MagicComposeDraftSchema.safeParse({ ...valid, title: '' });
    expect(r.success).toBe(false);
  });

  it('rejects a title of only spaces', () => {
    const r = MagicComposeDraftSchema.safeParse({ ...valid, title: '   ' });
    expect(r.success).toBe(false);
  });

  it('accepts a structured refusal payload (no fields or slots required)', () => {
    const r = MagicComposeDraftSchema.safeParse({
      refusalReason: 'OpenSignup does not draft data-harvesting forms.',
    });
    expect(r.success).toBe(true);
    if (r.success && 'refusalReason' in r.data) {
      expect(r.data.refusalReason).toMatch(/data-harvesting/);
    }
  });

  it('rejects a refusal with an empty refusalReason', () => {
    const r = MagicComposeDraftSchema.safeParse({ refusalReason: '' });
    expect(r.success).toBe(false);
  });
});

describe('draft limits', () => {
  // The draft is the input of Magic Compose and of the MCP create_signup and
  // add_field tools, so it must refuse exactly what the services refuse.
  const lengths = Array.from({ length: 2100 }, (_, n) => n);
  const accepts = (schema: { safeParse(v: unknown): { success: boolean } }, v: unknown) =>
    schema.safeParse(v).success;

  it('takes field labels of the same lengths as a slot field', () => {
    for (const n of lengths.slice(0, 200)) {
      const label = 'a'.repeat(n);
      expect(accepts(DraftFieldSchema, { ref: 'x', label, fieldType: 'text' }), `label ${n}`).toBe(
        accepts(SlotFieldInputSchema, {
          ref: 'x',
          label,
          fieldType: 'text',
          config: { fieldType: 'text' },
        }),
      );
    }
  });

  it('takes the same refs as a slot field', () => {
    for (const ref of ['', 'a', 'a-b', 'A', 'a_b', '-a', 'a--b', 'a'.repeat(40), 'a'.repeat(41)]) {
      expect(accepts(DraftFieldSchema, { ref, label: 'X', fieldType: 'text' }), `ref ${ref}`).toBe(
        accepts(SlotFieldInputSchema, {
          ref,
          label: 'X',
          fieldType: 'text',
          config: { fieldType: 'text' },
        }),
      );
    }
  });

  it('takes the same choices as an enum field, apart from allowing none', () => {
    const enumField = (choices: string[]) => ({
      ref: 'x',
      label: 'X',
      fieldType: 'enum' as const,
      config: { fieldType: 'enum' as const, choices },
    });
    for (const n of lengths.slice(0, 100)) {
      const choices = ['a'.repeat(n)];
      expect(accepts(DraftFieldSchema, { ...enumField(choices), choices }), `choice ${n}`).toBe(
        accepts(SlotFieldInputSchema, enumField(choices)),
      );
    }
    for (const n of lengths.slice(1, 40)) {
      const choices = Array.from({ length: n }, (_, i) => `c${i}`);
      expect(accepts(DraftFieldSchema, { ...enumField(choices), choices }), `${n} choices`).toBe(
        accepts(SlotFieldInputSchema, enumField(choices)),
      );
    }
  });

  it('takes titles and descriptions of the same lengths as a new signup', () => {
    const draft = {
      title: 'Snack duty',
      fields: [{ ref: 'x', label: 'X', fieldType: 'text' }],
      slots: [{ values: {} }],
    };
    for (const n of lengths.slice(0, 200)) {
      const title = 'a'.repeat(n);
      expect(accepts(FullDraftSchema, { ...draft, title }), `title ${n}`).toBe(
        accepts(SignupCreateInputSchema, { title }),
      );
    }
    for (const n of lengths) {
      const description = 'a'.repeat(n);
      expect(accepts(FullDraftSchema, { ...draft, description }), `description ${n}`).toBe(
        accepts(SignupCreateInputSchema, { title: 'Snack duty', description }),
      );
    }
  });
});

describe('QuestionsSchema', () => {
  const ask = (questions: Record<string, unknown>) => ({ questions });
  const parse = (v: unknown) => MagicComposeDraftSchema.safeParse(v);

  it('accepts a questions reply and reads it as one', () => {
    const r = parse(
      ask({
        topics: ['what', 'when', 'how_many'],
        whatOptions: ['Bake something', 'Staff the table'],
      }),
    );
    expect(r.success).toBe(true);
    if (r.success) expect(isQuestionsReply(r.data)).toBe(true);
  });

  it('accepts just "what", with up to four options, trimmed', () => {
    const r = QuestionsSchema.safeParse(
      ask({ topics: ['what'], whatOptions: [' A ', 'B', 'C', 'D'] }),
    );
    expect(r.success && r.data.questions.whatOptions).toEqual(['A', 'B', 'C', 'D']);
  });

  it('drops a repeated or unknown topic, and a blank or over-long option, as the page can still ask', () => {
    const r = QuestionsSchema.safeParse(
      ask({
        topics: ['what', 'what', 'where', 'when'],
        whatOptions: ['A', '  ', 'x'.repeat(41), 'B'],
      }),
    );
    expect(r.success && r.data.questions).toEqual({
      topics: ['what', 'when'],
      whatOptions: ['A', 'B'],
    });
  });

  it.each([
    ['without what', { topics: ['when', 'how_many'], whatOptions: ['A', 'B'] }],
    ['with only an unknown topic', { topics: ['where'], whatOptions: ['A', 'B'] }],
    ['with no topics', { topics: [], whatOptions: ['A', 'B'] }],
    ['with one option', { topics: ['what'], whatOptions: ['A'] }],
    ['with one option, offered twice', { topics: ['what'], whatOptions: ['Bake', 'bake'] }],
    ['with a blank option', { topics: ['what'], whatOptions: ['A', '  '] }],
    ['with an option over 40 characters', { topics: ['what'], whatOptions: ['A', 'x'.repeat(41)] }],
    ['with an extra key inside', { topics: ['what'], whatOptions: ['A', 'B'], wording: 'What?' }],
  ])('rejects one %s', (_, questions) => {
    expect(parse(ask(questions)).success).toBe(false);
  });

  it('rejects a reply that mixes questions with a draft', () => {
    const draft = {
      title: 'Bake sale',
      fields: [{ ref: 'what', label: 'What', fieldType: 'text' }],
      slots: [{ values: { what: 'TBD: item 1' } }],
    };
    expect(
      parse({ ...draft, questions: { topics: ['what'], whatOptions: ['A', 'B'] } }).success,
    ).toBe(false);
    expect(parse({ ...draft, questions: { topics: ['when'] } }).success).toBe(false);
    expect(parse(draft).success).toBe(true);
  });

  it('still rejects a reply that is none of draft, refusal or questions', () => {
    expect(parse({}).success).toBe(false);
    expect(parse({ answer: 'Sure!' }).success).toBe(false);
  });

  it('drops null keys first, as models in json_object mode send them for keys they skip', () => {
    const draft = {
      title: 'Bake sale',
      fields: [{ ref: 'what', label: 'What', fieldType: 'text' }],
      slots: [{ values: { what: 'Staff the table' } }],
      groupBy: null,
    };
    const asDraft = parse({ ...draft, questions: null, refusalReason: null });
    expect(asDraft.success && isQuestionsReply(asDraft.data)).toBe(false);
    expect(asDraft.success && 'title' in asDraft.data).toBe(true);
    const asked = parse(ask({ topics: ['what'], whatOptions: ['A', 'B'] }));
    const askedWithNull = parse({
      ...ask({ topics: ['what'], whatOptions: ['A', 'B'] }),
      refusalReason: null,
    });
    expect(askedWithNull).toEqual(asked);
  });

  it('tidies the options as it tidies the answers, so a doubled space is one', () => {
    const r = QuestionsSchema.parse(
      ask({ topics: ['what'], whatOptions: ['Staff  the\ntable', 'Bake'] }),
    );
    expect(r.questions.whatOptions).toEqual(['Staff the table', 'Bake']);
    expect(
      QuestionsSchema.parse(
        ask({ topics: ['what'], whatOptions: ['Staff  the table', 'Bake', 'staff the table'] }),
      ).questions.whatOptions,
    ).toEqual(['Staff the table', 'Bake']);
  });

  it('keeps the first four options, so five still ask a question', () => {
    const r = QuestionsSchema.safeParse(
      ask({ topics: ['what'], whatOptions: ['A', 'B', 'C', 'D', 'E'] }),
    );
    expect(r.success && r.data.questions.whatOptions).toEqual(['A', 'B', 'C', 'D']);
  });

  it('drops an option offered twice, case aside, before it keeps four', () => {
    const r = QuestionsSchema.safeParse(
      ask({ topics: ['what'], whatOptions: ['Bake', 'Staff', 'BAKE', 'Set up', 'Clean', 'Pack'] }),
    );
    expect(r.success && r.data.questions.whatOptions).toEqual(['Bake', 'Staff', 'Set up', 'Clean']);
  });

  it('skips an option too long to show and takes the next', () => {
    const long = 'x'.repeat(41);
    const r = QuestionsSchema.safeParse(
      ask({ topics: ['what'], whatOptions: ['A', 'B', long, 'C', 'D', 'E'] }),
    );
    expect(r.success && r.data.questions.whatOptions).toEqual(['A', 'B', 'C', 'D']);
  });

  it('lets a refusal win over anything beside it, as before', () => {
    const r = parse({
      refusalReason: 'No.',
      questions: { topics: ['what'], whatOptions: ['A', 'B'] },
    });
    expect(r.success && 'refusalReason' in r.data).toBe(true);
  });
});

describe('asksQuestions', () => {
  it('reads any reply with a questions key as asking, whatever its shape', () => {
    expect(
      asksQuestions({
        questions: { topics: ['what', 'when', 'how_many'], whatOptions: ['A', 'B'] },
      }),
    ).toBe(true);
    expect(asksQuestions({ questions: { topics: ['when'] } })).toBe(true);
    expect(asksQuestions({ title: 'Half a draft', questions: { topics: ['what'] } })).toBe(true);
  });

  it('reads a null questions key as absent, and a refusal as a refusal', () => {
    expect(asksQuestions({ title: 'Bake sale', fields: [], slots: [], questions: null })).toBe(
      false,
    );
    expect(asksQuestions({ questions: { topics: ['what'] }, refusalReason: 'No.' })).toBe(false);
    expect(asksQuestions({ questions: { topics: ['what'] }, refusalReason: null })).toBe(true);
    expect(asksQuestions(null)).toBe(false);
    expect(asksQuestions(['questions'])).toBe(false);
  });
});
