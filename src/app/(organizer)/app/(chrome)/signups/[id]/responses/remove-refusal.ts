import type { Translator } from '@/i18n/translator';
import type { ErrorCode } from '@/lib/errors';
import { refusalText } from '@/lib/organizer-errors';

/**
 * What an organizer reads when Remove is refused, by the error's code, in
 * place of the service's message, which is written for developers ("commitment
 * not found"), and in the organizer's language: the Responses tab's own
 * lines, through `refusalText`. `not_found` means the sign-up is gone: its
 * slot or the signup was deleted since the page loaded. A sign-up already
 * cancelled is not refused, since removing it changes nothing.
 */
export function removeRefusal(
  code: ErrorCode,
  t: { responses: Translator<'organizer.responses'>; errors: Translator<'organizer.errors'> },
): string {
  return refusalText(
    t.errors,
    { code },
    {
      not_found: t.responses('remove.refusal.notFound'),
      other: t.responses('remove.refusal.failed'),
    },
  );
}
