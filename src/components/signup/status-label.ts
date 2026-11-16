import type { Translator } from '@/i18n/translator';
import type { SignupStatus } from '@/schemas/signups';

/**
 * Each status's message, by a literal key, so the catalog check sees every
 * one of them in use. Today's English is the stored word itself ("open").
 */
const STATUS_KEY = {
  draft: 'draft',
  open: 'open',
  closed: 'closed',
  archived: 'archived',
} as const satisfies Record<SignupStatus, string>;

/** A signup's status as its pill shows it, in the organizer's language. */
export function signupStatusLabel(status: SignupStatus, t: Translator<'organizer.status'>): string {
  return t(STATUS_KEY[status]);
}
