import { z } from 'zod';
import { toKebab } from '@/lib/kebab';
import { SortOrderSchema } from './common';

export const FIELD_TYPES = ['text', 'date', 'time', 'number', 'enum'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

const LABEL_MAX_LENGTH = 80;
const CHOICE_MAX_LENGTH = 60;
export const MAX_CHOICES = 20;
/** A text field's `maxLength` when the organizer hasn't set one. */
export const TEXT_DEFAULT_MAX_LENGTH = 200;

export const REF_MAX_LENGTH = 40;

export const RefSchema = z
  .string()
  .min(1)
  .max(REF_MAX_LENGTH)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'ref must be lowercase kebab');

function cutRef(base: string, maxLength: number): string {
  return base.slice(0, maxLength).replace(/-+$/, '');
}

/**
 * A new field's ref, made from its name: kebab-case, cut to fit `RefSchema`,
 * and numbered (`-2`, `-3`…) when `existingRefs` already has it.
 */
export function toFieldRef(name: string, existingRefs: readonly string[]): string {
  const base = cutRef(toKebab(name), REF_MAX_LENGTH) || 'field';
  if (!existingRefs.includes(base)) return base;
  for (let i = 2; ; i++) {
    const suffix = `-${i}`;
    const ref = `${cutRef(base, REF_MAX_LENGTH - suffix.length)}${suffix}`;
    if (!existingRefs.includes(ref)) return ref;
  }
}

export const LabelSchema = z.string().min(1).max(LABEL_MAX_LENGTH);

/** One choice of an enum field. */
export const ChoiceSchema = z.string().min(1).max(CHOICE_MAX_LENGTH);

const TextConfigSchema = z.object({
  fieldType: z.literal('text'),
  maxLength: z.number().int().positive().max(2000).default(TEXT_DEFAULT_MAX_LENGTH),
});

const DateConfigSchema = z.object({
  fieldType: z.literal('date'),
});

const TimeConfigSchema = z.object({
  fieldType: z.literal('time'),
});

const NumberConfigSchema = z.object({
  fieldType: z.literal('number'),
  unit: z.string().max(20).optional(),
  target: z.number().optional(),
});

const EnumConfigSchema = z.object({
  fieldType: z.literal('enum'),
  choices: z.array(ChoiceSchema).min(1).max(MAX_CHOICES),
});

export const SlotFieldConfigSchema = z.discriminatedUnion('fieldType', [
  TextConfigSchema,
  DateConfigSchema,
  TimeConfigSchema,
  NumberConfigSchema,
  EnumConfigSchema,
]);
export type SlotFieldConfig = z.infer<typeof SlotFieldConfigSchema>;

export const SlotFieldInputSchema = z
  .object({
    ref: RefSchema,
    label: LabelSchema,
    fieldType: z.enum(FIELD_TYPES),
    /** Position among the signup's fields. Omit to append. */
    sortOrder: SortOrderSchema.optional(),
    // Put the field in front of this one instead, and move it and every later
    // field down one. Not allowed together with `sortOrder`; `addField` checks
    // that, as `addSlotsBulk` does for `beforeSlotId`.
    beforeFieldId: z.string().optional(),
    config: SlotFieldConfigSchema,
  })
  .refine((d) => d.fieldType === d.config.fieldType, {
    message: 'fieldType must match config.fieldType',
    path: ['config', 'fieldType'],
  });
export type SlotFieldInput = z.infer<typeof SlotFieldInputSchema>;

export const SlotFieldUpdateInputSchema = z
  .object({
    label: LabelSchema.optional(),
    sortOrder: SortOrderSchema.optional(),
    fieldType: z.enum(FIELD_TYPES).optional(),
    config: SlotFieldConfigSchema.optional(),
  })
  .strict();
export type SlotFieldUpdateInput = z.infer<typeof SlotFieldUpdateInputSchema>;

// Every field id of the signup, in the order they should be shown. Bounded by
// the signup's field count, which nothing caps, so no maximum here either, as
// with `SlotReorderInputSchema`.
export const SlotFieldReorderInputSchema = z.object({
  fieldIds: z.array(z.string()).min(1),
});

export type SlotFieldDefinition = {
  id: string;
  ref: string;
  label: string;
  fieldType: FieldType;
  sortOrder: number;
  config: SlotFieldConfig;
};
