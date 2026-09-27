import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { magicLinks } from '@/db/schema/magic-links';
import { LOGIN_CODE_MAX_AGE_MS, issueLoginCode, redeemLoginCode, sweepExpiredLoginCodes } from './login-code';

const db = getDb();
const EMAIL = 'code-test@example.com';
const URL_ = 'http://localhost:3000/api/auth/callback/nodemailer?token=t1&email=code-test%40example.com';
const later = () => new Date(Date.now() + 60_000);

afterEach(async () => {
  await db.delete(magicLinks).where(eq(magicLinks.email, EMAIL));
});

describe('login codes', () => {
  it('issues a code that redeems the stored callback exactly once', async () => {
    const code = await issueLoginCode(db, { email: EMAIL, callbackUrl: URL_, expiresAt: later() });
    const [row] = await db.select().from(magicLinks).where(eq(magicLinks.email, EMAIL));
    expect(row?.payloadEncrypted).not.toContain('token=t1');
    expect(await redeemLoginCode(db, { email: EMAIL, code })).toEqual({ ok: true, value: URL_ });
    const again = await redeemLoginCode(db, { email: EMAIL, code });
    expect(again.ok).toBe(false);
  });

  it('rejects a wrong code, a code for another email, and an expired code', async () => {
    const code = await issueLoginCode(db, { email: EMAIL, callbackUrl: URL_, expiresAt: later() });
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
    expect((await redeemLoginCode(db, { email: EMAIL, code: wrong })).ok).toBe(false);
    expect((await redeemLoginCode(db, { email: 'other@example.com', code })).ok).toBe(false);
    await db.update(magicLinks).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(magicLinks.email, EMAIL));
    const expired = await redeemLoginCode(db, { email: EMAIL, code });
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.error.code).toBe('already_consumed');
  });

  it('a newer code retires the previous one for the same email', async () => {
    const first = await issueLoginCode(db, { email: EMAIL, callbackUrl: URL_, expiresAt: later() });
    const second = await issueLoginCode(db, { email: EMAIL, callbackUrl: URL_ + '&v=2', expiresAt: later() });
    expect((await redeemLoginCode(db, { email: EMAIL, code: first })).ok).toBe(false);
    expect(await redeemLoginCode(db, { email: EMAIL, code: second })).toEqual({ ok: true, value: URL_ + '&v=2' });
  });

  it('never outlives 15 minutes, whatever the link expiry', async () => {
    await issueLoginCode(db, { email: EMAIL, callbackUrl: URL_, expiresAt: new Date(Date.now() + 7 * 24 * 3600_000) });
    const [row] = await db.select().from(magicLinks).where(eq(magicLinks.email, EMAIL));
    expect(row!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + LOGIN_CODE_MAX_AGE_MS + 1000);
  });

  it('overlapping requests leave exactly one live code', async () => {
    const codes = await Promise.all(
      Array.from({ length: 4 }, () => issueLoginCode(db, { email: EMAIL, callbackUrl: URL_, expiresAt: later() })),
    );
    const live = await db.select().from(magicLinks).where(eq(magicLinks.email, EMAIL));
    expect(live.filter((r) => !r.consumedAt)).toHaveLength(1);
    const redeemed = await Promise.all(codes.map((code) => redeemLoginCode(db, { email: EMAIL, code })));
    expect(redeemed.filter((r) => r.ok)).toHaveLength(1);
  });

  it('the sweep removes used and expired codes and keeps a live one', async () => {
    const used = await issueLoginCode(db, { email: EMAIL, callbackUrl: URL_, expiresAt: later() });
    await redeemLoginCode(db, { email: EMAIL, code: used });
    await issueLoginCode(db, { email: EMAIL, callbackUrl: URL_, expiresAt: later() });
    await db.update(magicLinks).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(magicLinks.tokenHash, (await db.select().from(magicLinks).where(eq(magicLinks.email, EMAIL)))[1]!.tokenHash));
    await issueLoginCode(db, { email: EMAIL, callbackUrl: URL_, expiresAt: later() });
    const removed = await sweepExpiredLoginCodes(db);
    expect(removed).toBeGreaterThanOrEqual(2);
    const left = await db.select().from(magicLinks).where(eq(magicLinks.email, EMAIL));
    expect(left).toHaveLength(1);
    expect(left[0]!.consumedAt).toBeNull();
  });
});
