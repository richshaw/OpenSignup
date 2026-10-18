import type { NextRequest } from 'next/server';
import { requireActor } from '@/auth/session';
import { requireOrganizer } from '@/lib/policy';
import { getDb } from '@/db/client';
import { handle, respond } from '@/lib/api-response';
import { reorderSlots } from '@/services/slots';

/**
 * Put every slot of the signup in the order `slotIds` gives, in one
 * transaction. The builder sends this when a slot is dragged, so a failure
 * never leaves the order half-applied.
 */
export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await ctx.params;
    const actor = await requireActor();
    requireOrganizer(actor);
    const body = await req.json().catch(() => ({}));
    const result = await reorderSlots(getDb(), actor, id, body);
    return respond(result);
  });
}
