import { fail, ok } from '@/lib/api-response';
import { listActivityForSignup } from '@/lib/activity';
import { organizerRoute } from '@/lib/organizer-route';
import { getSignupRowForOrganizer } from '@/services/locks';

export const GET = organizerRoute<{ id: string }>(async ({ req, db, actor, params: { id } }) => {
  const loaded = await getSignupRowForOrganizer(db, actor, id);
  if (!loaded.ok) return fail(loaded.error);

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get('limit') ?? '100');
  // Whole numbers only: a fractional limit reaches SQL LIMIT as a bigint and fails.
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.trunc(limitRaw), 1), 500)
    : 100;
  return ok(await listActivityForSignup(db, id, limit));
});
