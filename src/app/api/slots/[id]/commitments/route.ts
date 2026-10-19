import { after, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { fail, handle, ok, readJson } from '@/lib/api-response';
import {
  COMMIT_COOKIE_NAME,
  appendReturningCommit,
  setReturningCommitCookie,
} from '@/lib/returning-participant';
import { commitmentLinks } from '@/lib/links';
import { notifyCommitmentCreated } from '@/email/notify';
import { consumeRateLimit, RateLimits } from '@/lib/rate-limit';
import { normalizeEmail } from '@/schemas/common';
import { commitToSlot } from '@/services/commitments';
import { extractClientIp } from '@/auth/request-context';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id: slotId } = await ctx.params;
    const db = getDb();
    const clientIp = extractClientIp(req.headers);
    await consumeRateLimit(db, RateLimits.commitmentPerIp, clientIp ?? 'unknown');
    const body = await readJson(req);
    // Per-address limit as well as per-IP, consumed before commitToSlot so a
    // rejected request never reaches the send. The address is unverified and
    // this endpoint now produces outbound mail, so the IP bucket alone would
    // let one caller spray a stranger's inbox across a signup's slots. Shape is
    // only checked here; commitToSlot's Zod parse remains the authority. A
    // blank or missing email, which a signup can make optional, skips it:
    // without an address nothing is mailed.
    const claimedEmail =
      typeof body === 'object' && body !== null ? (body as { email?: unknown }).email : undefined;
    if (typeof claimedEmail === 'string' && claimedEmail.includes('@')) {
      await consumeRateLimit(db, RateLimits.commitmentPerEmail, normalizeEmail(claimedEmail));
    }
    const result = await commitToSlot(db, slotId, body);
    if (!result.ok) return fail(result.error);

    const { signupSlug, slotAt, repeated, ...responseValue } = result.value;
    const { editUrl, links } = commitmentLinks(
      signupSlug,
      responseValue.commitment.id,
      responseValue.editToken,
    );
    const response = ok({ ...responseValue, editUrl }, { links });
    // Remembered until a week after the slot, so someone who signs up far
    // ahead, perhaps without an email, can still find their way back.
    const nextCookie = appendReturningCommit(req.cookies.get(COMMIT_COOKIE_NAME)?.value ?? null, {
      commitmentId: responseValue.commitment.id,
      token: responseValue.editToken,
      signupId: responseValue.commitment.signupId,
      slotAt,
    });
    setReturningCommitCookie(response, nextCookie);

    // After the response, so a slow mail server never holds up a participant
    // who has already got their slot. Failures are logged, never surfaced. A
    // repeat of a sign-up already made sends nothing: the first one's
    // confirmation went, or the participant gave no email. Its response is
    // the first one's again, cookie and all, since that is what never arrived.
    if (!repeated) {
      after(() =>
        notifyCommitmentCreated(db, responseValue.commitment.id, responseValue.editToken),
      );
    }

    return response;
  });
}
