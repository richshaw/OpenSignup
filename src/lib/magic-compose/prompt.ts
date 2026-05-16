import { z } from 'zod';

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

const FIELD_TYPES = ['text', 'date', 'time', 'number', 'enum'] as const;

const DraftFieldSchema = z.object({
  ref: RefSchema,
  label: z.string().min(1).max(80),
  fieldType: z.enum(FIELD_TYPES),
  required: z.boolean().optional().default(false),
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
  capacity: z.number().int().positive().nullable().optional().default(1),
});

export const MagicComposeDraftSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().max(2000).default(''),
  fields: z.array(DraftFieldSchema).min(1).max(MAX_FIELDS),
  slots: z.array(DraftSlotSchema).min(1).max(MAX_SLOTS),
});

export type MagicComposeDraft = z.infer<typeof MagicComposeDraftSchema>;

const SYSTEM_PROMPT = `You are OpenSignup's signup drafter. OpenSignup is a coordination tool where organizers create signups containing slots, and participants commit to slots without ever creating an account.

Return ONLY a JSON object matching this shape:

{
  "title": "<short signup title, 2-120 chars>",
  "description": "<one short paragraph, max 2000 chars; OK to be empty>",
  "fields": [
    { "ref": "<lowercase-kebab>", "label": "<Human label>", "fieldType": "text|date|time|number|enum", "required": <bool>, "choices": ["<for enum only>"] }
  ],
  "slots": [
    { "values": { "<field-ref>": <value> }, "capacity": <positive int, or null for unlimited> }
  ]
}

LOAD-BEARING RULES:

1. Slots are the atom, not questions. Do NOT synthesize free-form question fields just because a real-world signup form would have them. If the prompt does not ask to capture per-participant context, do not invent it. Bad: a "favorite color" or "essay" text field. Good: slot rows the participant signs up FOR.

2. fieldType must be one of: text, date, time, number, enum. No other values. There is no "essay" or "longtext".

3. Never produce slot fields that capture personal data like social security numbers, dates of birth, government IDs, home addresses, or financial information, even if asked. If the user asks for any of these, refuse the request by returning a JSON object with title set to "Cannot generate this signup" and a description explaining why, and a minimal placeholder fields/slots pair so the schema still validates.

4. Never invent dates, locations, or capacities that aren't in the user's prompt. If the prompt is vague, prefer fewer slots with labels that signal the gap (e.g. "Saturday game 1" with no date set) over guessing.

5. ref must be lowercase-kebab-case, max 40 chars, e.g. "date", "opponent", "snack-item". One ref per field, unique.

6. Slots' "values" keys must match a declared field "ref". Date values use YYYY-MM-DD. Time values use 24-hour HH:MM. Enum values must match one of the declared choices exactly.

7. Do not emit slugs, IDs, workspace IDs, organizer IDs (anything like sig_…, ws_…, org_…, mem_…), or a status field. The server generates IDs and always sets status to draft.

8. Max ${MAX_FIELDS} fields. Max ${MAX_SLOTS} slots.

9. Output ONLY the JSON object. No prose, no markdown fences, no commentary.

10. Today's date is {{TODAY}}. When the user gives a month and day with no year (e.g. "April 25"), assume the next occurrence of that date relative to today.`;

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
 * JSON Schema sent to the provider via response_format. Mirrors
 * MagicComposeDraftSchema. `values` is intentionally permissive because
 * slot values are keyed by field `ref`, which we don't know at schema time.
 */
export const RESPONSE_JSON_SCHEMA = {
  name: 'magic_compose_draft',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'description', 'fields', 'slots'],
    properties: {
      title: { type: 'string', minLength: 2, maxLength: 120 },
      description: { type: 'string', maxLength: 2000 },
      fields: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_FIELDS,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['ref', 'label', 'fieldType', 'required', 'choices'],
          properties: {
            ref: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
            label: { type: 'string', minLength: 1, maxLength: 80 },
            fieldType: { type: 'string', enum: ['text', 'date', 'time', 'number', 'enum'] },
            required: { type: 'boolean' },
            // null when not an enum field; array of strings when it is.
            choices: {
              anyOf: [{ type: 'null' }, { type: 'array', items: { type: 'string' } }],
            },
          },
        },
      },
      slots: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_SLOTS,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['values', 'capacity'],
          properties: {
            values: { type: 'object', additionalProperties: true },
            capacity: {
              anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }],
            },
          },
        },
      },
    },
  },
} as const;
