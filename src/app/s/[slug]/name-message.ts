import type { Translator } from '@/i18n/translator';
import { NAME_MAX_LENGTH } from '@/lib/participant-limits';

/**
 * Participant-facing copy for an `invalid_input` on `name`, from signing up or
 * from the edit page: the name was blank once trimmed, or longer than
 * `NameSchema` allows. The server's text ("name is required", "Check the value
 * of \"name\".") is written for API callers, not participants.
 *
 * Null for anything else.
 */
export function nameMessage(
  error: { code?: string; field?: string } | null | undefined,
  t: Translator<'participant.errors'>,
): { message: string } | null {
  return error?.code === 'invalid_input' && error.field === 'name'
    ? { message: t('name', { max: NAME_MAX_LENGTH }) }
    : null;
}
