import type { NextRequest } from 'next/server';
import { requireActor } from '@/auth/session';
import { getDb, type Db } from '@/db/client';
import { handle, respond } from './api-response';
import type { ServiceError } from './errors';
import { requireOrganizer, type Actor } from './policy';
import type { Result } from './result';

export interface OrganizerRouteContext<P> {
  req: NextRequest;
  db: Db;
  actor: Extract<Actor, { kind: 'organizer' }>;
  params: P;
}

/**
 * A route handler for a signed-in organizer. A visitor without a session gets
 * the 401 `requireOrganizer` throws; a returned `Result` goes out through
 * `respond`, a returned `Response` as it is. Kept out of `api-response.ts` so
 * the MCP side, which shares that file, never pulls in the cookie session.
 */
export function organizerRoute<P = Record<string, never>>(
  run: (ctx: OrganizerRouteContext<P>) => Promise<Response | Result<unknown, ServiceError>>,
) {
  return (req: NextRequest, ctx: { params: Promise<P> }): Promise<Response> =>
    handle(async () => {
      const params = await ctx.params;
      const actor = await requireActor();
      requireOrganizer(actor);
      const out = await run({ req, db: getDb(), actor, params });
      return out instanceof Response ? out : respond(out);
    });
}
