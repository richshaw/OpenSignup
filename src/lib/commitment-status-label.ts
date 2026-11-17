import type { Translator } from '@/i18n/translator';

/**
 * Each status an organizer can read for a sign-up (`shownCommitmentStatus`),
 * by a literal key, so the catalog check sees every one of them in use.
 * Today's English is the stored word itself ("confirmed", "no_show").
 */
const STATUS_KEY = {
  confirmed: 'status.confirmed',
  tentative: 'status.tentative',
  waitlist: 'status.waitlist',
  cancelled: 'status.cancelled',
  no_show: 'status.noShow',
  removed: 'status.removed',
  moved: 'status.moved',
} as const;

function isKnownStatus(status: string): status is keyof typeof STATUS_KEY {
  return Object.hasOwn(STATUS_KEY, status);
}

/**
 * A sign-up's status as the Responses tab's pill and its CSV say it, in the
 * translator's language. A status with no message, which nothing writes,
 * stays the stored word.
 */
export function commitmentStatusLabel(
  status: string,
  t: Translator<'organizer.responses'>,
): string {
  return isKnownStatus(status) ? t(STATUS_KEY[status]) : status;
}
