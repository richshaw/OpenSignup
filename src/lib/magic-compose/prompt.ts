import { z } from 'zod';
import { DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH, TITLE_MIN_LENGTH, TitleSchema } from '@/schemas/signups';
import {
  ChoiceSchema,
  FIELD_TYPES,
  LabelSchema,
  MAX_CHOICES,
  RefSchema,
} from '@/schemas/slot-fields';
import {
  FIELD_TYPE_GUIDE,
  GROUP_BY_SCAN_AXIS,
  NO_INTAKE_FORMS,
  NO_PERSONAL_DATA,
  ONE_SLOT_PER_COMBINATION,
  SLOTS_ARE_THE_ATOM,
  USE_CAPACITY_NOT_DUPLICATE_ROWS,
  USE_DATE_AND_TIME_FIELDS,
  neverInventRule,
} from '@/lib/signup-rules';
import { WHAT_OPTION_MAX_LENGTH, WHAT_OPTIONS_MAX, WHAT_OPTIONS_MIN } from './limits';
import { QUESTION_TOPICS, tidyText, type MagicComposeQuestions } from './questions';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export const MAX_FIELDS = 20;
export const MAX_SLOTS = 200;

export const DraftFieldSchema = z.object({
  ref: RefSchema,
  label: LabelSchema,
  fieldType: z.enum(FIELD_TYPES),
  // Accept null (sent by strict json_schema models for non-enum fields) or an array.
  choices: z
    .array(ChoiceSchema)
    .max(MAX_CHOICES)
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
});

const DraftSlotSchema = z.object({
  values: z.record(z.string(), z.unknown()).default({}),
  // Accept any integer (the JSON schema sent to Gemini cannot encode
  // "positive only" with Gemini-safe keywords). The converter normalises
  // anything <=0 to 1.
  capacity: z.number().int().nullable().optional().default(1),
});

export const FullDraftSchema = z.object({
  title: TitleSchema,
  description: z.string().max(DESCRIPTION_MAX_LENGTH).default(''),
  fields: z.array(DraftFieldSchema).min(1).max(MAX_FIELDS),
  slots: z.array(DraftSlotSchema).min(1).max(MAX_SLOTS),
  /** Field ref to visually group slots by in the participant view. */
  groupBy: z.string().nullable().optional().transform((v) => v ?? undefined),
});

/**
 * Structured refusal. The model returns ONLY this object — no title, fields,
 * or slots — when the prompt asks for something OpenSignup will not generate
 * (PII harvesting, intake/application forms). The route short-circuits on this
 * shape before createSignup so no DB row is created.
 */
const RefusalSchema = z.object({
  refusalReason: z.string().min(1).max(500),
});

/**
 * The topics the page can ask about, each once. A model that adds one the page
 * doesn't know ("where") has still asked the ones it does.
 */
function knownTopics(topics: string[]): string[] {
  const known: readonly string[] = QUESTION_TOPICS;
  return [...new Set(topics.filter((t) => known.includes(t)))];
}

/**
 * The options the page offers: each once, case aside, none blank or over
 * `WHAT_OPTION_MAX_LENGTH`, and the first `WHAT_OPTIONS_MAX` of those. A model
 * that offers five, one twice, or one too long has still asked a question the
 * page can show.
 */
function firstDistinctOptions(options: string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const option of options) {
    if (kept.length === WHAT_OPTIONS_MAX) break;
    const key = option.toLowerCase();
    if (option.length === 0 || option.length > WHAT_OPTION_MAX_LENGTH || seen.has(key)) continue;
    seen.add(key);
    kept.push(option);
  }
  return kept;
}

/**
 * The model's answer when it can't draft real slots: which topics are
 * missing, and the "what" list. Asking "what", it offers a few options for it.
 * Not asking it (the description says what, but every slot would be a "TBD:"
 * placeholder), it must ask "when", and the list holds the things the
 * description names, at least one. Strict at both levels, because `z.object`
 * drops keys it doesn't know: a reply mixing questions with half a draft must
 * fail, not pass as whichever arm fits. The topics and options are cut to the
 * ones the page can show before they're checked, so only those have to be
 * right.
 */
