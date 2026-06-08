import type { NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { fail, handle, respond } from '@/lib/api-response';
import {
  COMMIT_COOKIE_NAME,
  appendReturningCommit,
  setReturningCommitCookie,
} from '@/lib/returning-participant';
import { commitmentEditUrl, link } from '@/lib/links';
import { consumeRateLimit, RateLimits } from '@/lib/rate-limit';
import { commitToSlot } from '@/services/commitments';
import { extractClientIp } from '@/auth/request-context';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id: slotId } = await ctx.params;
    const db = getDb();
    const clientIp = extractClientIp(req.headers);
    await consumeRateLimit(db, RateLimits.commitmentPerIp, clientIp ?? 'unknown');
    const body = await req.json().catch(() => ({}));
    const result = await commitToSlot(db, slotId, body);
    if (!result.ok) return fail(result.error);

    const { signupSlug, ...responseValue } = result.value;
    const editUrl = commitmentEditUrl(signupSlug, responseValue.commitment.id, responseValue.editToken);
    const response = respond(
      { ok: true, value: { ...responseValue, editUrl } },
      {
        edit: link(editUrl),
        self: link(`/api/commitments/${responseValue.commitment.id}?token=${responseValue.editToken}`),
        cancel: link(
          `/api/commitments/${responseValue.commitment.id}?token=${responseValue.editToken}`,
          'DELETE',
        ),
      },
    );
    const nextCookie = appendReturningCommit(
      req.cookies.get(COMMIT_COOKIE_NAME)?.value ?? null,
      responseValue.commitment.id,
      responseValue.editToken,
      responseValue.commitment.signupId,
    );
    setReturningCommitCookie(response, nextCookie);
    return response;
  });
}
