import type { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import { fail, handle, respond } from '@/lib/api-response';
import {
  COMMIT_COOKIE_NAME,
  appendReturningCommit,
  setReturningCommitCookie,
} from '@/lib/returning-participant';
import { serviceError } from '@/lib/errors';
import { commitmentEditUrl, link } from '@/lib/links';
import { commitToSlot } from '@/services/commitments';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id: slotId } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const db = getDb();
    const result = await commitToSlot(db, slotId, body);
    if (!result.ok) return fail(result.error);

    const slotRow = await db.select().from(slots).where(eq(slots.id, slotId)).limit(1);
    const first = slotRow[0];
    if (!first) return fail(serviceError('not_found', 'slot vanished'));
    const signupRow = await db.select().from(signups).where(eq(signups.id, first.signupId)).limit(1);
    const sig = signupRow[0];
    if (!sig) return fail(serviceError('not_found', 'signup missing'));

    const editUrl = commitmentEditUrl(sig.slug, result.value.commitment.id, result.value.editToken);
    const response = respond(
      { ok: true, value: { ...result.value, editUrl } },
      {
        edit: link(editUrl),
        self: link(`/api/commitments/${result.value.commitment.id}?token=${result.value.editToken}`),
        cancel: link(
          `/api/commitments/${result.value.commitment.id}?token=${result.value.editToken}`,
          'DELETE',
        ),
      },
    );
    const nextCookie = appendReturningCommit(
      req.cookies.get(COMMIT_COOKIE_NAME)?.value ?? null,
      result.value.commitment.id,
      result.value.editToken,
    );
    setReturningCommitCookie(response, nextCookie);
    return response;
  });
}
