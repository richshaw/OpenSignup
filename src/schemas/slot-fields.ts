import { z } from 'zod';

export const FIELD_TYPES = ['text', 'date', 'time', 'number', 'enum'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

const LABEL_MAX_LENGTH = 80;
const CHOICE_MAX_LENGTH = 60;
const MAX_CHOICES = 20;

const RefSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'ref must be lowercase kebab');

const LabelSchema = z.string().min(1).max(LABEL_MAX_LENGTH);

const TextConfigSchema = z.object({
  fieldType: z.literal('text'),
  maxLength: z.number().int().positive().max(2000).default(200),
});

/**
 * The earliest year a date field's values take (`isRealDate` in
 * src/services/slot-fields.ts). No signup is for a day before it, and earlier
 * years break things downstream: Postgres has no year 0 and refuses it as a
 * timestamptz, so a slot dated 0000 failed its save or a later `slot_at`
 * rebuild; the driver reads a stored year below 100 back a century late (0099
 * as 1999); and the calendar export writes a year below 1000 with fewer than
 * four digits, which RFC 5545 does not allow. Kept here, not beside the check,
 * so the builder's date input and the MCP field guide can name it too.
 */
export const MIN_DATE_YEAR = 1900;

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
  choices: z.array(z.string().min(1).max(CHOICE_MAX_LENGTH)).min(1).max(MAX_CHOICES),
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
    sortOrder: z.number().int().nonnegative().optional(),
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
    sortOrder: z.number().int().nonnegative().optional(),
    fieldType: z.enum(FIELD_TYPES).optional(),
    config: SlotFieldConfigSchema.optional(),
  })
  .strict();
export type SlotFieldUpdateInput = z.infer<typeof SlotFieldUpdateInputSchema>;

export type SlotFieldDefinition = {
  id: string;
  ref: string;
  label: string;
  fieldType: FieldType;
  sortOrder: number;
  config: SlotFieldConfig;
};
