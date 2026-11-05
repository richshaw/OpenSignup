import { describe, expect, it } from 'vitest';
import { shortenToLimit } from './shorten';

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
    expect(shortenToLimit('Bring snacks, drinks, and plates please', 22)).toBe(
      'Bring snacks, drinks…',
    );
  });

  it('cuts mid-word when there is no space to cut at', () => {
    const out = shortenToLimit('x'.repeat(30), 10);
    expect(out).toBe(`${'x'.repeat(9)}…`);
  });

  it('never splits an emoji in half', () => {
    const out = shortenToLimit(`${'a'.repeat(8)}😀😀😀`, 10);
    expect(out).toBe(`${'a'.repeat(8)}…`);
  });

  it('keeps most of the text when the only space comes early', () => {
    const text = `Details: https://example.com/${'a'.repeat(300)}`;
    const out = shortenToLimit(text, 200);
    expect(out).toBe(`${text.slice(0, 199)}…`);
    expect(out).toHaveLength(200);
  });

  it('counts the ellipsis toward the limit', () => {
    for (const text of ['x'.repeat(500), 'word '.repeat(100), `${'a'.repeat(198)}😀😀`]) {
      expect(shortenToLimit(text, 200).length).toBeLessThanOrEqual(200);
    }
  });
});
