import { z } from 'zod';
import { idOf, NameSchema, SlugSchema, TagsSchema } from './common';

export const SIGNUP_STATUSES = ['draft', 'open', 'closed', 'archived'] as const;
export type SignupStatus = (typeof SIGNUP_STATUSES)[number];

export const SIGNUP_VISIBILITIES = ['public', 'unlisted', 'password'] as const;
export type SignupVisibility = (typeof SIGNUP_VISIBILITIES)[number];

export const SignupSettingsSchema = z
  .object({
    requireEmail: z.boolean().default(true),
    allowNotes: z.boolean().default(true),
    showWhoSignedUp: z.boolean().default(true),
    maxCommitmentsPerParticipant: z.number().int().positive().optional(),
    lockoutHoursBeforeSlot: z.number().int().nonnegative().default(0),
    sendReminders: z.boolean().default(true),
    confirmationMessage: z.string().max(500).optional(),
  })
  .default({});

export const SignupCreateInputSchema = z.object({
  title: z.string().min(2).max(120).transform((s) => s.trim()),
  description: z.string().max(2000).default(''),
  organizerDisplayName: NameSchema.optional(),
  tags: TagsSchema,
  closesAt: z.string().datetime().optional(),
  visibility: z.enum(SIGNUP_VISIBILITIES).default('unlisted'),
  settings: SignupSettingsSchema,
});
export type SignupCreateInput = z.infer<typeof SignupCreateInputSchema>;

export const SignupUpdateInputSchema = SignupCreateInputSchema.partial().extend({
  title: z.string().min(2).max(120).optional(),
});
export type SignupUpdateInput = z.infer<typeof SignupUpdateInputSchema>;

export const SignupPublicSchema = z.object({
  id: idOf('sig'),
  slug: SlugSchema,
  title: z.string(),
  description: z.string(),
  organizerDisplayName: z.string().optional(),
  status: z.enum(SIGNUP_STATUSES),
  closesAt: z.string().datetime().nullable(),
  settings: SignupSettingsSchema,
  slots: z.array(z.unknown()), // filled in by the signup service
  updatedAt: z.string().datetime(),
});

export const SignupOrganizerSchema = SignupPublicSchema.extend({
  organizerId: idOf('org'),
  workspaceId: idOf('ws').nullable(),
  visibility: z.enum(SIGNUP_VISIBILITIES),
  tags: z.array(z.string()),
  createdAt: z.string().datetime(),
});
