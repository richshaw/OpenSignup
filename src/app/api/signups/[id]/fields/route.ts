import type { NextRequest } from 'next/server';
import { requireActor } from '@/auth/session';
import { getDb } from '@/db/client';
import { fail, handle, respond } from '@/lib/api-response';
import { serviceError } from '@/lib/errors';
import { link } from '@/lib/links';
import { addField, listFields } from '@/services/slot-fields';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await ctx.params;
    const actor = await requireActor();
    if (actor.kind !== 'organizer') return fail(serviceError('unauthorized', 'sign in required'));
    const result = await listFields(getDb(), actor, id);
    return respond(result);
  });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await ctx.params;
    const actor = await requireActor();
    if (actor.kind !== 'organizer') return fail(serviceError('unauthorized', 'sign in required'));
    const body = await req.json().catch(() => ({}));
    const result = await addField(getDb(), actor, id, body);
    if (!result.ok) return fail(result.error);
    return respond(result, {
      self: link(`/api/signups/${id}/fields/${result.value.id}`),
      update: link(`/api/signups/${id}/fields/${result.value.id}`, 'PATCH'),
      delete: link(`/api/signups/${id}/fields/${result.value.id}`, 'DELETE'),
    });
  });
}
