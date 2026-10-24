import { describe, expect, it } from 'vitest';
import { DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH } from '@/schemas/signups';
import { fitDraftText, shortenToLimit } from './fit-text';

describe('shortenToLimit', () => {
  it('leaves text within the limit alone', () => {
    expect(shortenToLimit('Snack duty', 10)).toBe('Snack duty');
  });

  it('cuts at the last space before the limit and ends with an ellipsis', () => {
    const out = shortenToLimit('one two three four', 12);
    expect(out).toBe('one two…');
    expect(out.length).toBeLessThanOrEqual(12);
  });

  it('drops punctuation left at the cut', () => {
    expect(shortenToLimit('Bring snacks, drinks, and plates please', 22)).toBe('Bring snacks, drinks…');
  });

  it('cuts mid-word when there is no space to cut at', () => {
    const out = shortenToLimit('x'.repeat(30), 10);
    expect(out).toBe(`${'x'.repeat(9)}…`);
  });

  it('never splits an emoji in half', () => {
    const out = shortenToLimit(`${'a'.repeat(8)}😀😀😀`, 10);
    expect(out).toBe(`${'a'.repeat(8)}…`);
  });
});

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
