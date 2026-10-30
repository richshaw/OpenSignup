import { describe, expect, it } from 'vitest';
import { handFillHref } from './hand-fill';

const params = (href: string) => Object.fromEntries(new URL(href, 'http://x').searchParams);

describe('handFillHref', () => {
  it('opens the blank form when nothing was typed', () => {
    expect(handFillHref('')).toBe('/app/signups/new?manual=1');
    expect(handFillHref('  \n ')).toBe('/app/signups/new?manual=1');
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
});
