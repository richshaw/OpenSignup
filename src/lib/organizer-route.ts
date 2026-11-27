import type { NextRequest } from 'next/server';
import { toActor, type OrganizerSession } from '@/auth/organizer-session';
import { getOrganizerSession } from '@/auth/session';
import { getDb, type Db } from '@/db/client';
import { handle, respond } from './api-response';
import type { ServiceError } from './errors';
import { requireOrganizer, type Actor } from './policy';
import type { Result } from './result';

export interface OrganizerRouteContext<P> {
  req: NextRequest;
  db: Db;
  actor: Extract<Actor, { kind: 'organizer' }>;
  /**
   * The session the actor came from, for a handler that also needs the
   * organizer's default workspace or language. React's `cache` doesn't last
   * through a route handler, so reading it again would load it again.
   */
  session: OrganizerSession;
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
      const session = await getOrganizerSession();
      const actor = toActor(session);
      // Without a session the actor is anonymous, so this throws the 401.
      requireOrganizer(actor);
      if (!session) throw new Error('an organizer actor without a session');
      const out = await run({ req, db: getDb(), actor, session, params });
      return out instanceof Response ? out : respond(out);
    });
}
