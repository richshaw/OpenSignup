import type { NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { requireActor } from '@/auth/session';
import { requireOrganizer } from '@/lib/policy';
import { fail, handle, respond } from '@/lib/api-response';
import { listActivityForSignup } from '@/lib/activity';
import { getSignupRowForOrganizer } from '@/services/signups';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await ctx.params;
    const actor = await requireActor();
    requireOrganizer(actor);

    const db = getDb();
    const loaded = await getSignupRowForOrganizer(db, actor, id);
    if (!loaded.ok) return fail(loaded.error);

    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get('limit') ?? '100');
    // Whole numbers only: a fractional limit reaches SQL LIMIT as a bigint and fails.
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.trunc(limitRaw), 1), 500)
      : 100;
    const events = await listActivityForSignup(db, id, limit);
    return respond({ ok: true, value: events });
  });
}
