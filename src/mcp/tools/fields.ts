import { z } from 'zod';
import { ok } from '@/lib/result';
import { SlotFieldInputSchema, SlotFieldUpdateInputSchema, type SlotFieldDefinition } from '@/schemas/slot-fields';
import { addField, deleteField, updateField } from '@/services/slot-fields';
import { defineTool } from '../registry';

const CONFIG_GUIDE =
  'config.fieldType must equal fieldType. text: { fieldType: "text", maxLength }. date: { fieldType: "date" }. time: { fieldType: "time" }. number: { fieldType: "number", unit?, target? }. enum: { fieldType: "enum", choices: [...] }. ref is a lowercase-kebab key used in slot values.';

function fieldOut(f: SlotFieldDefinition) {
  return { id: f.id, ref: f.ref, label: f.label, fieldType: f.fieldType, sortOrder: f.sortOrder, config: f.config };
}

export const addFieldTool = defineTool({
  name: 'add_field',
  scope: 'signups:write',
  title: 'Add field',
  description: `Add a column that every slot in the signup has. ${CONFIG_GUIDE} Existing slots get no value for the new field until you update them.`,
  annotations: {},
  // The refine that ties config to fieldType lives on the outer ZodEffects;
  // the service re-parses with it, so a mismatch still comes back as
  // invalid_input.
  inputSchema: SlotFieldInputSchema.innerType().extend({ signupId: z.string() }),
  handler: async (ctx, input) => {
    const { signupId, ...rest } = input;
    const r = await addField(ctx.db, ctx.actor, signupId, rest);
    return r.ok ? ok({ field: fieldOut(r.value) }) : r;
  },
});

export const updateFieldTool = defineTool({
  name: 'update_field',
  scope: 'signups:write',
  title: 'Update field',
  description: `Rename, reorder or retype a field. ${CONFIG_GUIDE} Retyping a field revalidates every slot value for it.`,
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
  handler: async (ctx, input) => {
    const r = await deleteField(ctx.db, ctx.actor, input.fieldId);
    return r.ok ? ok(r.value) : r;
  },
});
