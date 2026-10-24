import { z } from 'zod';
import { isRealDate, isRealTime } from '@/lib/reminder-fields';
import {
  HOW_MANY_MAX,
  WHAT_ITEM_MAX_LENGTH,
  WHAT_ITEMS_MAX,
  WHAT_OPTIONS_MAX,
  WHEN_TEXT_MAX_LENGTH,
} from './limits';
import { buildMessages, type ChatMessage } from './prompt';
import { followUpItems, tidyText, type FollowUp, type WhenAnswer } from './questions';

/** Text through `tidyText`, then checked for length. */
function tidy(max: number, what: string) {
  return z
    .string()
    .transform(tidyText)
    .pipe(
      z
        .string()
        .min(1, `${what} can't be blank`)
        .max(max, `${what} can be at most ${max} characters`),
    );
}

const Item = tidy(WHAT_ITEM_MAX_LENGTH, 'Each thing people sign up for');

const Time = z.string().refine(isRealTime, 'Times are HH:MM, from 00:00 to 23:59');

const WhenSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('one_day'),
      date: z.string().refine(isRealDate, 'The date must be a real day, as YYYY-MM-DD'),
      from: Time.optional(),
      to: Time.optional(),
    })
    .strict(),
  z.object({ kind: z.literal('several'), text: tidy(WHEN_TEXT_MAX_LENGTH, 'When') }).strict(),
  z.object({ kind: z.literal('not_decided') }).strict(),
]);

const CountSchema = z
  .number()
  .int('Counts are whole numbers')
  .min(1, 'Counts start at 1; leave the box empty for no limit')
  .max(HOW_MANY_MAX, `Counts go up to ${HOW_MANY_MAX}`)
  .nullable();

/**
 * The organizer's answers to the questions round (see `FollowUp`). The values
 * are checked here, before any quota is charged, so the model gets exact
 * values: a real date, times in order, whole counts, one per item.
 */
export const FollowUpSchema: z.ZodType<FollowUp, z.ZodTypeDef, unknown> = z
  .object({
    what: z
      .object({
        picked: z.array(Item).max(WHAT_OPTIONS_MAX),
        added: z.array(Item).max(WHAT_ITEMS_MAX),
      })
      .strict(),
    when: WhenSchema.optional(),
    howMany: z.array(CountSchema).optional(),
    placeholders: z.literal(true).optional(),
  })
  .strict()
  .superRefine((f, ctx) => {
    const items = followUpItems(f);
    if (items.length > WHAT_ITEMS_MAX) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['what'],
        message: `At most ${WHAT_ITEMS_MAX} things people sign up for`,
      });
    }
    if (new Set(items.map((i) => i.toLowerCase())).size !== items.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['what'],
        message: 'Each thing people sign up for can appear once',
      });
    }
    if (f.when?.kind === 'one_day' && f.when.from && f.when.to && f.when.from >= f.when.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['when', 'to'],
        message: 'The end time must be after the start time',
      });
    }
    if (f.howMany !== undefined && (items.length === 0 || f.howMany.length !== items.length)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['howMany'],
        message: 'Give one count for each thing people sign up for',
      });
    }
    if (
      f.placeholders &&
      (items.length > 0 || f.howMany !== undefined || (f.when && f.when.kind !== 'not_decided'))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['placeholders'],
        message: 'Draft with placeholders sends no answers',
      });
    }
  });

const SKIPPED = 'not given, use a TBD: placeholder';

const DRAFT_NOW = "Use these exact values. Draft the signup now. Don't ask questions.";

/** The retry's last line, when the model asked again after the answers. */
const DRAFT_NOW_FIRMLY =
  "Use these exact values. Reply with a draft or a refusal now: questions can't be answered here. Use a TBD: placeholder for anything missing.";

function describeWhen(when: WhenAnswer): string {
  switch (when.kind) {
    case 'not_decided':
      return SKIPPED;
    case 'several':
      return JSON.stringify(when.text);
    case 'one_day':
      if (when.from && when.to) return `${when.date}, ${when.from} to ${when.to}`;
      if (when.from) return `${when.date}, from ${when.from}`;
      if (when.to) return `${when.date}, until ${when.to}`;
      return when.date;
  }
}

/**
 * The second call's messages: the description, then the answers under fixed
 * labels, one line per topic that was asked. The organizer's own words are
 * JSON-quoted, so a comma or a quote in an item can't blur the list. `firmly`
 * is the one retry after the model asked again.
 */
export function buildFollowUpMessages(
  prompt: string,
  followUp: FollowUp,
  { firmly = false, now }: { firmly?: boolean; now?: Date } = {},
): ChatMessage[] {
  const items = followUpItems(followUp);
  const lines = [
    `- What people sign up for: ${items.length > 0 ? items.map((i) => JSON.stringify(i)).join(', ') : SKIPPED}`,
  ];
  if (followUp.when) lines.push(`- When: ${describeWhen(followUp.when)}`);
  if (followUp.howMany) {
    const counts = items.map(
      (item, i) => `${JSON.stringify(item)}: ${followUp.howMany?.[i] ?? 'no limit'}`,
    );
    lines.push(`- How many people for each: ${counts.join(', ')}`);
  }
  const content = [
    prompt,
    '',
    'Answers to your questions:',
    ...lines,
    '',
    firmly ? DRAFT_NOW_FIRMLY : DRAFT_NOW,
  ].join('\n');
  return buildMessages(content, now);
}
