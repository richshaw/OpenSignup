import type { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { signups } from '@/db/schema/signups';
import { requireActor } from '@/auth/session';
import { fail, handle, respond } from '@/lib/api-response';
import { serviceError } from '@/lib/errors';
import { listActivityForSignup } from '@/lib/activity';
import { requireWorkspaceAccess } from '@/lib/policy';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await ctx.params;
    const actor = await requireActor();
    if (actor.kind !== 'organizer') return fail(serviceError('unauthorized', 'sign in required'));

    const db = getDb();
    const rows = await db.select().from(signups).where(eq(signups.id, id)).limit(1);
    const row = rows[0];
    if (!row) return fail(serviceError('not_found', 'signup not found'));
    requireWorkspaceAccess(actor, row.workspaceId);

    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get('limit') ?? '100');
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;
    const events = await listActivityForSignup(db, id, limit);
    return respond({ ok: true, value: events });
  });
}
