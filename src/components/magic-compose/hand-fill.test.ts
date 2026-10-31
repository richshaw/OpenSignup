import { describe, expect, it } from 'vitest';
import { STARTER_PROMPTS } from '@/lib/magic-compose/templates';
import { handFillHref } from './hand-fill';

const params = (href: string) => Object.fromEntries(new URL(href, 'http://x').searchParams);

describe('handFillHref', () => {
  it('opens the blank form when nothing was typed', () => {
    expect(handFillHref('')).toBe('/app/signups/new?manual=1');
    expect(handFillHref('  \n ')).toBe('/app/signups/new?manual=1');
  });

  it('opens the blank form for a starter example nobody changed', () => {
    for (const starter of STARTER_PROMPTS) {
      expect(handFillHref(starter.body)).toBe('/app/signups/new?manual=1');
      expect(handFillHref(`${starter.body}\n`)).toBe('/app/signups/new?manual=1');
    }
    const edited = `${STARTER_PROMPTS[0]?.body} Games start at 9am.`;
    expect(params(handFillHref(edited))).toEqual({ manual: '1', description: edited });
  });

  it('carries a short line over as the title', () => {
    expect(params(handFillHref(' Pumpkin carving '))).toEqual({
      manual: '1',
      title: 'Pumpkin carving',
    });
  });

  it('carries anything longer, or on more than one line, over as the description', () => {
    const long = 'Snack duty for our U9 soccer team. Six Saturday games, two families each.';
    expect(params(handFillHref(long))).toEqual({ manual: '1', description: long });
    expect(params(handFillHref('Bake sale\nBring a tray'))).toEqual({
      manual: '1',
      description: 'Bake sale\nBring a tray',
    });
  });

  it('cuts a long description to fit the URL, at a whole character', () => {
    const href = handFillHref('一'.repeat(2000));
    expect(href.length).toBeLessThan(8100);
    expect(params(href).description).toBe('一'.repeat(888));

    const emoji = params(handFillHref('🎃'.repeat(1000))).description ?? '';
    expect(emoji.length).toBeGreaterThan(0);
    expect(emoji).toBe('🎃'.repeat(emoji.length / 2));
  });

  it('carries a long plain-English description past the form limit untouched', () => {
    const long = 'Bring snacks. '.repeat(150).trim();
    expect(params(handFillHref(long)).description).toBe(long);
  });
});
