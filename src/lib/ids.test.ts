import { describe, expect, it } from 'vitest';
import { isId, makeId, parseId } from './ids';

describe('makeId', () => {
  it('returns prefixed 22-char body', () => {
    const id = makeId('sig');
    expect(id).toMatch(/^sig_[A-Za-z0-9]{22}$/);
  });

  it('produces sortable IDs (UUIDv7 time ordering)', async () => {
    const a = makeId('sig');
    await new Promise((r) => setTimeout(r, 2));
    const b = makeId('sig');
    expect(b > a).toBe(true);
  });

  it('produces unique IDs under tight loop', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(makeId('slot'));
    expect(ids.size).toBe(1000);
  });
});

describe('isId', () => {
  it('matches correct prefix', () => {
    const id = makeId('sig');
    expect(isId('sig', id)).toBe(true);
  });

  it('rejects wrong prefix', () => {
    const id = makeId('sig');
    expect(isId('slot', id)).toBe(false);
  });

  it('rejects malformed strings', () => {
    expect(isId('sig', 'sig_short')).toBe(false);
    expect(isId('sig', 'sig_')).toBe(false);
    expect(isId('sig', 42)).toBe(false);
    expect(isId('sig', undefined)).toBe(false);
  });
});

describe('parseId', () => {
  it('parses valid IDs', () => {
    const id = makeId('slot');
    const parsed = parseId(id);
    expect(parsed?.prefix).toBe('slot');
    expect(parsed?.body).toHaveLength(22);
  });

  it('returns null for unknown prefixes', () => {
    expect(parseId('xxx_' + 'A'.repeat(22))).toBeNull();
  });
});
