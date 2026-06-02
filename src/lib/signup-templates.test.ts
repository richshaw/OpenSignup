import { describe, expect, it } from 'vitest';
import { SlotFieldInputSchema } from '@/schemas/slot-fields';
import { DEFAULT_TEMPLATE, EMPTY_TEMPLATE } from './signup-templates';

describe('signup templates', () => {
  describe('DEFAULT_TEMPLATE', () => {
    it('seeds a text "What" field followed by a date "Date" field on a capacity-1 slot', () => {
      expect(DEFAULT_TEMPLATE.fields).toHaveLength(2);
      expect(DEFAULT_TEMPLATE.slots).toHaveLength(1);

      const [what, date] = DEFAULT_TEMPLATE.fields;
      expect(what!.ref).toBe('what');
      expect(what!.label).toBe('What');
      expect(what!.fieldType).toBe('text');
      expect(what!.sortOrder).toBe(0);

      expect(date!.ref).toBe('date');
      expect(date!.label).toBe('Date');
      expect(date!.fieldType).toBe('date');
      expect(date!.sortOrder).toBe(1);

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
