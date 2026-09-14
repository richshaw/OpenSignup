import { z } from 'zod';
import { ok } from '@/lib/result';
import { SlotBulkInputSchema, SlotUpdateInputSchema } from '@/schemas/slots';
import { addSlotsBulk, deleteSlot, updateSlot } from '@/services/slots';
import { defineTool } from '../registry';

function slotOut(s: { id: string; values: unknown; capacity: number | null; status: string; sortOrder: number }) {
  return {
    id: s.id,
    values: s.values as Record<string, unknown>,
    capacity: s.capacity,
    status: s.status,
    sortOrder: s.sortOrder,
  };
}

export const addSlotsTool = defineTool({
  name: 'add_slots',
  scope: 'signups:write',
  title: 'Add slots',
  description:
    'Add one or more slots (up to 500) to a signup. Each row has values keyed by field ref (dates as ISO dates, times as HH:MM, enums as one of the choices) and a capacity (null means unlimited). Call get_signup first to see the field refs.',
  annotations: {},
  inputSchema: SlotBulkInputSchema.extend({ signupId: z.string() }),
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
    'Change a slot values, capacity, order or status (open or closed). Pass only what changes. If you pass values, they replace all of the slot values, so include every field.',
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
  description: 'Remove a slot. Anyone who had signed up for it loses their place. Ask the organizer first.',
  annotations: { destructiveHint: true },
  inputSchema: z.object({ slotId: z.string() }),
  handler: async (ctx, input) => {
    const r = await deleteSlot(ctx.db, ctx.actor, input.slotId);
    return r.ok ? ok(r.value) : r;
  },
});
