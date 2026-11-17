import type { Translator } from '@/i18n/translator';
import type { ErrorReason } from '@/lib/errors';
import { NAME_MAX_LENGTH, NOTES_MAX_LENGTH, QUANTITY_MAX } from '@/lib/participant-limits';

/**
 * Participant-facing copy for an `invalid_input` from signing up or from the
 * edit page, chosen by its `details.reason` (see `ErrorReason`). The server's
 * text ("Email is required for this signup.", Zod's "Invalid email", "Check
 * the value of \"name\".") is written for API callers, in English, so it is
 * never shown.
 *
 * A reason this doesn't know, or none (a body too large, an input the forms
 * never send), gets the code's own line, which says only to check the form.
 *
 * Null for any other error.
 */
export function inputMessage(
  error: { code?: string; details?: { reason?: unknown } } | null | undefined,
  t: Translator<'participant.errors'>,
): { message: string; suggestion?: string } | null {
  if (error?.code !== 'invalid_input') return null;
  // From the server's JSON, so any string; a reason outside the set falls
  // through to the code's line.
  switch (error.details?.reason as ErrorReason | undefined) {
    // The box was optional when the page loaded, and the organizer has asked
    // for an email since (the dialog then marks the box required).
    case 'email_required':
      return { message: t('email.required'), suggestion: t('email.addIt') };
    case 'email_invalid':
      return { message: t('email.invalid'), suggestion: t('email.check') };
    case 'name_required':
    case 'name_too_long':
      return { message: t('name', { max: NAME_MAX_LENGTH }) };
    case 'notes_too_long':
      return { message: t('notes', { max: NOTES_MAX_LENGTH }) };
    case 'quantity_too_small':
    case 'quantity_too_large':
    case 'quantity_not_whole':
      return { message: t('quantity', { max: QUANTITY_MAX }) };
    default:
      return { message: t('input') };
  }
}
