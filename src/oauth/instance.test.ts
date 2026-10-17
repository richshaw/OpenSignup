import { describe, expect, it, vi } from 'vitest';
import type { Db } from '@/db/client';

const check = vi.fn(async (..._args: unknown[]): Promise<number | null> => null);
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return { ...actual, chargeRateLimit: (...args: unknown[]) => check(...args) };
});

const db = {} as Db;

describe('allowCimdFetch', () => {
  it('charges the client origin and allows the fetch while it is under the limit', async () => {
    const { allowCimdFetch } = await import('./instance');
    check.mockClear();
    expect(await allowCimdFetch(db, 'https://client.example/oauth/client.json')).toBe(true);
    const [, policy, subject] = check.mock.calls[0] as [unknown, { bucket: string }, string];
    expect([policy.bucket, subject]).toEqual(['oauth.cimd.origin', 'https://client.example']);
  });

  it('refuses the fetch once the origin is over the limit', async () => {
    const { allowCimdFetch } = await import('./instance');
    check.mockResolvedValueOnce(120);
    expect(await allowCimdFetch(db, 'https://client.example/oauth/client.json')).toBe(false);
  });

  it('refuses a client id that is not a URL without charging anything', async () => {
    const { allowCimdFetch } = await import('./instance');
    check.mockClear();
    expect(await allowCimdFetch(db, 'not a url')).toBe(false);
    expect(check).not.toHaveBeenCalled();
  });
});
