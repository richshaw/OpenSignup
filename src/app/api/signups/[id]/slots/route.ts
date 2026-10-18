import type { NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { requireActor } from '@/auth/session';
import { requireOrganizer } from '@/lib/policy';
import { fail, handle, respond } from '@/lib/api-response';
import { link } from '@/lib/links';
import { getSignupRowForOrganizer } from '@/services/signups';
import { addSlot, listSlotsForSignup } from '@/services/slots';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await ctx.params;
    const actor = await requireActor();
    requireOrganizer(actor);
    const db = getDb();
    const loaded = await getSignupRowForOrganizer(db, actor, id);
    if (!loaded.ok) return fail(loaded.error);
    const rows = await listSlotsForSignup(db, id);
    return respond({ ok: true, value: rows });
  });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await ctx.params;
    const actor = await requireActor();
    requireOrganizer(actor);
    const body = await req.json().catch(() => ({}));
    const result = await addSlot(getDb(), actor, id, body);
    if (!result.ok) return fail(result.error);
    return respond(result, {
      self: link(`/api/slots/${result.value.id}`),
      update: link(`/api/slots/${result.value.id}`, 'PATCH'),
      delete: link(`/api/slots/${result.value.id}`, 'DELETE'),
      commit: link(`/api/slots/${result.value.id}/commitments`, 'POST'),
    });
  });
}
