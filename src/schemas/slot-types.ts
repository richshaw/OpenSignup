import { z } from 'zod';
import { DateOnlySchema } from './common';

const TimeHM = z.string().regex(/^\d{2}:\d{2}$/);

export const DateSlotDataSchema = z.object({
  date: DateOnlySchema,
  startTime: TimeHM.optional(),
  endTime: TimeHM.optional(),
  timezone: z.string().optional(),
});

export const TimeSlotDataSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  timezone: z.string().optional(),
});

export const ItemSlotDataSchema = z.object({
  unit: z.string().max(20).optional(),
});

export const RoleSlotDataSchema = z.object({
  skills: z.array(z.string().min(1).max(40)).max(10).optional(),
});

export const QuantitySlotDataSchema = z.object({
  unit: z.string().max(20).optional(),
  target: z.number().int().positive().optional(),
});

export const SLOT_TYPES = ['date', 'time', 'item', 'role', 'quantity'] as const;
export type SlotType = (typeof SLOT_TYPES)[number];

export const SlotTypeDataSchema = z.discriminatedUnion('slotType', [
  z.object({ slotType: z.literal('date'), data: DateSlotDataSchema }),
  z.object({ slotType: z.literal('time'), data: TimeSlotDataSchema }),
  z.object({ slotType: z.literal('item'), data: ItemSlotDataSchema }),
  z.object({ slotType: z.literal('role'), data: RoleSlotDataSchema }),
  z.object({ slotType: z.literal('quantity'), data: QuantitySlotDataSchema }),
]);

export type SlotTypeData = z.infer<typeof SlotTypeDataSchema>;

export function parseSlotData(slotType: SlotType, data: unknown): SlotTypeData {
  return SlotTypeDataSchema.parse({ slotType, data });
}
