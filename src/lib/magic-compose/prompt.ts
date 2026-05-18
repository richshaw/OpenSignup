import { z } from 'zod';
import { FIELD_TYPES } from '@/schemas/slot-fields';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export const MAX_FIELDS = 20;
export const MAX_SLOTS = 200;

const RefSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'ref must be lowercase kebab');

const DraftFieldSchema = z.object({
  ref: RefSchema,
  label: z.string().min(1).max(80),
  fieldType: z.enum(FIELD_TYPES),
  // Accept null (sent by strict json_schema models for non-enum fields) or an array.
  choices: z
    .array(z.string().min(1).max(60))
    .max(20)
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
  title: z.string().min(2).max(120),
  description: z.string().max(2000).default(''),
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
export const RefusalSchema = z.object({
  refusalReason: z.string().min(1).max(500),
});

export const MagicComposeDraftSchema = z.union([RefusalSchema, FullDraftSchema]);

export type MagicComposeDraft = z.infer<typeof FullDraftSchema>;
export type MagicComposeRefusal = z.infer<typeof RefusalSchema>;
export type MagicComposeParsed = z.infer<typeof MagicComposeDraftSchema>;

const SYSTEM_PROMPT = `You are OpenSignup's signup drafter. OpenSignup is a coordination tool where organizers create signups containing slots, and participants commit to slots without ever creating an account.

Output schema (return ONLY this JSON object, no prose, no fences):

{
  "title": "<short signup title, 2-120 chars>",
  "description": "<one short paragraph, max 2000 chars; OK to be empty>",
  "fields": [
    { "ref": "<lowercase-kebab>", "label": "<Human label>", "fieldType": "text|date|time|number|enum", "choices": [<strings, [] when not enum>] }
  ],
  "slots": [
    { "values": { "<field-ref>": <value>, ... }, "capacity": <integer, 1 by default> }
  ],
  "groupBy": "<field-ref to group slots by, or null>"
}

FIELD TYPE GUIDE — pick the most specific type, not enum:

- date  → calendar dates. Values are "YYYY-MM-DD". Use when slots are dated games, shifts, meetings.
- time  → times of day. Values are "HH:MM" 24-hour. Use for appointment slots, shift starts. NEVER use enum to fake a time column.
- number → quantities. Use for counts (e.g. cookies needed = 80).
- enum  → CLOSED set of named labels with no natural type. Examples: a teacher's name, a station name, a class section ("Maple", "Cedar"). NEVER use enum for times, dates, or numbers.
- text  → free-form short labels (game name "Game 1", opponent "Hawks", item "Snack + drinks").

CROSS-PRODUCT EXPANSION — most important rule:

When the user describes a grid of dimensions (e.g. "3 classes × 12 time slots", "6 games × 2 family roles", "2 days × 3 shifts"), produce ONE slot per combination, not one slot per dimension. That means N×M slots total. Every slot's "values" object MUST contain a value for every declared field's "ref" — never emit an empty values object.

GROUPING — set "groupBy" to the field ref the participant will visually scan by:
- Cross-product with a small named dimension (classes, teachers, stations): groupBy that dimension's ref.
- Pure date list (weekly games, shift dates): groupBy = null.
- Single dimension with many text labels: groupBy = null.

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

Example C — vague prompt, no invention:

USER: "Make a signup for my kid's soccer team"

OUTPUT:
{
  "title": "Soccer team signup",
  "description": "Replace these placeholder slots with the real games, snack duties, or carpool shifts.",
  "fields": [
    { "ref": "what", "label": "What", "fieldType": "text", "choices": [] }
  ],
  "slots": [
    { "values": { "what": "TBD: game 1" }, "capacity": 1 },
    { "values": { "what": "TBD: game 2" }, "capacity": 1 },
    { "values": { "what": "TBD: game 3" }, "capacity": 1 }
  ],
  "groupBy": null
}

LOAD-BEARING RULES:

1. Slots are the atom, not questions. Per-slot context fields are fine and expected ("class" enum, "game" text, "time" value) — they describe the slot the participant signs up FOR. What is not fine is turning the signup into a participant intake / application form that captures personal data per participant. If the prompt asks for an intake or application form (essay questions, child profile, multi-question application, contact rosters, broad medical/emergency-info collection), refuse using the rule 3 refusal pattern — OpenSignup coordinates participation, not per-participant data capture. Individual field names are not inherently bad; the prompt's *shape* (coordination vs intake) is what determines refusal.

2. fieldType is exactly one of: text, date, time, number, enum. No other values.

3. Never produce slot fields that capture personal data like social security numbers, dates of birth, government IDs, home addresses, or financial information, even if asked. To refuse, return ONLY this object — no title, fields, or slots: {"refusalReason":"<short sentence explaining why this is not something OpenSignup will draft>"}. The server short-circuits on this shape and surfaces the reason to the user without persisting anything.

4. Never invent dates, locations, opponents, schedules, or capacities that aren't in the user's prompt. If the prompt is vague (no dates, no specific count, no specifics — e.g. "make a signup for my kid's soccer team"), produce 1-3 placeholder slots with labels like "TBD: game 1", "TBD: shift 1" and call out the gap in description ("Add specific dates/details here"). Do not fabricate a season's worth of games, opponents, or shifts just to fill the signup.

5. ref must be lowercase-kebab-case, max 40 chars. One ref per field, unique.

6. Every slot's "values" MUST be non-empty and MUST contain a value for every declared field "ref". Date values use YYYY-MM-DD. Time values use 24-hour HH:MM. Enum values must match one of the declared choices exactly.

7. Do not emit slugs, IDs, workspace IDs, organizer IDs (sig_…, ws_…, org_…, mem_…), or a status field. The server generates IDs and always sets status to draft.

8. Max ${MAX_FIELDS} fields. Max ${MAX_SLOTS} slots. If a literal expansion would exceed 200 slots, cap by the less-informative dimension and note the cap in description.

9. capacity defaults to 1 (one participant per slot) unless the user clearly says otherwise.

10. Today's date is {{TODAY}}. When the user gives a month and day with no year, assume the next occurrence relative to today.`;

function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function renderSystemPrompt(today: string): string {
  return SYSTEM_PROMPT.replace('{{TODAY}}', today);
}

export function buildMessages(userPrompt: string, now: Date = new Date()): ChatMessage[] {
  return [
    { role: 'system', content: renderSystemPrompt(todayIso(now)) },
    { role: 'user', content: userPrompt },
  ];
}

export function getSystemPromptForTests(): string {
  return renderSystemPrompt(todayIso());
}

/**
 * Reference JSON Schema describing the expected draft shape. NOT currently
 * sent to the provider: `defaultLlmClient` requests `response_format:
 * { type: 'json_object' }` because Gemini's strict structured-output mode
 * stalled on the permissive `values` object until the token cap. This
 * constant lives on as (a) executable documentation of the contract and
 * (b) a drift-lock in `prompt.test.ts` — if a property is added to the Zod
 * schema, this object must be updated too, which forces the question of
 * whether to enable strict mode for providers that handle it well.
 *
 * Uses only the subset of keywords that Gemini, OpenAI, Anthropic, and
 * Ollama all accept: type, enum, properties, required, items. No
 * additionalProperties, pattern, anyOf, minLength/maxLength, or
 * minItems/maxItems — Gemini rejects those.
 *
 * `choices` is an array of strings (empty for non-enum fields). `capacity`
 * is an integer or null; null means "unlimited" and any positive integer
 * caps the slot at that count (the converter normalises 0 / negative to 1).
 * `values` is a free-form object because slot value keys are dynamic.
 */
export const RESPONSE_JSON_SCHEMA = {
  name: 'magic_compose_draft',
  strict: true,
  schema: {
    type: 'object',
    required: ['title', 'description', 'fields', 'slots', 'groupBy'],
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      fields: {
        type: 'array',
        items: {
          type: 'object',
          required: ['ref', 'label', 'fieldType', 'choices'],
          properties: {
            ref: { type: 'string' },
            label: { type: 'string' },
            fieldType: {
              type: 'string',
              enum: ['text', 'date', 'time', 'number', 'enum'],
            },
            choices: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      slots: {
        type: 'array',
        items: {
          type: 'object',
          required: ['values', 'capacity'],
          properties: {
            values: { type: 'object' },
            capacity: { type: 'integer' },
          },
        },
      },
      groupBy: { type: 'string', nullable: true },
      refusalReason: { type: 'string', nullable: true },
    },
  },
} as const;
