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
 * the page scrolls clear of it: the bar's height as `PhoneBar` measures it
 * (taller while a refusal shows), or until then its usual height (a 3rem
 * button, 0.75rem above and below and a 1px top border) and the home
 * indicator's inset.
 */
export const PHONE_BAR_ROOM =
  'max-md:pb-[var(--phone-bar-h,calc(4.5rem+1px+env(safe-area-inset-bottom)))]';
