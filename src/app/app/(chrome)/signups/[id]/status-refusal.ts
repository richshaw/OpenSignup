import type { Translator } from '@/i18n/translator';
import type { ServiceError } from '@/lib/errors';

/**
 * What an organizer reads when Publish, Close signup or Reopen signup is
 * refused, by its code and `details.reason`, in place of the service's
 * message, which is written for developers ("cannot open a signup that is
 * closed", "your role cannot modify this workspace"), and in the organizer's
 * language. `status_changed` means another tab or person changed the status
 * since the page loaded, and `no_slots` that a signup to publish or reopen
 * has none. A viewer gets the line every organizer screen gives for
 * `forbidden`.
 */
export function statusRefusal(
  error: ServiceError,
  change: 'publish' | 'close' | 'reopen',
  t: { signup: Translator<'organizer.signup.refusal'>; errors: Translator<'organizer.errors'> },
): string {
  switch (error.code) {
    case 'forbidden':
      return t.errors('code.forbidden');
    case 'not_found':
      return t.signup('gone');
    case 'conflict':
      if (error.details?.reason === 'status_changed') return t.signup('changed');
      if (error.details?.reason === 'no_slots') {
        if (change === 'publish') return t.signup('addSlotToPublish');
        if (change === 'reopen') return t.signup('addSlotToReopen');
      }
      break;
  }
  switch (change) {
    case 'publish':
      return t.signup('publishFailed');
    case 'close':
      return t.signup('closeFailed');
    case 'reopen':
      return t.signup('reopenFailed');
  }
}
