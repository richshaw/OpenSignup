import { and, eq, lt, sql } from 'drizzle-orm';
import type { Adapter, AdapterPayload } from 'oidc-provider';
import { getDb, type Queryable } from '@/db/client';
import { oauthRecords } from '@/db/schema/oauth';

/**
 * `oidc-provider` storage adapter over the single `oauth_records` table.
 *
 * The library instantiates one adapter per model class (`new Adapter('Grant')`,
 * `new Adapter('RefreshToken')`, …) and calls the seven methods below. Every
 * method scopes by `model` as well as `id`, so ids that collide across models
 * (they are random, but nothing forbids it) cannot cross-contaminate.
 *
 * Expired rows are filtered on read rather than trusted to be gone: the
 * library's own semantics treat an expired record as absent, and a delayed
 * sweep must never resurrect a token. `sweepExpiredOauthRecords` is the
 * housekeeping half.
 */
export class DrizzleOidcAdapter implements Adapter {
  constructor(
    private readonly model: string,
    private readonly db: Queryable = getDb(),
  ) {}

  async upsert(id: string, payload: AdapterPayload, expiresIn?: number): Promise<void> {
    const expiresAt =
      typeof expiresIn === 'number' && expiresIn > 0
        ? new Date(Date.now() + expiresIn * 1000)
        : null;
    const columns = {
      payload,
      grantId: str(payload.grantId),
      uid: str(payload.uid),
      userCode: str(payload.userCode),
      accountId: str(payload.accountId),
      clientId: str(payload.clientId),
      expiresAt,
      updatedAt: new Date(),
    };
    await this.db
      .insert(oauthRecords)
      .values({ model: this.model, id, ...columns })
      .onConflictDoUpdate({
        target: [oauthRecords.model, oauthRecords.id],
        set: columns,
      });
  }

  async find(id: string): Promise<AdapterPayload | undefined> {
    const [row] = await this.db
      .select({ payload: oauthRecords.payload, expiresAt: oauthRecords.expiresAt })
      .from(oauthRecords)
      .where(and(eq(oauthRecords.model, this.model), eq(oauthRecords.id, id)))
      .limit(1);
    return live(row);
  }

  async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    const [row] = await this.db
      .select({ payload: oauthRecords.payload, expiresAt: oauthRecords.expiresAt })
      .from(oauthRecords)
      .where(and(eq(oauthRecords.model, this.model), eq(oauthRecords.uid, uid)))
      .limit(1);
    return live(row);
  }

  async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
    const [row] = await this.db
      .select({ payload: oauthRecords.payload, expiresAt: oauthRecords.expiresAt })
      .from(oauthRecords)
      .where(and(eq(oauthRecords.model, this.model), eq(oauthRecords.userCode, userCode)))
      .limit(1);
    return live(row);
  }

  /**
   * Mark a code / refresh token as used. The library reads `payload.consumed`
   * (epoch seconds) to detect replay, so it is written into the JSON as well
   * as the column.
   */
  async consume(id: string): Promise<void> {
    const now = new Date();
    await this.db
      .update(oauthRecords)
      .set({
        consumedAt: now,
        updatedAt: now,
        payload: sql`${oauthRecords.payload} || jsonb_build_object('consumed', ${Math.floor(now.getTime() / 1000)}::int)`,
      })
      .where(and(eq(oauthRecords.model, this.model), eq(oauthRecords.id, id)));
  }

  async destroy(id: string): Promise<void> {
    await this.db
      .delete(oauthRecords)
      .where(and(eq(oauthRecords.model, this.model), eq(oauthRecords.id, id)));
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    await this.db
      .delete(oauthRecords)
      .where(and(eq(oauthRecords.model, this.model), eq(oauthRecords.grantId, grantId)));
  }
}

/** Delete rows whose expiry has passed. Returns the number removed. */
export async function sweepExpiredOauthRecords(db: Queryable): Promise<number> {
  const rows = await db
    .delete(oauthRecords)
    .where(lt(oauthRecords.expiresAt, new Date()))
    .returning({ id: oauthRecords.id });
  return rows.length;
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function live(
  row: { payload: unknown; expiresAt: Date | null } | undefined,
): AdapterPayload | undefined {
  if (!row) return undefined;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return undefined;
  return row.payload as AdapterPayload;
}
