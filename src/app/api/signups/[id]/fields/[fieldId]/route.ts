import type { NextRequest } from 'next/server';
import { requireActor } from '@/auth/session';
import { getDb } from '@/db/client';
import { fail, handle, respond } from '@/lib/api-response';
import { serviceError } from '@/lib/errors';
import { deleteField, updateField } from '@/services/slot-fields';

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; fieldId: string }> },
) {
  return handle(async () => {
    const { fieldId } = await ctx.params;
    const actor = await requireActor();
    if (actor.kind !== 'organizer') return fail(serviceError('unauthorized', 'sign in required'));
    const body = await req.json().catch(() => ({}));
    const result = await updateField(getDb(), actor, fieldId, body);
    return respond(result);
  });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; fieldId: string }> },
) {
  return handle(async () => {
    const { fieldId } = await ctx.params;
    const actor = await requireActor();
    if (actor.kind !== 'organizer') return fail(serviceError('unauthorized', 'sign in required'));
    const result = await deleteField(getDb(), actor, fieldId);
    return respond(result);
  });
}
