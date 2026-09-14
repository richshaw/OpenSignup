import { z } from 'zod';
import { DraftFieldSchema } from '@/lib/magic-compose/prompt';
import { configFor } from '@/lib/magic-compose/to-template';
import { ok } from '@/lib/result';
import { SlotFieldUpdateInputSchema } from '@/schemas/slot-fields';
import { addField, deleteField, updateField } from '@/services/slot-fields';
import { defineTool } from '../registry';
import { fieldOut } from './signups-read';
import { FIELD_GUIDE } from './guides';

export const addFieldTool = defineTool({
  name: 'add_field',
  scope: 'signups:write',
  title: 'Add field',
  description: `Add a column that every slot in the signup has, in the same shape create_signup takes: ref (lowercase-kebab key used in slot values), label, fieldType, and choices for an enum. ${FIELD_GUIDE} Add fields before slots when you can: existing slots have no value for a new field until you set one with update_slot.`,
  annotations: {},
  inputSchema: DraftFieldSchema.extend({
    signupId: z.string(),
    sortOrder: z.number().int().nonnegative().optional().describe('Position among the fields; omit to append.'),
  }),
  handler: async (ctx, input) => {
    const { signupId, ref, label, fieldType, choices, sortOrder } = input;
    const r = await addField(ctx.db, ctx.actor, signupId, {
      ref,
      label,
      fieldType,
      config: configFor(fieldType, choices),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
    });
    return r.ok ? ok({ field: fieldOut(r.value) }) : r;
  },
});

export const updateFieldTool = defineTool({
  name: 'update_field',
  scope: 'signups:write',
  title: 'Update field',
  description:
    'Rename or reorder a field, or change its type. To change the type, pass fieldType and a matching config: text { fieldType: "text", maxLength }, date { fieldType: "date" }, time { fieldType: "time" }, number { fieldType: "number" }, enum { fieldType: "enum", choices: [...] }. A type change is refused with conflict if any existing slot value would not fit; fix those values with update_slot first.',
  annotations: {},
  inputSchema: SlotFieldUpdateInputSchema.extend({ fieldId: z.string() }),
  handler: async (ctx, input) => {
    const { fieldId, ...rest } = input;
    const r = await updateField(ctx.db, ctx.actor, fieldId, rest);
    return r.ok ? ok({ field: fieldOut(r.value) }) : r;
  },
});

export const deleteFieldTool = defineTool({
  name: 'delete_field',
  scope: 'signups:write',
  title: 'Delete field',
  description: 'Remove a field and its value from every slot. Ask the organizer first.',
  annotations: { destructiveHint: true },
  inputSchema: z.object({ fieldId: z.string() }),
  handler: (ctx, input) => deleteField(ctx.db, ctx.actor, input.fieldId),
});
