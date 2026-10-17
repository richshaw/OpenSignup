interface ClosingSignup {
  /** One of `SIGNUP_STATUSES`; the column is plain text. */
  status: string;
  closesAt: Date | null;
}

/**
 * Why a signup as a whole takes no sign-ups, or null while it does: its status
 * is anything but `open` (`'status'`), or its `closesAt` has passed
 * (`'closes_at'`). The signup-level half of `whyNotTakingPlaces`, which the
 * service refuses a place by, and of what `/s/[slug]` shows
 * (`shownSignupStatus`), so the page and the service can't disagree.
 *
 * Passing the closing time leaves the stored status `open`: reminders keep
 * going for a closed signup, and the organizer's status changes expect it.
 */
export function signupShutReason(
  signup: ClosingSignup,
  now: number = Date.now(),
): 'status' | 'closes_at' | null {
  if (signup.status !== 'open') return 'status';
  if (signup.closesAt && signup.closesAt.getTime() < now) return 'closes_at';
  return null;
}

/** The status the public page shows: an open signup past its closing time is closed. */
export function shownSignupStatus(signup: ClosingSignup, now: number = Date.now()): string {
  return signupShutReason(signup, now) === 'closes_at' ? 'closed' : signup.status;
}
