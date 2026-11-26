import { organizerRoute } from '@/lib/organizer-route';
import { listActivity } from '@/services/signups';

const DEFAULT_LIMIT = 100;

export const GET = organizerRoute<{ id: string }>(({ req, db, actor, params: { id } }) => {
  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT);
  // Whole numbers only: a fractional limit reaches SQL LIMIT as a bigint and fails.
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.trunc(limitRaw), 1), 500)
    : DEFAULT_LIMIT;
  return listActivity(db, actor, id, limit);
});
