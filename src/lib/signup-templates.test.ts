import { describe, expect, it } from 'vitest';
import { SlotFieldInputSchema } from '@/schemas/slot-fields';
import { DEFAULT_TEMPLATE, EMPTY_TEMPLATE } from './signup-templates';

describe('signup templates', () => {
  describe('DEFAULT_TEMPLATE', () => {
    it('has a single date field with capacity-1 slot', () => {
      expect(DEFAULT_TEMPLATE.fields).toHaveLength(1);
      expect(DEFAULT_TEMPLATE.slots).toHaveLength(1);

      const field = DEFAULT_TEMPLATE.fields[0]!;
      expect(field.ref).toBe('date');
      expect(field.fieldType).toBe('date');

      const slot = DEFAULT_TEMPLATE.slots[0]!;
      expect(slot.capacity).toBe(1);
      expect(slot.values).toEqual({});
    });

    it('every field round-trips through SlotFieldInputSchema', () => {
      for (const field of DEFAULT_TEMPLATE.fields) {
        const parsed = SlotFieldInputSchema.safeParse(field);
        expect(parsed.success).toBe(true);
      }
    });
  });

  describe('EMPTY_TEMPLATE', () => {
    it('contains no fields and no slots', () => {
      expect(EMPTY_TEMPLATE.fields).toHaveLength(0);
      expect(EMPTY_TEMPLATE.slots).toHaveLength(0);
    });
  });
});
