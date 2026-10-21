import { z } from 'zod';
import { DraftFieldSchema } from '@/lib/magic-compose/prompt';
import { configFor } from '@/lib/magic-compose/to-template';
import { ok } from '@/lib/result';
import { SlotFieldReorderInputSchema, SlotFieldUpdateInputSchema } from '@/schemas/slot-fields';
import { addField, deleteField, reorderFields, updateField } from '@/services/slot-fields';
import { defineTool } from '../registry';
import { fieldOut } from './signups-read';
import { FIELD_GUIDE } from './guides';

/**
 * No sortOrder, for the reason add_slots has none: an assistant asked for "at
 * the top" sent 0, tied with the field already there and landed second. It
 * names the field to go in front of instead, and the service does the
 * numbers. Strict, so a sortOrder from an assistant that remembers the old
 * input is refused rather than dropped, which would put the field last and
 * report a success. The message is the refusal for any key it doesn't know,
 * so it names what the tool takes rather than guessing which key was wrong.
 */
const AddFieldSchema = DraftFieldSchema.extend({
  signupId: z.string(),
  beforeFieldId: z
    .string()
    .optional()
    .describe('Put the new field in front of this field. Leave out to add it at the end.'),
}).strict(
  'add_field takes signupId, ref, label, fieldType, choices and beforeFieldId. To place the field, pass beforeFieldId.',
);

export const addFieldTool = defineTool({
  name: 'add_field',
  scope: 'signups:write',
  title: 'Add field',
  description: `Add a column that every slot in the signup has, in the same shape create_signup takes: ref (lowercase-kebab key used in slot values), label, fieldType, and choices for an enum. ${FIELD_GUIDE} The field goes last, unless you pass beforeFieldId: then it goes in front of that field, and that field and every one after it move along one. Existing slots have no value for a new field until one is set with update_slot.`,
  annotations: { readOnlyHint: false, destructiveHint: false },
  inputSchema: AddFieldSchema,
  handler: async (ctx, input) => {
    const { signupId, ref, label, fieldType, choices, beforeFieldId } = input;
    const r = await addField(ctx.db, ctx.actor, signupId, {
      ref,
      label,
      fieldType,
      config: configFor(fieldType, choices),
      ...(beforeFieldId !== undefined ? { beforeFieldId } : {}),
    });
    return r.ok ? ok({ field: fieldOut(r.value) }) : r;
  },
});

/**
 * Like the REST update, without sortOrder, as update_slot has none: one
 * field's number set on its own can tie with another's. The Build tab sends a
 * whole renumbering; an assistant sent one number, so it gets reorder_fields.
 */
const UpdateFieldSchema = SlotFieldUpdateInputSchema.omit({ sortOrder: true })
  .extend({ fieldId: z.string() })
  .strict('update_field takes label, fieldType and config. To reorder, call reorder_fields.');

export const updateFieldTool = defineTool({
  name: 'update_field',
  scope: 'signups:write',
  title: 'Update field',
  description:
    'Rename a field, or change its type. To change the type, pass fieldType and a matching config: text { fieldType: "text", maxLength }, date { fieldType: "date" }, time { fieldType: "time" }, number { fieldType: "number" }, enum { fieldType: "enum", choices: [...] }. A type change is refused with conflict if any existing slot value would not fit; fix those values with update_slot first. To change the order fields are shown in, call reorder_fields.',
  annotations: { readOnlyHint: false, destructiveHint: true },
  inputSchema: UpdateFieldSchema,
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
  description: 'Remove a field and its value from every slot. This cannot be undone.',
  annotations: { readOnlyHint: false, destructiveHint: true },
  askFirst: true,
  inputSchema: z.object({ fieldId: z.string() }),
  handler: (ctx, input) => deleteField(ctx.db, ctx.actor, input.fieldId),
});

export const reorderFieldsTool = defineTool({
  name: 'reorder_fields',
  scope: 'signups:write',
  title: 'Reorder fields',
  description:
    "Put a signup's fields in a new order in one call. The order is the order of the columns on the signup page and of the lines describing a slot in participants' emails. Pass every field id of the signup exactly once, in the new order. Get the ids from get_signup, or from the result of create_signup or add_field. A list that leaves a field out or names one twice is refused and nothing changes.",
  annotations: { readOnlyHint: false, destructiveHint: true },
  inputSchema: SlotFieldReorderInputSchema.extend({ signupId: z.string() }),
  handler: async (ctx, input) => {
    const { signupId, ...rest } = input;
    const r = await reorderFields(ctx.db, ctx.actor, signupId, rest);
    return r.ok ? ok({ fields: r.value.map(fieldOut) }) : r;
  },
});
