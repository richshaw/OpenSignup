import { SAVE_ERROR_MESSAGE } from '@/components/ui/save-errors';
import type { ServiceError } from '@/lib/errors';

/**
 * What an organizer reads when Publish, Close signup or Reopen signup is
 * refused, by its code and `details.reason`, in place of the service's
 * message, which is written for developers ("cannot open a signup that is
 * closed", "your role cannot modify this workspace"). `status_changed` means
 * another tab or person changed the status since the page loaded, and
 * `no_slots` that a signup to publish or reopen has none.
 */
export function statusRefusal(error: ServiceError, change: 'publish' | 'close' | 'reopen'): string {
  switch (error.code) {
    case 'forbidden':
      return SAVE_ERROR_MESSAGE.forbidden;
    case 'not_found':
      return 'This signup is no longer available.';
    case 'conflict':
      if (error.details?.reason === 'status_changed') {
        return 'This signup changed since the page loaded. Reload to see the latest.';
      }
      if (error.details?.reason === 'no_slots') {
        if (change === 'publish') return 'Add a slot before publishing.';
        if (change === 'reopen') return 'Add a slot before reopening.';
      }
      break;
  }
  switch (change) {
    case 'publish':
      return 'Couldn’t publish. Try again.';
    case 'close':
      return 'Couldn’t close the signup. Try again.';
    case 'reopen':
      return 'Couldn’t reopen the signup. Try again.';
  }
}
