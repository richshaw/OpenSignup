import { z } from 'zod';
import type { ZodIssueReasons } from '@/lib/errors';
import { NOTES_MAX_LENGTH, QUANTITY_MAX } from '@/lib/participant-limits';
import { idOf, NameSchema } from './common';

// Participants keep their user-entered casing in `participants.email` for
// display; the service derives `emailLower` for dedup. So this schema
// validates and trims but does NOT lowercase. Missing, null, empty or only
// spaces all mean the participant gave no email, and parse to undefined;
// whether the signup lets them leave it out is the service's check.
const ParticipantEmailSchema = z
  .string()
  .max(254)
  .nullish()
  .transform((v) => v?.trim() || undefined)
  .pipe(z.string().email().optional());

export const CommitmentCreateInputSchema = z.object({
  name: NameSchema,
  email: ParticipantEmailSchema,
  phone: z.string().min(4).max(40).optional(),
  notes: z.string().max(NOTES_MAX_LENGTH).optional(),
  quantity: z.number().int().positive().max(QUANTITY_MAX).default(1),
  /**
   * Random, made by the client for one sign-up and sent again with any retry
   * of it. A sign-up sent with the key and details of one already made on the
   * slot gets that one back, edit link and all, so the key has to be
   * unguessable: at least 16 characters.
   */
  idempotencyKey: z
    .string()
    .regex(/^[A-Za-z0-9_-]{16,128}$/, 'must be 16 to 128 letters, digits, - or _')
    .optional(),
});
export type CommitmentCreateInput = z.infer<typeof CommitmentCreateInputSchema>;

export const CommitmentUpdateInputSchema = z.object({
  name: NameSchema.optional(),
  notes: z.string().max(NOTES_MAX_LENGTH).optional(),
  quantity: z.number().int().positive().max(QUANTITY_MAX).optional(),
  swapToSlotId: idOf('slot').optional(),
});
export type CommitmentUpdateInput = z.infer<typeof CommitmentUpdateInputSchema>;

/**
 * The `details.reason` a refused sign-up or edit carries for each check a
 * person can fail by what they type, by field and Zod issue code, so the
 * participant pages can word it in the signup's language rather than show
 * Zod's English. Both schemas above share these fields. A wrong JSON type on a
 * text field (a number for `name`) gets no reason, since the forms always send
 * text; on `quantity` it does, because Zod reports a fraction that way too.
 * Anything not listed (`phone`, `idempotencyKey`, `swapToSlotId`, which the
 * forms don't type) gets none either, and the pages word it from the code.
 */
export const COMMITMENT_INPUT_REASONS = {
  name: { too_small: 'name_required', too_big: 'name_too_long' },
  email: { invalid_string: 'email_invalid', too_big: 'email_invalid' },
  notes: { too_big: 'notes_too_long' },
  quantity: {
    too_small: 'quantity_too_small',
    too_big: 'quantity_too_large',
    invalid_type: 'quantity_not_whole',
  },
} as const satisfies ZodIssueReasons;
