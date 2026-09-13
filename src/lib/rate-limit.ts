import { lt, sql } from 'drizzle-orm';
import { rateLimits } from '@/db/schema/idempotency';
import type { Db } from '@/db/client';
import { serviceError, ServiceException } from './errors';

export interface RateLimitPolicy {
  bucket: string;
  max: number;
  windowSeconds: number;
}

/**
 * Sliding-ish fixed-window rate limit backed by Postgres.
 * Cheap and sufficient for v1. For per-IP hot paths we rely on HTTP
 * edge/CDN layer in production as well.
 */
export async function consumeRateLimit(
  db: Db,
  policy: RateLimitPolicy,
  subject: string,
): Promise<void> {
  const now = new Date();
  const windowStart = new Date(
    Math.floor(now.getTime() / (policy.windowSeconds * 1000)) * (policy.windowSeconds * 1000),
  );

  const [bumped] = await db
    .insert(rateLimits)
    .values({
      bucket: policy.bucket,
      subject,
      windowStart,
      count: 1,
    })
    .onConflictDoUpdate({
      target: [rateLimits.bucket, rateLimits.subject, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });

  if (!bumped) {
    throw new ServiceException(serviceError('internal', 'rate limit check failed'));
  }

  if (bumped.count > policy.max) {
    const retryAfter = Math.ceil(
      (windowStart.getTime() + policy.windowSeconds * 1000 - now.getTime()) / 1000,
    );
    throw new ServiceException(
      serviceError('rate_limited', 'too many requests', {
        details: { retryAfterSeconds: retryAfter, bucket: policy.bucket },
        suggestion: `wait ${retryAfter}s and retry`,
      }),
    );
  }
}

export const RateLimits = {
  magicLinkPerEmail: { bucket: 'auth.magic.email', max: 5, windowSeconds: 3600 },
  magicLinkPerIp: { bucket: 'auth.magic.ip', max: 20, windowSeconds: 3600 },
  commitmentPerIp: { bucket: 'commit.ip', max: 10, windowSeconds: 60 },
  // Per-address, mirroring magicLinkPerEmail. A commit now sends a confirmation
  // to an address nobody has verified, so without this one IP can put a
  // stranger's address on every slot of a signup and turn each into an
  // unsolicited token-bearing email. Well above what a real participant needs:
  // one address committing to more than this many slots an hour is not a person
  // signing up for a rota.
  commitmentPerEmail: { bucket: 'commit.email', max: 10, windowSeconds: 3600 },
  // Anonymous token-authenticated reads/edits on /api/commitments/[id]:
  // generous for legitimate participants, hostile to edit-token brute force
  // and unmetered DB hits.
  commitmentTokenOpsPerIp: { bucket: 'commit.token.ip', max: 30, windowSeconds: 60 },
  signupCreatePerOrganizer: { bucket: 'signup.create', max: 60, windowSeconds: 3600 },
  magicComposePerOrganizer: { bucket: 'magic.compose', max: 10, windowSeconds: 3600 },
  // Unsubscribe is unauthenticated and token-guarded. Generous on purpose:
  // RFC 8058 one-click POSTs arrive from a handful of provider egress IPs on
  // behalf of every recipient, so a tight per-IP cap would become an
  // instance-wide ceiling on unsubscribes — the one request we must never
  // drop. The downside is small: a wrong token is rejected before the
  // participant lookup, so a bogus request costs this bucket's own upsert and
  // an HMAC, nothing more.
  reminderOptOutPerIp: { bucket: 'reminder.optout.ip', max: 300, windowSeconds: 3600 },
  // Unauthenticated writes into the append-only activity log.
  telemetryPerIp: { bucket: 'telemetry.ip', max: 30, windowSeconds: 3600 },
  // OAuth token endpoint: authorization-code exchange and refresh. The main
  // brute-force target (codes are single-use and short-lived, but a guess costs
  // us a DB round trip). Sized for machine traffic: a client that has just
  // connected exchanges once and then refreshes on a schedule measured in
  // minutes, so even several clients behind one NAT stay far under this. Set
  // too tight, a rejected refresh sends the client back through the whole
  // authorization flow, which is worse for everyone.
  oauthTokenPerIp: { bucket: 'oauth.token.ip', max: 60, windowSeconds: 60 },
  // OAuth authorization endpoint. Cheap for us to serve but each request can
  // trigger a CIMD metadata fetch to a third party, so it is metered before
  // the provider sees it. A human clicking Connect hits this a handful of
  // times an hour at most.
  oauthAuthorizePerIp: { bucket: 'oauth.authorize.ip', max: 30, windowSeconds: 600 },
  // Everything else under /api/oauth (jwks, revocation, discovery). Generous:
  // these are cacheable reads and revocations, not credential guesses.
  oauthOtherPerIp: { bucket: 'oauth.other.ip', max: 120, windowSeconds: 60 },
  // Consent approve/deny submissions, per organizer. Nobody approves more than
  // a few connections an hour; this stops a stolen session being used to mint
  // grants in bulk.
  oauthConsentPerOrganizer: { bucket: 'oauth.consent.org', max: 30, windowSeconds: 3600 },
  // Outbound CIMD metadata fetches, per client origin. An authorization
  // request names a client by URL and we fetch that URL, so an attacker can
  // make us hammer a third party (or burn our own egress) by inventing client
  // ids on one host. The library caches a document for at least five minutes
  // (see `cacheDuration` in src/oauth/provider.ts), so a real client needs a
  // handful of fetches an hour at most.
  oauthCimdPerOrigin: { bucket: 'oauth.cimd.origin', max: 30, windowSeconds: 3600 },
  // The MCP endpoint's unauthenticated face: every request costs a signature
  // check before any identity exists, and an unknown key id costs a signing-key
  // reload. Generous for a real client (one call per tool use), hostile to a
  // flood of forged tokens.
  mcpPerIp: { bucket: 'mcp.ip', max: 120, windowSeconds: 60 },
} as const;

/** Longest window any policy uses; rows older than this can never be read again. */
const LONGEST_WINDOW_SECONDS = Math.max(...Object.values(RateLimits).map((p) => p.windowSeconds));

/**
 * Delete counters whose window closed. Subjects are partly attacker-chosen
 * (client IPs, CIMD origins), so without this the table only ever grows.
 * Returns the number of rows removed.
 */
export async function sweepExpiredRateLimits(db: Db): Promise<number> {
  const cutoff = new Date(Date.now() - 2 * LONGEST_WINDOW_SECONDS * 1000);
  const rows = await db.delete(rateLimits).where(lt(rateLimits.windowStart, cutoff)).returning({ b: rateLimits.bucket });
  return rows.length;
}
