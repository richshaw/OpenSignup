import { SAVE_ERROR_MESSAGE } from '@/components/ui/save-errors';
import type { Translator } from '@/i18n/translator';
import type { ServiceError } from '@/lib/errors';

/**
 * What an organizer reads when Publish, Close signup or Reopen signup is
 * refused, by its code and `details.reason`, in place of the service's
 * message, which is written for developers ("cannot open a signup that is
 * closed", "your role cannot modify this workspace"), and in the organizer's
 * language. `status_changed` means another tab or person changed the status
 * since the page loaded, and `no_slots` that a signup to publish or reopen
 * has none. A viewer's refusal is still the English line every save shows
 * for its code (join seam: it should read `organizer.errors.code.forbidden`).
 */
export function statusRefusal(
  error: ServiceError,
  change: 'publish' | 'close' | 'reopen',
  t: Translator<'organizer.signup.refusal'>,
): string {
  switch (error.code) {
    case 'forbidden':
      return SAVE_ERROR_MESSAGE.forbidden;
    case 'not_found':
      return t('gone');
    case 'conflict':
      if (error.details?.reason === 'status_changed') return t('changed');
      if (error.details?.reason === 'no_slots') {
        if (change === 'publish') return t('addSlotToPublish');
        if (change === 'reopen') return t('addSlotToReopen');
      }
      break;
  }
  switch (change) {
    case 'publish':
      return t('publishFailed');
    case 'close':
      return t('closeFailed');
    case 'reopen':
      return t('reopenFailed');
  }
}
