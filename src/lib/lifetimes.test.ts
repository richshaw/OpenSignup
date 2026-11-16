import { describe, expect, it } from 'vitest';
import { CATALOG_LOCALES } from '@/i18n/config';
import { OAUTH_TTL } from '@/oauth/config';
import { formatDuration } from './format-duration';
import {
  ACCESS_TOKEN_LIFETIME,
  CONNECTION_IDLE_LIMIT,
  GRANT_LIFETIME,
  SLOT_CHANGE_DELAY,
  accessTokenLifetime,
} from './lifetimes';

// The legal pages, the help articles and the connected-apps page all print
// these. Pinning today's words means a change to the rule (or to a constant)
// shows up here first, rather than as a quiet change in public copy.
describe('shared lifetimes', () => {
  it('says how long an access token outlives a disconnect', () => {
    expect(ACCESS_TOKEN_LIFETIME).toBe('15 minutes');
  });

  // The connected-apps page says it in the organizer's language.
  it.each(CATALOG_LOCALES)('says the same in %s', (locale) => {
    expect(accessTokenLifetime(locale)).toBe(formatDuration(OAUTH_TTL.ACCESS_TOKEN / 60, locale));
  });

  it('says it in English as the constant does', () => {
    expect(accessTokenLifetime('en')).toBe(ACCESS_TOKEN_LIFETIME);
  });

  it('says how long after the last move a moved-slot email goes out', () => {
    expect(SLOT_CHANGE_DELAY).toBe('10 minutes');
  });

  it('says how long a connection lasts, and how long it can sit unused', () => {
    expect(GRANT_LIFETIME).toBe('90 days');
    expect(CONNECTION_IDLE_LIMIT).toBe('30 days');
  });
});
