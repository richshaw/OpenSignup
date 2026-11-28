import { z } from 'zod';
import type { ZodIssueReasons } from '@/lib/errors';
import {
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  TITLE_MIN_LENGTH,
  TITLE_TOO_SHORT_MESSAGE,
} from '@/lib/signup-limits';
import { boundedArray, NameSchema, TagsSchema } from './common';

export { DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH, TITLE_MIN_LENGTH };

export const SIGNUP_STATUSES = ['draft', 'open', 'closed', 'archived'] as const;
export type SignupStatus = (typeof SIGNUP_STATUSES)[number];

const VISIBILITY_UNCHANGEABLE =
  "visibility can't be changed: anyone with a signup's link can open it";

/** The most signups a workspace list returns, newest first. */
export const WORKSPACE_LIST_LIMIT = 200;

export const SignupSettingsSchema = z
  .object({
    requireEmail: z.boolean().default(true),
    allowNotes: z.boolean().default(true),
    showWhoSignedUp: z.boolean().default(true),
    maxCommitmentsPerParticipant: z.number().int().positive().optional(),
    lockoutHoursBeforeSlot: z.number().int().nonnegative().default(0),
    /** The only reminder off switch. Timing is fixed: see `@/lib/reminder-lead`. */
    sendReminders: z.boolean().default(true),
    confirmationMessage: z.string().max(500).optional(),
    /** Slot-field refs to group by in the participant view. v1 caps at length 1; nested grouping deferred. */
    groupByFieldRefs: boundedArray(z.string(), { max: 1 }).default([]),
    /**
     * The date field that gives every slot its instant (`slots.slot_at`): what
     * "Add to calendar" exports, what slots order by, and when a reminder is
     * due. The services keep it naming an existing date field — set on
     * creation, moved when that field is deleted or retyped — and
     * `updateSignup` rejects a value naming anything else. Absent only while
     * the signup has no date field at all.
     */
    reminderFromFieldRef: z.string().optional(),
    /**
     * The language the signup is written in. Absent until someone chooses
     * one: read it with `localeOfSignup` from `@/i18n/locale`. Lenient, so a
     * stored value can't break `requiresEmail`, `sendsReminders` or the next
     * save: a language that has since left the list still parses, and
     * anything that isn't a short string reads as none. So this never refuses
     * a value; `createSignup` and `updateSignup` refuse one the caller sends
     * unless it has shipped to participants.
     */
    locale: z.string().max(35).optional().catch(undefined),
  })
  .default({});

export type SignupSettings = z.infer<typeof SignupSettingsSchema>;

/**
 * What `signups.settings` holds. Any key can be missing: the column defaults
 * to `{}`, rows predate keys added since, and a sparse update clears a key by
 * deleting it. `SignupSettingsSchema` fills the defaults in when a reader
 * needs them.
 */
export type StoredSignupSettings = Partial<SignupSettings>;

/**
 * Whether a signup asks each new participant for an email: its `requireEmail`
 * setting, true when the key is missing, as the default says. Settings that
 * fail to parse also mean true, so a bad row never stops the address being
 * asked for.
 */
export function requiresEmail(settings: unknown): boolean {
  const parsed = SignupSettingsSchema.safeParse(settings ?? {});
  return parsed.success ? parsed.data.requireEmail : true;
}

/**
 * Whether a signup sends reminder emails: its `sendReminders` setting, true
 * when the key is missing, as the default and the reminder dispatcher say.
 */
export function sendsReminders(settings: unknown): boolean {
  const parsed = SignupSettingsSchema.safeParse(settings ?? {});
  return parsed.success ? parsed.data.sendReminders : true;
}

/**
 * Trimmed before the min check, like NameSchema, so a title of only spaces is
 * refused rather than saved blank. max is on the raw string, as Magic
 * Compose's fitDraftText measures it. Zod runs the checks in this order.
 * Shared with Magic Compose's draft schema.
 */
export const TitleSchema = z
  .string()
  .max(TITLE_MAX_LENGTH)
  .trim()
  .min(TITLE_MIN_LENGTH, TITLE_TOO_SHORT_MESSAGE);

/**
 * The `details.reason` a refused create or update carries for each check the
 * organizer screens word themselves, by field and Zod issue code (see
 * `ErrorReason`). Only a title that's too short: the New signup form and the
 * Build tab keep everything else these schemas check within bounds, so any
 * other refusal comes from a request they didn't send, and is worded by its
 * code.
 */
export const SIGNUP_INPUT_REASONS = {
  title: { too_small: 'title_too_short' },
} as const satisfies ZodIssueReasons;

export const SignupCreateInputSchema = z.object({
  title: TitleSchema,
  /**
   * Trimmed, so a description of only spaces is saved as none, however it
   * arrives: the Build tab trims before it sends, but the API and the MCP
   * tools didn't. max is on the raw string, as for the title.
   */
  description: z.string().max(DESCRIPTION_MAX_LENGTH).trim().default(''),
  organizerDisplayName: NameSchema.optional(),
  tags: TagsSchema,
  closesAt: z.string().datetime().optional(),
  // Nothing reads visibility: every signup opens for anyone with its link, and
  // none is listed or indexed. 'unlisted', the only value a signup has, is still
  // accepted so existing callers that send it keep working; any other value is
  // refused rather than stored, so a caller is not told it took effect.
  visibility: z
    .literal('unlisted', { errorMap: () => ({ message: VISIBILITY_UNCHANGEABLE }) })
    .optional(),
  settings: SignupSettingsSchema,
});

export const SignupUpdateInputSchema = SignupCreateInputSchema.partial().extend({
  /** `null` clears the closing time; omitted leaves it alone. */
  closesAt: z.string().datetime().nullable().optional(),
  // Refused outright on update, 'unlisted' included: there is nothing to change.
  visibility: z.undefined({ errorMap: () => ({ message: VISIBILITY_UNCHANGEABLE }) }).optional(),
});
