/**
 * OAuth scopes an AI client can hold. Kept deliberately tiny; each one's
 * description is shown on the consent screen and on Connected apps, in the
 * organizer's language, so it is written for an organizer, not for us.
 *
 * `commitments:read` unlocks participant names and email addresses — data a
 * participant gave to the organizer, not to us, and never to an AI vendor.
 * It is *not advertised* in the protected-resource metadata (see
 * `ADVERTISED_SCOPES`): real clients request every scope the metadata lists,
 * so advertising it would put it in the very first authorization request. A
 * client that needs it gets a 403 `insufficient_scope` challenge naming the
 * scope and steps up through a second, explicit consent.
 */
export const ALL_SCOPES = [
  'signups:read',
  'signups:write',
  'commitments:read',
  'offline_access',
] as const;

export type Scope = (typeof ALL_SCOPES)[number];

/** Resource scopes, i.e. everything except the refresh-token marker. */
export const RESOURCE_SCOPES = ['signups:read', 'signups:write', 'commitments:read'] as const;

/** What the protected-resource metadata lists as `scopes_supported`. */
export const ADVERTISED_SCOPES = ['signups:read', 'signups:write'] as const;

/**
 * Each scope's description, as its key in the catalog's `auth.scopes`: what
 * the scope lets an app do. The consent screen and Connected apps show it in
 * the organizer's language.
 */
export const SCOPE_MESSAGES = {
  'signups:read': 'signupsRead',
  'signups:write': 'signupsWrite',
  'commitments:read': 'commitmentsRead',
  offline_access: 'offlineAccess',
} as const satisfies Record<Scope, string>;

/** A scope's description, as a key in `auth.scopes`. */
type ScopeMessage = (typeof SCOPE_MESSAGES)[Scope];

const SCOPE_SET: ReadonlySet<string> = new Set(ALL_SCOPES);

export function isScope(value: string): value is Scope {
  return SCOPE_SET.has(value);
}

/** Parse an RFC 6749 space-delimited scope string; unknown values are dropped. */
export function parseScopeString(raw: string | undefined | null): Scope[] {
  if (!raw) return [];
  const out: Scope[] = [];
  for (const part of raw.split(/\s+/)) {
    if (part && isScope(part) && !out.includes(part)) out.push(part);
  }
  return out;
}

export interface ScopeDescription {
  scope: Scope;
  /** What it lets the app do, as a key in `auth.scopes`. */
  message: ScopeMessage;
  /** True for scopes that expose participant contact details. */
  sensitive: boolean;
}

/**
 * Consent-screen rows. Sensitive scopes sort last so the organizer reads the
 * routine grants first and the participant-data line stands on its own, and
 * `offline_access` is omitted because "stay connected" is implied by the
 * screen itself and would only dilute the list.
 */
export function describeScopes(scopes: readonly Scope[]): ScopeDescription[] {
  const order: readonly Scope[] = RESOURCE_SCOPES;
  return order
    .filter((s) => scopes.includes(s))
    .map((scope) => ({
      scope,
      message: SCOPE_MESSAGES[scope],
      sensitive: scope === 'commitments:read',
    }));
}
