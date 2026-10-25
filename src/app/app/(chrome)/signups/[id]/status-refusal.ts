import type { ServiceError } from '@/lib/errors';

/**
 * What an organizer reads when Publish or Close signup is refused, in place of
 * the service's message, which is written for developers ("cannot open a
 * signup that is closed", "your role cannot modify this workspace"). A
 * `conflict` on the status means another tab or person changed it since the
 * page loaded; the only other conflict is publishing a signup with no slots.
 */
export function statusRefusal(error: ServiceError, change: 'publish' | 'close'): string {
  switch (error.code) {
    case 'forbidden':
      return 'You don’t have edit access.';
    case 'not_found':
      return 'This signup is no longer available.';
    case 'conflict':
      if (error.field === 'status') {
        return 'This signup changed since the page loaded. Reload to see the latest.';
      }
      if (change === 'publish') return 'Add a slot before publishing.';
      break;
  }
  return change === 'publish'
    ? 'Couldn’t publish. Try again.'
    : 'Couldn’t close the signup. Try again.';
}
