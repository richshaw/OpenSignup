import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SlotFieldUpdateInputSchema } from '@/schemas/slot-fields';
import { SlotBulkInputSchema } from '@/schemas/slots';
import { toJsonSchema } from './registry';

describe('toJsonSchema', () => {
  it('emits an object-rooted schema with no $schema and no $ref', () => {
    const json = toJsonSchema(
      z.object({ signupId: z.string(), status: z.enum(['open', 'closed']).optional() }),
    ) as Record<string, unknown>;
    expect(json.type).toBe('object');
    expect(json).not.toHaveProperty('$schema');
    expect(JSON.stringify(json)).not.toContain('$ref');
    expect(json.required as string[]).toEqual(['signupId']);
  });

  it('inlines reused sub-schemas instead of referencing them', () => {
    const json = toJsonSchema(SlotBulkInputSchema.extend({ signupId: z.string() }));
    expect(JSON.stringify(json)).not.toContain('$ref');
  });

  it('keeps strict objects closed when extended with an id', () => {
    const json = toJsonSchema(SlotFieldUpdateInputSchema.extend({ fieldId: z.string() })) as Record<string, unknown>;
    expect(json.additionalProperties).toBe(false);
    expect(Object.keys(json.properties as object)).toContain('fieldId');
  });
});
