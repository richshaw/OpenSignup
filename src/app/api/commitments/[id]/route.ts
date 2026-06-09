import type { NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import type { Db } from '@/db/client';
import { extractClientIp } from '@/auth/request-context';
import { fail, handle, respond } from '@/lib/api-response';
import { serviceError } from '@/lib/errors';
import { consumeRateLimit, RateLimits } from '@/lib/rate-limit';
import {
  COMMIT_COOKIE_NAME,
  removeReturningCommit,
  setReturningCommitCookie,
} from '@/lib/returning-participant';
import { cancelOwnCommitment, getOwnCommitment, updateOwnCommitment } from '@/services/commitments';

function readToken(req: NextRequest): string | null {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get('token');
  if (fromQuery) return fromQuery;
  const header = req.headers.get('x-edit-token');
  return header ?? null;
}

/** Anonymous, token-authenticated endpoint: meter per IP before any token
 *  verification or DB lookup happens. */
async function limitTokenOps(db: Db, req: NextRequest): Promise<void> {
  const clientIp = extractClientIp(req.headers);
  await consumeRateLimit(db, RateLimits.commitmentTokenOpsPerIp, clientIp ?? 'unknown');
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const db = getDb();
    await limitTokenOps(db, req);
    const token = readToken(req);
    if (!token) return fail(serviceError('forbidden', 'edit token required', { field: 'token' }));
    const result = await getOwnCommitment(db, id, token);
    return respond(result);
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const db = getDb();
    await limitTokenOps(db, req);
    const token = readToken(req);
    if (!token) return fail(serviceError('forbidden', 'edit token required', { field: 'token' }));
    const body = await req.json().catch(() => ({}));
    const result = await updateOwnCommitment(db, id, token, body);
    return respond(result);
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const db = getDb();
    await limitTokenOps(db, req);
    const token = readToken(req);
    if (!token) return fail(serviceError('forbidden', 'edit token required', { field: 'token' }));
    const result = await cancelOwnCommitment(db, id, token);
    const response = respond(result);
    if (result.ok) {
      const next = removeReturningCommit(req.cookies.get(COMMIT_COOKIE_NAME)?.value, id);
      setReturningCommitCookie(response, next);
    }
    return response;
  });
}