export const QuestionsSchema = z
  .object({
    questions: z
      .object({
        topics: z
          .array(z.string())
          .transform(knownTopics)
          .pipe(
            z
              .array(z.enum(QUESTION_TOPICS))
              .refine(
                (t) => t.includes('what') || t.includes('when'),
                'questions ask what people sign up for, or when',
              ),
          ),
        whatOptions: z
          .array(z.string().transform(tidyText))
          .transform(firstDistinctOptions)
          .pipe(z.array(z.string()).min(1)),
      })
      .strict()
      .refine((q) => !q.topics.includes('what') || q.whatOptions.length >= WHAT_OPTIONS_MIN, {
        message: `asking what people sign up for takes at least ${WHAT_OPTIONS_MIN} options`,
        path: ['whatOptions'],
      }),
  })
  .strict();

/**
 * The reply without its null top-level keys. Models in json_object mode often
 * send null for a key they don't use (as `choices` and `groupBy` already
 * allow), so a draft with `"questions": null` is a draft, and questions with
 * `"refusalReason": null` are questions.
 */
function withoutNullKeys(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null));
}

/**
 * A refusal still wins, as it always has (`RefusalSchema` isn't strict). A
 * reply carrying `questions` is a questions reply and nothing else, so the
 * draft arm refuses that key; `FullDraftSchema` itself stays as it is, since
 * the MCP `create_signup` tool validates with it.
 */
export const MagicComposeDraftSchema = z.preprocess(
  withoutNullKeys,
  z.union([RefusalSchema, QuestionsSchema, FullDraftSchema.extend({ questions: z.undefined() })]),
);

export type MagicComposeDraft = z.infer<typeof FullDraftSchema>;
export type MagicComposeParsed = z.infer<typeof MagicComposeDraftSchema>;

/**
 * Whether a raw reply asks questions, in any shape, read as
 * `MagicComposeDraftSchema` reads it (null keys dropped, a refusal winning).
 * After the answers, a model that asks again most likely asks about less than
 * the first time (only "when", say, with no options), which `QuestionsSchema`
 * would reject as malformed and the organizer would see as a broken draft. A
 * first call's questions that `QuestionsSchema` rejects (neither "what" nor
 * "when", one option for "what") are caught the same way.
 */
export function asksQuestions(value: unknown): boolean {
  const reply = withoutNullKeys(value);
  return (
    typeof reply === 'object' &&
    reply !== null &&
    'questions' in reply &&
    !('refusalReason' in reply)
  );
}

/** A parsed reply that asks questions instead of drafting. */
export function isQuestionsReply(p: MagicComposeParsed): p is { questions: MagicComposeQuestions } {
  return 'questions' in p && p.questions !== undefined;
}

