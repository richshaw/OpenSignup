import type { NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { requireActor } from '@/auth/session';
import { fail, handle, respond } from '@/lib/api-response';
import { serviceError } from '@/lib/errors';
import { archiveSignup } from '@/services/signups';

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await ctx.params;
    const actor = await requireActor();
    if (actor.kind !== 'organizer') return fail(serviceError('unauthorized', 'sign in required'));
    const result = await archiveSignup(getDb(), actor, id);
    return respond(result);
  });
}
