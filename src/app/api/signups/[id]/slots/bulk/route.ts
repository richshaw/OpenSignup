import type { NextRequest } from 'next/server';
import { requireActor } from '@/auth/session';
import { requireOrganizer } from '@/lib/policy';
import { getDb } from '@/db/client';
import { handle, respond } from '@/lib/api-response';
import { addSlotsBulk } from '@/services/slots';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await ctx.params;
    const actor = await requireActor();
    requireOrganizer(actor);
    const body = await req.json().catch(() => ({}));
    const result = await addSlotsBulk(getDb(), actor, id, body);
    return respond(result);
  });
}
