import type { NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { requireActor } from '@/auth/session';
import { fail, handle, respond } from '@/lib/api-response';
import { serviceError } from '@/lib/errors';
import { deleteSlot, updateSlot } from '@/services/slots';

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await ctx.params;
    const actor = await requireActor();
    if (actor.kind !== 'organizer') return fail(serviceError('unauthorized', 'sign in required'));
    const body = await req.json().catch(() => ({}));
    const result = await updateSlot(getDb(), actor, id, body);
    return respond(result);
  });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await ctx.params;
    const actor = await requireActor();
    if (actor.kind !== 'organizer') return fail(serviceError('unauthorized', 'sign in required'));
    const result = await deleteSlot(getDb(), actor, id);
    return respond(result);
  });
}
