import { describe, expect, it } from 'vitest';
import { FIELD_TYPES } from '@/schemas/slot-fields';
import { FIELD_GUIDE, SLOT_VALUE_FORMATS, SLOT_VALUES_GUIDE } from './guides';
import { updateFieldTool } from './fields';
import { addSlotsTool } from './slots';

describe('FIELD_GUIDE', () => {
  // As a list entry, not just the word: "dates" and "numbers" also turn up in the explanations.
  it.each(FIELD_TYPES)('lists the %s field type', (fieldType) => {
    expect(FIELD_GUIDE).toMatch(new RegExp(`(?:Field types: |, )${fieldType}\\b`));
  });

  it('says the organizer fills fields in, not participants', () => {
    expect(FIELD_GUIDE).toMatch(/columns the organizer fills in/);
    expect(FIELD_GUIDE).toMatch(/participants do not fill them in/);
  });

  it('says every sign-up already records a name and note, and an email only usually', () => {
    expect(FIELD_GUIDE).toMatch(/gives their name and can leave a note/);
    expect(FIELD_GUIDE).toMatch(/an email unless the signup makes it optional/);
  });
});

describe('update_field', () => {
  it.each(FIELD_TYPES)('gives the config for the %s field type', (fieldType) => {
    expect(updateFieldTool.description).toContain(`${fieldType} { fieldType: "${fieldType}"`);
  });
});

describe('add_slots', () => {
  it('takes its value formats and capacity rule from the guides', () => {
    expect(addSlotsTool.description).toContain(SLOT_VALUE_FORMATS);
    expect(addSlotsTool.description).toContain(SLOT_VALUES_GUIDE);
  });
});
