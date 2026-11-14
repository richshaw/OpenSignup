import { describe, expect, it } from 'vitest';
import { getTranslator } from '@/i18n/translator';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { SlotFieldInputSchema } from '@/schemas/slot-fields';
import { defaultTemplate } from './signup-templates';

/** Swedish from its catalog, throwing on a missing message rather than falling back. */
const swedish = getTranslator('sv', 'participant.defaults', {
  onError: (error) => {
    throw error;
  },
});

describe('signup templates', () => {
  describe('defaultTemplate', () => {
    const template = defaultTemplate(getTestTranslator('participant.defaults'));

    it('seeds a text "What" field followed by a date "Date" field on a capacity-1 slot', () => {
      expect(template.id).toBe('default');
      expect(template.fields).toHaveLength(2);
      expect(template.slots).toHaveLength(1);

      const [what, date] = template.fields;
      expect(what!.ref).toBe('what');
      expect(what!.label).toBe('What');
      expect(what!.fieldType).toBe('text');
      expect(what!.sortOrder).toBe(0);

      expect(date!.ref).toBe('date');
      expect(date!.label).toBe('Date');
      expect(date!.fieldType).toBe('date');
      expect(date!.sortOrder).toBe(1);

      const slot = template.slots[0]!;
      expect(slot.capacity).toBe(1);
      expect(slot.values).toEqual({});
    });

    it('names the columns from the catalog, in the language it is given', () => {
      const asked = defaultTemplate(getStandInTranslator('sv', 'participant.defaults'));
      expect(asked.fields.map((f) => f.label)).toEqual([
        'participant.defaults.what in sv',
        'participant.defaults.date in sv',
      ]);
      expect(defaultTemplate(swedish).fields.map((f) => f.label)).toEqual(['Vad', 'Datum']);
    });

    it('keeps the refs what and date in every language', () => {
      expect(defaultTemplate(swedish).fields.map((f) => f.ref)).toEqual(['what', 'date']);
    });

    it('every field round-trips through SlotFieldInputSchema', () => {
      for (const field of [...template.fields, ...defaultTemplate(swedish).fields]) {
        const parsed = SlotFieldInputSchema.safeParse(field);
        expect(parsed.success).toBe(true);
      }
    });
  });
});
