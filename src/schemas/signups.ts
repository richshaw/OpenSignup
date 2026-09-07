import { z } from 'zod';
import { idOf, NameSchema, SlugSchema, TagsSchema } from './common';

export const SIGNUP_STATUSES = ['draft', 'open', 'closed', 'archived'] as const;
export type SignupStatus = (typeof SIGNUP_STATUSES)[number];

export const SIGNUP_VISIBILITIES = ['public', 'unlisted', 'password'] as const;
export type SignupVisibility = (typeof SIGNUP_VISIBILITIES)[number];

/**
 * Hours before a slot that its reminder goes out: the day before.
 *
 * Fixed rather than configurable. `extractSlotAt` pins the organizer's wall
 * clock to UTC because a signup carries no timezone, so every reminder instant
 * is off by the organizer's UTC offset. At a day's lead that is a rounding
 * error nobody notices; at two hours it exceeds the lead itself. A date-only
 * slot anchors at noon UTC for the same reason: a day before noon UTC is still
 * the day before from UTC-11 to UTC+11, where a day before midnight UTC was
 * two days early for everyone west of Greenwich. A day also matches what
 * organizers coming from SignUp.com expect (issue #165). Shorter leads can
 * return once a signup carries a real timezone.
 */
export const REMINDER_LEAD_HOURS = 24;

export const SignupSettingsSchema = z
  .object({
    requireEmail: z.boolean().default(true),
    allowNotes: z.boolean().default(true),
    showWhoSignedUp: z.boolean().default(true),
    maxCommitmentsPerParticipant: z.number().int().positive().optional(),
    lockoutHoursBeforeSlot: z.number().int().nonnegative().default(0),
    /** The only reminder off switch. Timing is fixed: see REMINDER_LEAD_HOURS. */
    sendReminders: z.boolean().default(true),
    confirmationMessage: z.string().max(500).optional(),
    /** Slot-field refs to group by in the participant view. v1 caps at length 1; nested grouping deferred. */
    groupByFieldRefs: z.array(z.string()).max(1).default([]),
    /**
     * The date field that gives every slot its instant (`slots.slot_at`): what
     * "Add to calendar" exports, what slots order by, and when a reminder is
     * due. The services keep it naming an existing date field — set on
     * creation, moved when that field is deleted or retyped — and
     * `updateSignup` rejects a value naming anything else. Absent only while
     * the signup has no date field at all.
     */
    reminderFromFieldRef: z.string().optional(),
  })
  .default({});

export type SignupSettings = z.infer<typeof SignupSettingsSchema>;

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
