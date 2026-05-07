import { describe, expect, it } from 'vitest';
import { makeId } from './ids';

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