const SYSTEM_PROMPT = `You are OpenSignup's signup drafter. OpenSignup is a coordination tool where organizers create signups containing slots, and participants commit to slots without ever creating an account.

Output schema (return ONLY this JSON object, no prose, no fences):

{
  "title": "<short signup title, ${TITLE_MIN_LENGTH}-${TITLE_MAX_LENGTH} chars>",
  "description": "<one short paragraph, max ${DESCRIPTION_MAX_LENGTH} chars; OK to be empty>",
  "fields": [
    { "ref": "<lowercase-kebab>", "label": "<Human label>", "fieldType": "text|date|time|number|enum", "choices": [<strings, [] when not enum>] }
  ],
  "slots": [
    { "values": { "<field-ref>": <value>, ... }, "capacity": <integer, 1 by default; null only if the prompt or answers say there's no limit> }
  ],
  "groupBy": "<field-ref to group slots by, or null>"
}

QUESTIONS — only when the prompt doesn't say what people sign up for, or every slot would be a "TBD:" placeholder (rule 4), return ONLY this object instead of a draft:

{ "questions": { "topics": ["what", "when", "how_many"], "whatOptions": ["<option>", "<option>"] } }

- topics: only the ones the prompt leaves out. "what" when it doesn't say what people sign up for; when it does, leave "what" out and include "when". Leave out "when" if it gives a date, a day of the week or a time, and "how_many" if it gives a count.
- whatOptions, asking "what": ${WHAT_OPTIONS_MIN} to ${WHAT_OPTIONS_MAX} kinds of thing people could sign up for, in the prompt's language, each at most ${WHAT_OPTION_MAX_LENGTH} characters. Never a date, a time or a count: the app asks for those itself. If the options would be the prompt's own items or roles, it already says what: don't ask about it (rule 4: ask "when" if every slot would be a "TBD:" placeholder, otherwise draft).
- whatOptions, not asking "what": 1 to ${WHAT_OPTIONS_MAX} things people sign up for, read from the prompt, in its language, each at most ${WHAT_OPTION_MAX_LENGTH} characters. Never a date, a time or a count.
- A message that carries "Answers to your questions:" is never answered with questions. Draft from the answers.

${FIELD_TYPE_GUIDE}

DATES AND TIMES — ${USE_DATE_AND_TIME_FIELDS} See Example F.

CROSS-PRODUCT EXPANSION — most important rule:

When the user describes a grid of dimensions (e.g. "3 classes × 12 time slots", "6 games × 2 family roles", "2 days × 3 shifts"), ${ONE_SLOT_PER_COMBINATION} Every slot's "values" object MUST contain a value for every declared field's "ref" — never emit an empty values object.

CAPACITY — one slot, not one row per person:

${USE_CAPACITY_NOT_DUPLICATE_ROWS}

GROUPING — ${GROUP_BY_SCAN_AXIS}:
- Cross-product with a small named dimension (classes, teachers, stations): groupBy that dimension's ref.
- Pure date list (weekly games, shift dates): groupBy = null.
- Single dimension with many text labels: groupBy = null.
- If every slot would have a unique value for the candidate field (one row per value, no repeats), set groupBy = null — grouping only helps when participants can scan multiple options under one heading.

WORKED EXAMPLES — study these patterns then apply to the user's request:

Example A — parent-teacher conferences, 2 classes × 4 time slots = 8 slots:

USER: "Parent teacher conferences. 2 classes, Maple and Cedar. 30 min slots from 9am to 10:30am."

OUTPUT:
{
  "title": "Parent-teacher conferences, Maple and Cedar",
  "description": "30-minute slots. Sign up under your child's class.",
  "fields": [
    { "ref": "class", "label": "Class", "fieldType": "enum", "choices": ["Maple", "Cedar"] },
    { "ref": "time", "label": "Time", "fieldType": "time", "choices": [] }
  ],
  "slots": [
    { "values": { "class": "Maple", "time": "09:00" }, "capacity": 1 },
    { "values": { "class": "Maple", "time": "09:30" }, "capacity": 1 },
    { "values": { "class": "Maple", "time": "10:00" }, "capacity": 1 },
    { "values": { "class": "Maple", "time": "10:30" }, "capacity": 1 },
    { "values": { "class": "Cedar", "time": "09:00" }, "capacity": 1 },
    { "values": { "class": "Cedar", "time": "09:30" }, "capacity": 1 },
    { "values": { "class": "Cedar", "time": "10:00" }, "capacity": 1 },
    { "values": { "class": "Cedar", "time": "10:30" }, "capacity": 1 }
  ],
  "groupBy": "class"
}

Example B — weekly snack roster, 6 dated games:

USER: "Snack duty for U9 soccer. 6 Saturday games starting April 25. Two families per game."

OUTPUT:
{
  "title": "U9 snack duty, Spring",
  "description": "Two families bring snacks and drinks each Saturday.",
  "fields": [
    { "ref": "game", "label": "Game", "fieldType": "text", "choices": [] },
    { "ref": "date", "label": "Date", "fieldType": "date", "choices": [] }
  ],
  "slots": [
    { "values": { "game": "Game 1", "date": "2026-04-25" }, "capacity": 2 },
    { "values": { "game": "Game 2", "date": "2026-05-02" }, "capacity": 2 },
    { "values": { "game": "Game 3", "date": "2026-05-09" }, "capacity": 2 },
    { "values": { "game": "Game 4", "date": "2026-05-16" }, "capacity": 2 },
    { "values": { "game": "Game 5", "date": "2026-05-23" }, "capacity": 2 },
    { "values": { "game": "Game 6", "date": "2026-05-30" }, "capacity": 2 }
  ],
  "groupBy": null
}

Example C — doesn't say what people sign up for, so ask:

USER: "Make a signup for my kid's soccer team"

OUTPUT:
{
  "questions": {
    "topics": ["what", "when", "how_many"],
    "whatOptions": ["Bring snacks", "Drive to away games", "Help at practice"]
  }
}

Example D — says what but not when, so every slot would be a placeholder: ask about when, not what:

USER: "Ushers for the school play, two parents per performance"

OUTPUT:
{
  "questions": {
    "topics": ["when"],
    "whatOptions": ["Usher at the play"]
  }
}

Example E — lists what but gives no date or count, so draft, with no date field or placeholders:

USER: "Gear families could lend for the troop's camping trip: a canopy tent, a camp stove, a cooler and a lantern"

OUTPUT:
{
  "title": "Camping trip gear to lend",
  "description": "Pick one item you can lend for the troop's camping trip.",
  "fields": [
    { "ref": "item", "label": "Item", "fieldType": "text", "choices": [] }
  ],
  "slots": [
    { "values": { "item": "Canopy tent" }, "capacity": 1 },
    { "values": { "item": "Camp stove" }, "capacity": 1 },
    { "values": { "item": "Cooler" }, "capacity": 1 },
    { "values": { "item": "Lantern" }, "capacity": 1 }
  ],
  "groupBy": null
}

Example F — one day, with a time, so every slot carries that date and time:

USER: "Car wash for the band trip on Saturday, June 6, 9am to 1pm: 4 people to wash cars and 2 to take payments"

OUTPUT:
{
  "title": "Band trip car wash",
  "description": "Car wash for the band trip, 9am to 1pm.",
  "fields": [
    { "ref": "job", "label": "Job", "fieldType": "text", "choices": [] },
    { "ref": "date", "label": "Date", "fieldType": "date", "choices": [] },
    { "ref": "time", "label": "Time", "fieldType": "time", "choices": [] }
  ],
  "slots": [
    { "values": { "job": "Wash cars", "date": "2026-06-06", "time": "09:00" }, "capacity": 4 },
    { "values": { "job": "Take payments", "date": "2026-06-06", "time": "09:00" }, "capacity": 2 }
  ],
  "groupBy": null
}

LOAD-BEARING RULES:

1. ${SLOTS_ARE_THE_ATOM} Per-slot context fields are fine and expected ("class" enum, "game" text, "time" value) — they describe the slot the participant signs up FOR. ${NO_INTAKE_FORMS} If the prompt asks for an intake or application form (essay questions, child profile, multi-question application, contact rosters, broad medical/emergency-info collection), refuse using the rule 3 refusal pattern — OpenSignup coordinates participation, not per-participant data capture. Individual field names are not inherently bad; the prompt's *shape* (coordination vs intake) is what determines refusal.

2. fieldType is exactly one of: text, date, time, number, enum. No other values.

3. ${NO_PERSONAL_DATA} To refuse, return ONLY this object — no title, fields, or slots: {"refusalReason":"<short sentence explaining why this is not something OpenSignup will draft>"}. The server short-circuits on this shape and surfaces the reason to the user without persisting anything.

4. ${neverInventRule('drafter')}

5. ref must be lowercase-kebab-case, max 40 chars. One ref per field, unique.

6. Every slot's "values" MUST be non-empty and MUST contain a value for every declared field "ref". Date values use YYYY-MM-DD. Time values use 24-hour HH:MM. Enum values must match one of the declared choices exactly.

7. Do not emit slugs, IDs, workspace IDs, organizer IDs (sig_…, ws_…, org_…, mem_…), or a status field. The server generates IDs and always sets status to draft.

8. Max ${MAX_FIELDS} fields. Max ${MAX_SLOTS} slots. If a literal expansion would exceed 200 slots, cap by the less-informative dimension and note the cap in description.

9. capacity is 1 (one participant per slot) unless the user gives a count. No limit ("unlimited", "as many as want") means null; never null as a guess.

10. Today's date is {{TODAY}}. When the user gives a month and day with no year, assume the next occurrence relative to today.`;

function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function renderSystemPrompt(today: string): string {
  return SYSTEM_PROMPT.replaceAll('{{TODAY}}', today);
}

export function buildMessages(userPrompt: string, now: Date = new Date()): ChatMessage[] {
  return [
    { role: 'system', content: renderSystemPrompt(todayIso(now)) },
    { role: 'user', content: userPrompt },
  ];
}
