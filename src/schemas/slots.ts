import { z } from 'zod';
import { DateOnlySchema, idOf } from './common';
import {
  DateSlotDataSchema,
  ItemSlotDataSchema,
  QuantitySlotDataSchema,
  RoleSlotDataSchema,
  SLOT_TYPES,
  TimeSlotDataSchema,
} from './slot-types';

export const SLOT_STATUSES = ['open', 'closed'] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];

const baseSlotInput = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(1000).default(''),
  capacity: z.number().int().positive().nullable().default(1),
  sortOrder: z.number().int().nonnegative().optional(),
  location: z.string().max(200).optional(),
  groupId: idOf('sgr').optional(),
});

export const SlotCreateInputSchema = z.discriminatedUnion('slotType', [
  baseSlotInput.extend({ slotType: z.literal('date'), data: DateSlotDataSchema }),
  baseSlotInput.extend({ slotType: z.literal('time'), data: TimeSlotDataSchema }),
  baseSlotInput.extend({ slotType: z.literal('item'), data: ItemSlotDataSchema }),
  baseSlotInput.extend({ slotType: z.literal('role'), data: RoleSlotDataSchema }),
  baseSlotInput.extend({ slotType: z.literal('quantity'), data: QuantitySlotDataSchema }),
]);
export type SlotCreateInput = z.infer<typeof SlotCreateInputSchema>;

/** v1 bulk uses date slots from a simple list of dates. */
export const SlotBulkDateInputSchema = z.object({
  dates: z.array(DateOnlySchema).min(1).max(120),
  titleTemplate: z.string().max(120).optional(), // '{date}' replaced at insert time
  capacity: z.number().int().positive().nullable().default(1),
});
export type SlotBulkDateInput = z.infer<typeof SlotBulkDateInputSchema>;

export const SlotUpdateInputSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).optional(),
  capacity: z.number().int().positive().nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  location: z.string().max(200).nullable().optional(),
  status: z.enum(SLOT_STATUSES).optional(),
});
export type SlotUpdateInput = z.infer<typeof SlotUpdateInputSchema>;

export const SlotPublicSchema = z.object({
  id: idOf('slot'),
  ref: z.string(),
  title: z.string(),
  description: z.string(),
  slotType: z.enum(SLOT_TYPES),
  data: z.record(z.string(), z.unknown()),
  capacity: z.number().int().nullable(),
  committedCount: z.number().int(),
  status: z.enum(SLOT_STATUSES),
  location: z.string().nullable(),
  sortOrder: z.number().int(),
  /** For date/time slots, canonical UTC timestamp. */
  slotAt: z.string().datetime().nullable(),
  /** Up to N first-name tokens of committers if showWhoSignedUp is on. */
  committers: z.array(z.string()).optional(),
});
export type SlotPublic = z.infer<typeof SlotPublicSchema>;
