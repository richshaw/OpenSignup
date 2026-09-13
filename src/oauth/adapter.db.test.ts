import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { oauthRecords } from '@/db/schema/oauth';
import { DrizzleOidcAdapter, sweepExpiredOauthRecords } from './adapter';

const db = getDb();

async function wipe() {
  await db.delete(oauthRecords).where(eq(oauthRecords.model, 'TestModel'));
  await db.delete(oauthRecords).where(eq(oauthRecords.model, 'OtherModel'));
}

describe('DrizzleOidcAdapter', () => {
  beforeEach(wipe);
  afterEach(wipe);

  it('upserts and finds a payload, extracting the indexed columns', async () => {
    const a = new DrizzleOidcAdapter('TestModel');
    await a.upsert(
      'id-1',
      { grantId: 'g1', uid: 'u1', userCode: 'UC', accountId: 'org_1', clientId: 'c1', kind: 'X' },
      60,
    );
    expect(await a.find('id-1')).toMatchObject({ grantId: 'g1', kind: 'X' });
    expect(await a.findByUid('u1')).toMatchObject({ grantId: 'g1' });
    expect(await a.findByUserCode('UC')).toMatchObject({ grantId: 'g1' });
    const [row] = await db.select().from(oauthRecords).where(eq(oauthRecords.id, 'id-1'));
    expect(row?.accountId).toBe('org_1');
    expect(row?.clientId).toBe('c1');
    expect(row?.expiresAt).toBeInstanceOf(Date);
  });

  it('upsert replaces the payload for an existing id', async () => {
    const a = new DrizzleOidcAdapter('TestModel');
    await a.upsert('id-2', { v: 1 }, 60);
    await a.upsert('id-2', { v: 2 }, 60);
    expect(await a.find('id-2')).toEqual({ v: 2 });
  });

  it('isolates models sharing an id', async () => {
    const a = new DrizzleOidcAdapter('TestModel');
    const b = new DrizzleOidcAdapter('OtherModel');
    await a.upsert('shared', { who: 'a' }, 60);
    await b.upsert('shared', { who: 'b' }, 60);
    expect(await a.find('shared')).toEqual({ who: 'a' });
    expect(await b.find('shared')).toEqual({ who: 'b' });
  });

  it('treats expired records as missing', async () => {
    const a = new DrizzleOidcAdapter('TestModel');
    await a.upsert('id-3', { v: 1 }, 60);
    await db
      .update(oauthRecords)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(oauthRecords.id, 'id-3'));
    expect(await a.find('id-3')).toBeUndefined();
  });

  it('stores records with no expiry (Grant without ttl) and finds them', async () => {
    const a = new DrizzleOidcAdapter('TestModel');
    await a.upsert('id-4', { v: 1 });
    expect(await a.find('id-4')).toEqual({ v: 1 });
  });

  it('consume marks the payload consumed with a timestamp, and keeps the row findable', async () => {
    const a = new DrizzleOidcAdapter('TestModel');
    await a.upsert('id-5', { v: 1 }, 60);
    await a.consume('id-5');
    const found = await a.find('id-5');
    expect(typeof found?.consumed).toBe('number');
  });

  it('destroy removes the row', async () => {
    const a = new DrizzleOidcAdapter('TestModel');
    await a.upsert('id-6', { v: 1 }, 60);
    await a.destroy('id-6');
    expect(await a.find('id-6')).toBeUndefined();
  });

  it('revokeByGrantId removes every record of that model in the grant', async () => {
    const a = new DrizzleOidcAdapter('TestModel');
    const b = new DrizzleOidcAdapter('OtherModel');
    await a.upsert('t1', { grantId: 'g9' }, 60);
    await a.upsert('t2', { grantId: 'g9' }, 60);
    await a.upsert('t3', { grantId: 'other' }, 60);
    await b.upsert('t4', { grantId: 'g9' }, 60);
    await a.revokeByGrantId('g9');
    expect(await a.find('t1')).toBeUndefined();
    expect(await a.find('t2')).toBeUndefined();
    expect(await a.find('t3')).toBeDefined();
    // Other models are the library's job (it calls revokeByGrantId per model).
    expect(await b.find('t4')).toBeDefined();
  });

  it('sweepExpiredOauthRecords deletes only expired rows', async () => {
    const a = new DrizzleOidcAdapter('TestModel');
    await a.upsert('live', { v: 1 }, 600);
    await a.upsert('dead', { v: 1 }, 600);
    await a.upsert('eternal', { v: 1 });
    await db
      .update(oauthRecords)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(oauthRecords.id, 'dead'));
    const removed = await sweepExpiredOauthRecords(db);
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(await a.find('live')).toBeDefined();
    expect(await a.find('eternal')).toBeDefined();
    expect(await a.find('dead')).toBeUndefined();
  });
});
