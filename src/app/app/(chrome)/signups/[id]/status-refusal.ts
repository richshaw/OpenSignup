import { SAVE_ERROR_MESSAGE } from '@/components/ui/save-notice';
import type { Translator } from '@/i18n/translator';
import type { ServiceError } from '@/lib/errors';

/**
 * What an organizer reads when Publish, Close signup or Reopen signup is
 * refused, in place of the service's message, which is written for
 * developers ("cannot open a signup that is closed", "your role cannot
 * modify this workspace"), and in the organizer's language. A `conflict` on
 * the status means another tab or person changed it since the page loaded;
 * the only other conflict is publishing or reopening a signup with no slots.
 * A viewer's refusal is the line every save shows for its code, which isn't
 * in the catalog yet (#939).
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
      if (error.field === 'status') return t('changed');
      if (change === 'publish') return t('addSlotToPublish');
      if (change === 'reopen' && error.field === 'slots') return t('addSlotToReopen');
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
