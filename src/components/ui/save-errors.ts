import type { ErrorCode } from '@/lib/errors';

/**
 * What an organizer reads when a save is refused, by error code, where the
 * screen has no words of its own for the refusal. The service's own message
 * is written for developers ("your role cannot modify this workspace"), so
 * no screen shows it.
 *
 * The same lines are `organizer.errors.code` in the catalog, which the pages
 * rendered on the server and the Build tab read, in the organizer's language.
 * This copy is for the screens that don't read the catalog yet (Magic
 * Compose, and the header's and Remove's refusals), and a test keeps the two
 * equal.
 * A module of its own, with no React in it, so Magic Compose loads only
 * these lines.
 */
export const SAVE_ERROR_MESSAGE: Record<ErrorCode, string> = {
  forbidden: 'You don’t have edit access.',
  unauthorized: 'Sign in again to save.',
  conflict: 'Reload to see the latest changes.',
  capacity_full: 'Slot is full.',
  closed: 'This signup is closed.',
  not_found: 'No longer available.',
  invalid_input: 'Some values weren’t accepted.',
  rate_limited: 'Slow down — try again in a moment.',
  already_consumed: 'Already used.',
  internal: 'Save failed.',
};
