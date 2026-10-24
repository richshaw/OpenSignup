import type { SignupStatus } from '@/schemas/signups';

/**
 * Whether a phone shows the bar at the bottom of the screen: a draft's
 * Publish and share, or an open signup's count and Share. A closed or
 * archived signup has nothing to put there.
 */
export function hasPhoneBar(status: SignupStatus): boolean {
  return status === 'draft' || status === 'open';
}

/**
 * Room at the bottom of the page for the bar, on phones only, so the end of
 * the page scrolls clear of it: the bar's 3rem button with 0.75rem above and
 * below, its 1px top border, and the home indicator's inset where the phone
 * has one.
 */
export const PHONE_BAR_ROOM = 'max-md:pb-[calc(4.5rem+1px+env(safe-area-inset-bottom))]';
