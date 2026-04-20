import { z } from 'zod';
import { EmailSchema, idOf, NameSchema } from './common';

export const COMMITMENT_STATUSES = [
  'confirmed',
  'tentative',
  'waitlist',
  'cancelled',
  'no_show',
  'orphaned',
] as const;

export const CommitmentCreateInputSchema = z.object({
  name: NameSchema,
  email: EmailSchema,
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

export const CommitmentPublicSchema = z.object({
  id: idOf('com'),
  slotId: idOf('slot'),
  signupId: idOf('sig'),
  participantName: z.string(),
  status: z.enum(COMMITMENT_STATUSES),
  quantity: z.number().int().positive(),
  notes: z.string().optional(),
  createdAt: z.string().datetime(),
});

export const CommitmentOwnSchema = CommitmentPublicSchema.extend({
  participantEmail: z.string(),
  /** Present only in the immediate response from POST /commitments. */
  editToken: z.string().optional(),
  editUrl: z.string().optional(),
});
