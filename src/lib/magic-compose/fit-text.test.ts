import { describe, expect, it } from 'vitest';
import { DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH } from '@/schemas/signups';
import { fitDraftText } from './fit-text';

const draft = {
  title: 'Snack duty',
  description: 'Two families per game.',
  fields: [{ ref: 'what', label: 'What', fieldType: 'text' }],
  slots: [{ values: { what: 'Fruit' } }],
};

describe('fitDraftText', () => {
  it('shortens a description over the limit and says so', () => {
    const long = `${'Please bring a dish to share. '.repeat(70)}`;
    expect(long.length).toBeGreaterThan(DESCRIPTION_MAX_LENGTH);
    const { value, warnings } = fitDraftText({ ...draft, description: long });
    const description = (value as { description: string }).description;
    expect(description.length).toBeLessThanOrEqual(DESCRIPTION_MAX_LENGTH);
    expect(description.endsWith('…')).toBe(true);
    expect(warnings).toEqual([
      "The AI's description was longer than 2,000 characters, so the end was cut off. Check it below.",
    ]);
  });

  it('shortens a title over the limit and says so', () => {
    const long = 'Spring season snack duty for the under nines '.repeat(4);
    expect(long.length).toBeGreaterThan(TITLE_MAX_LENGTH);
    const { value, warnings } = fitDraftText({ ...draft, title: long });
    const title = (value as { title: string }).title;
    expect(title.length).toBeLessThanOrEqual(TITLE_MAX_LENGTH);
    expect(title.endsWith('…')).toBe(true);
    expect(warnings).toEqual([
      "The AI's title was longer than 120 characters, so the end was cut off. Check it below.",
    ]);
  });

  it('keeps the rest of the draft as it was', () => {
    const { value } = fitDraftText({ ...draft, description: 'x '.repeat(1500) });
    expect(value).toMatchObject({ title: draft.title, fields: draft.fields, slots: draft.slots });
  });

  it('adds no warning to a draft within the limits', () => {
    const { value, warnings } = fitDraftText(draft);
    expect(value).toEqual(draft);
    expect(warnings).toEqual([]);
  });

  it('passes through anything that is not a draft object', () => {
    for (const raw of [null, 'text', 3, [], { refusalReason: 'no' }, { title: 7 }]) {
      expect(fitDraftText(raw)).toEqual({ value: raw, warnings: [] });
    }
  });
});
