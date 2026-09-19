import { z } from 'zod';
import { ok } from '@/lib/result';
import { SlotBulkInputSchema, SlotUpdateInputSchema } from '@/schemas/slots';
import { addSlotsBulk, deleteSlot, updateSlot } from '@/services/slots';
import { defineTool } from '../registry';
import { slotOut } from './signups-read';

/**
 * Like the REST bulk row, but an omitted capacity means 1, as it does in
 * create_signup, and there is no sortOrder: an assistant asked for "at the
 * top" sent 0, tied with the slot already there and landed second. It says
 * which slot the rows go in front of instead, and the service does the numbers.
 * Strict, so a sortOrder from an assistant that remembers the old input is
 * refused: dropping it would put the slot last and report a success.
 */
const SlotRowSchema = SlotBulkInputSchema.shape.rows.element
  .omit({ sortOrder: true })
  .extend({ capacity: z.number().int().positive().nullable().default(1) })
  .strict('A row takes values and capacity only. To place rows, pass beforeSlotId.');

export const addSlotsTool = defineTool({
  name: 'add_slots',
  scope: 'signups:write',
  title: 'Add slots',
  description:
    'Add one or more slots (up to 500) to a signup. They go at the end, unless you pass beforeSlotId: then they go in front of that slot, in the order given, and that slot and everything after it move down. To put a slot first, pass the id of the slot that is first now. Each row has values keyed by field ref (dates as ISO dates like 2026-10-03, times as HH:MM, numbers as numbers, enums as one of the choices) and a capacity: a number, null for unlimited, or omitted for 1. Call get_signup first to see the field refs and the slot ids.',
  annotations: {},
  inputSchema: z.object({
    signupId: z.string(),
    rows: z.array(SlotRowSchema).min(1).max(500),
    beforeSlotId: z
      .string()
      .optional()
      .describe('Put the new slots in front of this slot. Leave out to add them at the end.'),
  }),
  handler: async (ctx, input) => {
    const { signupId, ...rest } = input;
    const r = await addSlotsBulk(ctx.db, ctx.actor, signupId, rest);
    return r.ok ? ok({ slots: r.value.map(slotOut) }) : r;
  },
});

export const updateSlotTool = defineTool({
  name: 'update_slot',
  scope: 'signups:write',
  title: 'Update slot',
  description:
    "Change a slot's values, capacity (a number, or null for unlimited), order or status (open or closed). Pass only what changes. If you pass values, they replace all of the slot's values, so include every field.",
  annotations: {},
  inputSchema: SlotUpdateInputSchema.extend({ slotId: z.string() }),
  handler: async (ctx, input) => {
    const { slotId, ...rest } = input;
    const r = await updateSlot(ctx.db, ctx.actor, slotId, rest);
    return r.ok ? ok({ slot: slotOut(r.value) }) : r;
  },
});

export const deleteSlotTool = defineTool({
  name: 'delete_slot',
  scope: 'signups:write',
  title: 'Delete slot',
  description:
    'Remove a slot. If anyone has signed up for it the call fails with conflict and says how many; tell the organizer, and only if they agree call again with force: true, which removes the slot and their places.',
  annotations: { destructiveHint: true },
  inputSchema: z.object({
    slotId: z.string(),
    force: z.boolean().default(false).describe('Remove the slot even if people have signed up for it.'),
  }),
  handler: (ctx, input) => deleteSlot(ctx.db, ctx.actor, input.slotId, { force: input.force }),
});
