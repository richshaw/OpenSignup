// Server only: `errors.ts` imports zod, which no client bundle carries, so a
// client component must not import this. The Build tab and Magic Compose word
// their refusals in `saveErrorMessage` and `explainDraftFailure`.
import type { Translator } from '@/i18n/translator';
import { isErrorCode, type ErrorCode, type ErrorReason, type ServiceError } from './errors';
import { TITLE_MIN_LENGTH } from './signup-limits';

/**
 * A screen's own lines for a refusal: each under the `details.reason` or the
 * code it words, and `other` for any refusal it has no line for. None for
 * `forbidden`, which reads the same on every screen.
 */
export type OwnLines = Partial<
  Record<ErrorReason | Exclude<ErrorCode, 'forbidden'> | 'other', string>
>;

/**
 * What an organizer page rendered on the server says for a refusal, in the
 * translator's language. A viewer's refusal (`forbidden`) reads the same on
 * every screen: the line for its code. Any other, the first of:
 *
 * 1. the screen's line for the reason;
 * 2. the line every screen gives that reason (`title_too_short`);
 * 3. the screen's line for the code;
 * 4. the screen's `other`;
 * 5. the line for the code.
 *
 * Never the service's `message`, which is English for API callers ("your
 * role cannot modify this workspace").
 */
export function refusalText(
  t: Translator<'organizer.errors'>,
  error: Pick<ServiceError, 'code' | 'details'>,
  own: OwnLines = {},
): string {
  if (error.code === 'forbidden') return t('code.forbidden');
  const reason = error.details?.reason;
  return (
    ownLine(own, reason) ??
    (reason === 'title_too_short' ? t('titleTooShort', { min: TITLE_MIN_LENGTH }) : undefined) ??
    own[error.code] ??
    own.other ??
    t(`code.${error.code}`)
  );
}

/**
 * The same, for the error code a page's `?error=` carries, which a server
 * action put there after a refusal. Null for anything that isn't a code, so
 * a link can't put words of its own on the page.
 */
export function refusalFromQuery(
  t: Translator<'organizer.errors'>,
  error: string | undefined,
  own: OwnLines = {},
): string | null {
  return isErrorCode(error) ? refusalText(t, { code: error }, own) : null;
}

/** The screen's line for `reason`, if it is one of `own`'s keys (not `toString` or the like). */
function ownLine(own: OwnLines, reason: ErrorReason | undefined): string | undefined {
  return reason !== undefined && Object.hasOwn(own, reason) ? own[reason] : undefined;
}
