import type { NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { requireActor } from '@/auth/session';
import { fail, handle, respond } from '@/lib/api-response';
import { serviceError } from '@/lib/errors';
import { link, publicSignupUrl } from '@/lib/links';
import { getSignupForOrganizer, updateSignup } from '@/services/signups';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await ctx.params;
    const actor = await requireActor();
    const result = await getSignupForOrganizer(getDb(), actor, id);
    if (!result.ok) return fail(result.error);
    return respond(result, {
      self: link(`/api/signups/${id}`),
      update: link(`/api/signups/${id}`, 'PATCH'),
      addSlot: link(`/api/signups/${id}/slots`, 'POST'),
      publish: link(`/api/signups/${id}/publish`, 'POST'),
      close: link(`/api/signups/${id}/close`, 'POST'),
      archive: link(`/api/signups/${id}/archive`, 'POST'),
      activity: link(`/api/signups/${id}/activity`),
      exportCsv: link(`/api/signups/${id}/export.csv`),
      public: link(publicSignupUrl(result.value.slug)),
    });
  });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await ctx.params;
    const actor = await requireActor();
    if (actor.kind !== 'organizer') return fail(serviceError('unauthorized', 'sign in required'));
    const body = await req.json().catch(() => ({}));
    const result = await updateSignup(getDb(), actor, id, body);
    return respond(result);
  });
}
