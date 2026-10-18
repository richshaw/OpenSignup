import { after, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import type { Db } from '@/db/client';
import { extractClientIp } from '@/auth/request-context';
import { fail, handle, ok, readJson, respond } from '@/lib/api-response';
import { serviceError, ServiceException } from '@/lib/errors';
import { commitmentLinks } from '@/lib/links';
import { notifyCommitmentCreated } from '@/email/notify';
import { consumeRateLimit, RateLimits } from '@/lib/rate-limit';
import {
  COMMIT_COOKIE_NAME,
  appendReturningCommit,
  removeReturningCommit,
  setReturningCommitCookie,
} from '@/lib/returning-participant';
import { cancelOwnCommitment, getOwnCommitment, updateOwnCommitment } from '@/services/commitments';

function readToken(req: NextRequest): string | null {
  return new URL(req.url).searchParams.get('token') || req.headers.get('x-edit-token');
}

/** Anonymous, token-authenticated endpoint: meter per IP before any token
 *  verification or DB lookup happens, then return the edit token or refuse. */
async function authorizeTokenOp(db: Db, req: NextRequest): Promise<string> {
  const clientIp = extractClientIp(req.headers);
  await consumeRateLimit(db, RateLimits.commitmentTokenOpsPerIp, clientIp ?? 'unknown');
  const token = readToken(req);
  if (!token) {
    throw new ServiceException(serviceError('forbidden', 'edit token required', { field: 'token' }));
  }
  return token;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const db = getDb();
    const token = await authorizeTokenOp(db, req);
    const result = await getOwnCommitment(db, id, token);
    return respond(result);
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const db = getDb();
    const token = await authorizeTokenOp(db, req);
    const body = await readJson(req);
    const result = await updateOwnCommitment(db, id, token, body);
    if (!result.ok) return fail(result.error);
    const { moved, ...commitment } = result.value;
    if (!moved) return ok(commitment);

    // A swap cancels this commitment and creates a new one with a new id and a
    // new edit token. The link in the confirmation already in the
    // participant's inbox then opens a page saying the sign-up moved, which
    // links on to the new one; send a receipt for the replacement too, so the
    // link they are told to keep is the new one.
    //
    // A participant without an email gets no receipt. So, as signing up does,
    // the response carries the new edit link, and the returning-participant
    // cookie takes the new commitment in place of the old one.
    //
    // Each move is a new commitment, so the once-per-commitment check in
    // notifyCommitmentCreated never stops these receipts. Moving back and forth
    // would otherwise mail the address as often as the per-IP limit allows, so
    // the receipt is charged to the address, as signing up is.
    const { editUrl, links } = commitmentLinks(moved.signupSlug, commitment.id, moved.editToken);
    const response = ok({ ...commitment, editToken: moved.editToken, editUrl }, { links });
    const nextCookie = appendReturningCommit(
      removeReturningCommit(req.cookies.get(COMMIT_COOKIE_NAME)?.value, id),
      {
        commitmentId: commitment.id,
        token: moved.editToken,
        signupId: commitment.signupId,
        slotAt: moved.slotAt,
      },
    );
    setReturningCommitCookie(response, nextCookie);
    after(() =>
      notifyCommitmentCreated(db, commitment.id, moved.editToken, { meterRecipient: true }),
    );
    return response;
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const db = getDb();
    const token = await authorizeTokenOp(db, req);
    const result = await cancelOwnCommitment(db, id, token);
    const response = respond(result);
    if (result.ok) {
      const next = removeReturningCommit(req.cookies.get(COMMIT_COOKIE_NAME)?.value, id);
      setReturningCommitCookie(response, next);
    }
    return response;
  });
}
