import { z } from 'zod';

export const FIELD_TYPES = ['text', 'date', 'time', 'number', 'enum'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

const RefSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'ref must be lowercase kebab');

const LabelSchema = z.string().min(1).max(80);

const TextConfigSchema = z.object({
  fieldType: z.literal('text'),
  maxLength: z.number().int().positive().max(2000).default(200),
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
  choices: z.array(z.string().min(1).max(60)).min(1).max(20),
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
    required: z.boolean().default(true),
    sortOrder: z.number().int().nonnegative().default(0),
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
    required: z.boolean().optional(),
    sortOrder: z.number().int().nonnegative().optional(),
    fieldType: z.enum(FIELD_TYPES).optional(),
    config: SlotFieldConfigSchema.optional(),
  })
  .strict();
export type SlotFieldUpdateInput = z.infer<typeof SlotFieldUpdateInputSchema>;

export const SlotFieldPublicSchema = z.object({
  ref: RefSchema,
  label: z.string(),
  fieldType: z.enum(FIELD_TYPES),
  value: z.unknown().nullable(),
  config: SlotFieldConfigSchema,
});
export type SlotFieldPublic = z.infer<typeof SlotFieldPublicSchema>;

export const SlotFieldDefinitionSchema = z.object({
  id: z.string(),
  ref: RefSchema,
  label: z.string(),
  fieldType: z.enum(FIELD_TYPES),
  required: z.boolean(),
  sortOrder: z.number().int(),
  config: SlotFieldConfigSchema,
});
export type SlotFieldDefinition = z.infer<typeof SlotFieldDefinitionSchema>;
