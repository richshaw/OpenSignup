import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { idempotencyKeys } from '@/db/schema/idempotency';
import type { Db } from '@/db/client';
import { makeId } from './ids';

export interface IdempotencyContext {
  organizerId?: string | null;
  participantScope?: string | null;
  key: string;
  requestBody: unknown;
  ttlSeconds?: number;
}

export async function findReplay(
  db: Db,
  ctx: IdempotencyContext,
): Promise<{ responseBody: string; responseStatus: number } | null> {
  const rows = await db
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.key, ctx.key),
        ctx.organizerId
          ? eq(idempotencyKeys.organizerId, ctx.organizerId)
          : ctx.participantScope != null
            ? eq(idempotencyKeys.participantScope, ctx.participantScope)
            : isNull(idempotencyKeys.participantScope),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.requestHash !== hashBody(ctx.requestBody)) return null; // treated as 409 by caller
  if (row.expiresAt.getTime() < Date.now()) return null;
  return { responseBody: row.responseBody, responseStatus: row.responseStatus };
}

export async function saveResponse(
  db: Db,
  ctx: IdempotencyContext,
  response: { status: number; body: string },
): Promise<void> {
  const ttl = ctx.ttlSeconds ?? 60 * 60 * 24;
  await db.insert(idempotencyKeys).values({
    id: makeId('idm'),
    key: ctx.key,
    organizerId: ctx.organizerId ?? null,
    participantScope: ctx.participantScope ?? null,
    requestHash: hashBody(ctx.requestBody),
    responseBody: response.body,
    responseStatus: response.status,
    expiresAt: new Date(Date.now() + ttl * 1000),
  });
}

function hashBody(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex');
}
