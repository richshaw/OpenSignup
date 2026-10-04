import { z } from 'zod';
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
  notes: z.string().max(500).optional(),
  quantity: z.number().int().positive().max(999).default(1),
});
export type CommitmentCreateInput = z.infer<typeof CommitmentCreateInputSchema>;

export const CommitmentUpdateInputSchema = z.object({
  name: NameSchema.optional(),
  notes: z.string().max(500).optional(),
  quantity: z.number().int().positive().max(999).optional(),
  swapToSlotId: idOf('slot').optional(),
});
export type CommitmentUpdateInput = z.infer<typeof CommitmentUpdateInputSchema>;
