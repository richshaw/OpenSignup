import { z } from 'zod';
import { MAX_JSON_BODY_BYTES } from '@/lib/request-body';
import { boundedArray, SortOrderSchema } from './common';

const SLOT_STATUSES = ['open', 'closed'] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];

const SlotValuesSchema = z.record(z.string(), z.unknown());

/** How many people a slot takes: a whole number from 1, or null for no limit. */
export const SlotCapacitySchema = z.number().int().positive().nullable();

export const SlotCreateInputSchema = z.object({
  values: SlotValuesSchema.default({}),
  capacity: SlotCapacitySchema.default(1),
  sortOrder: SortOrderSchema.optional(),
});

export type SlotCreateInput = z.infer<typeof SlotCreateInputSchema>;

/** The most slots one bulk add takes, over REST and through the MCP tool. */
export const MAX_BULK_SLOT_ROWS = 500;

/** One row of a bulk add. */
export const SlotBulkRowSchema = z.object({
  values: SlotValuesSchema.default({}),
  capacity: SlotCapacitySchema.optional(),
  sortOrder: SortOrderSchema.optional(),
});

export const SlotBulkInputSchema = z.object({
  rows: boundedArray(SlotBulkRowSchema, { min: 1, max: MAX_BULK_SLOT_ROWS }),
  // Put the rows in front of this slot instead of at the end. Not allowed
  // together with a row `sortOrder`; `addSlotsBulk` checks that, because a
  // refinement here would hide `.shape` from the MCP tool that builds on it.
  beforeSlotId: z.string().optional(),
});

/**
 * The most ids a reorder takes: as many of the shortest id (`fld_` and 22
 * characters, 29 bytes with its quotes and comma) as fit in the 1 MB body cap
 * (`MAX_JSON_BODY_BYTES`, on REST and MCP). Nothing caps slots or fields per
 * signup, so this is no new ceiling: a body naming more real ids is already
 * refused for its size. It only bounds the issues a body of wrong items makes.
 */
export const MAX_REORDER_IDS = Math.floor(MAX_JSON_BODY_BYTES / 29);

// Every slot id of the signup, in the order they should be shown.
export const SlotReorderInputSchema = z.object({
  slotIds: boundedArray(z.string(), { min: 1, max: MAX_REORDER_IDS }),
});

export const SlotUpdateInputSchema = z
  .object({
    values: SlotValuesSchema.optional(),
    capacity: SlotCapacitySchema.optional(),
    sortOrder: SortOrderSchema.optional(),
    status: z.enum(SLOT_STATUSES).optional(),
  })
  .strict();
export type SlotUpdateInput = z.infer<typeof SlotUpdateInputSchema>;
