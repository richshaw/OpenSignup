import type { Translator } from '@/i18n/translator';
import type { ServiceError } from '@/lib/errors';
import { refusalText } from '@/lib/organizer-errors';

/**
 * What an organizer reads when Publish, Close signup or Reopen signup is
 * refused, in place of the service's message, which is written for
 * developers ("cannot open a signup that is closed"), and in the organizer's
 * language: the header's own lines, through `refusalText`. `status_changed`
 * means another tab or person changed the status since the page loaded, and
 * `no_slots` that a signup to publish or reopen has none.
 */
export function statusRefusal(
  error: ServiceError,
  change: 'publish' | 'close' | 'reopen',
  t: { signup: Translator<'organizer.signup.refusal'>; errors: Translator<'organizer.errors'> },
): string {
  return refusalText(t.errors, error, {
    status_changed: t.signup('changed'),
    ...(change === 'close'
      ? {}
      : { no_slots: t.signup(change === 'publish' ? 'addSlotToPublish' : 'addSlotToReopen') }),
    not_found: t.signup('gone'),
    other: t.signup(`${change}Failed`),
  });
}
