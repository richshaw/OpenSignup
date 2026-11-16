import type { Translator } from '@/i18n/translator';
import type { ErrorCode } from '@/lib/errors';

/**
 * What an organizer reads when Remove is refused, by the error's code, in
 * place of the service's message, which is written for developers ("commitment
 * not found", "your role cannot modify this workspace"). In the translators'
 * language: the organizer's. `not_found` means the sign-up is gone: its slot
 * or the signup was deleted since the page loaded. A sign-up already
 * cancelled is not refused, since removing it changes nothing. A viewer gets
 * the line every organizer screen gives for `forbidden`.
 */
export function removeRefusal(
  code: ErrorCode,
  t: { responses: Translator<'organizer.responses'>; errors: Translator<'organizer.errors'> },
): string {
  switch (code) {
    case 'not_found':
      return t.responses('remove.refusal.notFound');
    case 'forbidden':
      return t.errors('code.forbidden');
    default:
      return t.responses('remove.refusal.failed');
  }
}
