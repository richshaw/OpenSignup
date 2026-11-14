import type { Translator } from '@/i18n/translator';
import { capacityMessage, type CapacityContext } from './capacity-message';
import { closedMessage } from './closed-message';
import { conflictMessage } from './conflict-message';
import { goneMessage } from './gone-message';
import { nameMessage } from './name-message';
import { rateLimitMessage } from './rate-limit-message';

export interface ParticipantErrorCopy {
  message: string;
  suggestion?: string;
}

interface ApiErrorLike {
  code?: string;
  field?: string;
  details?: {
    remaining?: unknown;
    requested?: unknown;
    alternatives?: unknown;
    retryAfterSeconds?: unknown;
  };
}

/**
 * Participant-facing copy for an error from signing up (`'join'`) or from
 * changing or cancelling a sign-up (`'change'`), or null when there is none and
 * the caller shows the server's own text. A capacity error is built from its
 * numbers, and a slot or signup closed or removed meanwhile, and a blank or
 * overlong name, each get their own copy.
 * Signing up also rephrases a second sign-up by the same email and the rate
 * limit, which the edit page has never reworded.
 *
 * The copy comes from `participant.errors` through `t`: the sign-up dialog and
 * the edit page get it from `useTranslations`, in the signup's language.
 */
export function participantErrorCopy(
  error: ApiErrorLike | null | undefined,
  context: CapacityContext,
  t: Translator<'participant.errors'>,
): ParticipantErrorCopy | null {
  const shared =
    capacityMessage(error, context, t) ??
    closedMessage(error, context, t) ??
    goneMessage(error, t) ??
    nameMessage(error, t);
  if (shared || context === 'change') return shared;
  return conflictMessage(error, t) ?? rateLimitMessage(error, t);
}

/** The copy as one line of text, for a form that shows a single message. */
export function errorCopyText(copy: ParticipantErrorCopy): string {
  return [copy.message, copy.suggestion].filter(Boolean).join(' ');
}
