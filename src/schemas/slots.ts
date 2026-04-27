import { z } from 'zod';
import { idOf } from './common';
import { SlotFieldPublicSchema } from './slot-fields';

export const SLOT_STATUSES = ['open', 'closed'] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];

const SlotValuesSchema = z.record(z.string(), z.unknown());

const baseSlotInput = z.object({
  values: SlotValuesSchema.default({}),
  capacity: z.number().int().positive().nullable().default(1),
  sortOrder: z.number().int().nonnegative().optional(),
});

export const SlotCreateInputSchema = baseSlotInput;
export type SlotCreateInput = z.infer<typeof SlotCreateInputSchema>;

export const SlotBulkInputSchema = z.object({
  rows: z
    .array(
      z.object({
        values: SlotValuesSchema.default({}),
        capacity: z.number().int().positive().nullable().optional(),
        sortOrder: z.number().int().nonnegative().optional(),
      }),
    )
    .min(1)
    .max(500),
});
export type SlotBulkInput = z.infer<typeof SlotBulkInputSchema>;

export const SlotUpdateInputSchema = z
  .object({
    values: SlotValuesSchema.optional(),
    capacity: z.number().int().positive().nullable().optional(),
    sortOrder: z.number().int().nonnegative().optional(),
    status: z.enum(SLOT_STATUSES).optional(),
  })
  .strict();
export type SlotUpdateInput = z.infer<typeof SlotUpdateInputSchema>;

export const SlotPublicSchema = z.object({
  id: idOf('slot'),
  ref: z.string(),
  fields: z.array(SlotFieldPublicSchema),
  capacity: z.number().int().nullable(),
  committedCount: z.number().int(),
  status: z.enum(SLOT_STATUSES),
  sortOrder: z.number().int(),
  /** Canonical UTC timestamp derived from the signup's reminder field, if any. */
  slotAt: z.string().datetime().nullable(),
  /** Identified committers when showWhoSignedUp is on. */
  committers: z
    .array(z.object({ id: idOf('par'), name: z.string() }))
    .optional(),
});
export type SlotPublic = z.infer<typeof SlotPublicSchema>;
