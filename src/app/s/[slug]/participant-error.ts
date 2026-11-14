import type { Translator } from '@/i18n/translator';
import { capacityMessage } from './capacity-message';
import { closedMessage } from './closed-message';
import { conflictMessage } from './conflict-message';
import { goneMessage } from './gone-message';
import { inputMessage } from './input-message';
import { rateLimitMessage } from './rate-limit-message';

export interface ParticipantErrorCopy {
  message: string;
  suggestion?: string;
}

/**
 * What the participant was doing: signing up in the sign-up dialog, or saving
 * or cancelling on the edit page.
 */
export type ErrorContext = 'join' | 'save' | 'cancel';

/**
 * An error as the API sends it, less its `message` and `suggestion`: those are
 * English, for API callers, and nothing here shows them.
 */
interface ApiErrorLike {
  code?: string;
  details?: {
    reason?: unknown;
    remaining?: unknown;
    requested?: unknown;
    alternatives?: unknown;
    retryAfterSeconds?: unknown;
  };
}

/**
 * Participant-facing copy for an error from signing up or from saving or
 * cancelling a sign-up, picked by its `code` and, for `invalid_input`, its
 * `details.reason`, and never taken from the server's text. A capacity error
 * is built from its numbers; a slot or signup closed or removed meanwhile, a
 * refused input, the rate limit, a second sign-up by the same email and a
 * sign-up the edit page can no longer change each get their own copy.
 * Anything else, no error at all (an answer that wasn't the API's JSON)
 * included, says the sign-up, save or cancel didn't happen, to try again.
 *
 * The copy comes from `participant.errors` through `t`: the sign-up dialog and
 * the edit page get it from `useTranslations`, in the signup's language.
 */
export function participantErrorCopy(
  error: ApiErrorLike | null | undefined,
  context: ErrorContext,
  t: Translator<'participant.errors'>,
): ParticipantErrorCopy {
  const page = context === 'join' ? 'join' : 'change';
  return (
    capacityMessage(error, page, t) ??
    closedMessage(error, page, t) ??
    goneMessage(error, t) ??
    inputMessage(error, t) ??
    rateLimitMessage(error, t) ??
    conflictMessage(error, page, t) ?? {
      message: t(`failed.${context}`),
      suggestion: t('failed.tryAgain'),
    }
  );
}

/** The copy as one line of text, for a form that shows a single message. */
export function errorCopyText(copy: ParticipantErrorCopy): string {
  return [copy.message, copy.suggestion].filter(Boolean).join(' ');
}
