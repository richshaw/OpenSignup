import type { Translator } from '@/i18n/translator';
import { isErrorCode, type ServiceError } from './errors';
import { TITLE_MIN_LENGTH } from './signup-limits';

/**
 * What an organizer page rendered on the server says for a refusal, in the
 * translator's language: its own words for a reason it knows, else the line
 * for the error's code. Never the service's `message`, which is English for
 * API callers ("your role cannot modify this workspace").
 */
export function refusalText(
  t: Translator<'organizer.errors'>,
  error: Pick<ServiceError, 'code' | 'details'>,
): string {
  switch (error.details?.reason) {
    case 'title_too_short':
      return t('titleTooShort', { min: TITLE_MIN_LENGTH });
    default:
      return t(`code.${error.code}`);
  }
}

/**
 * The line for the error code a page's `?error=` carries, which a server
 * action put there after a refusal, or null for anything that isn't a code,
 * so a link can't put words of its own on the page.
 */
export function refusalFromQuery(
  t: Translator<'organizer.errors'>,
  error: string | undefined,
): string | null {
  return isErrorCode(error) ? t(`code.${error}`) : null;
}
