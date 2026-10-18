import type { NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { requireActor } from '@/auth/session';
import { requireOrganizer } from '@/lib/policy';
import { handle, respond } from '@/lib/api-response';
import { closeSignup } from '@/services/signups';

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await ctx.params;
    const actor = await requireActor();
    requireOrganizer(actor);
    const result = await closeSignup(getDb(), actor, id);
    return respond(result);
  });
}
