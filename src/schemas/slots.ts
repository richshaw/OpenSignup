import { z } from 'zod';

const SLOT_STATUSES = ['open', 'closed'] as const;
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
  // Put the rows in front of this slot instead of at the end. Not allowed
  // together with a row `sortOrder`; `addSlotsBulk` checks that, because a
  // refinement here would hide `.shape` from the MCP tool that builds on it.
  beforeSlotId: z.string().optional(),
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
