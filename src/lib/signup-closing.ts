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

/**
 * Whether a slot is inside the signup's `lockoutHoursBeforeSlot`: it starts
 * within that many hours, so it takes no more sign-ups. The slot-level half of
 * `whyNotTakingPlaces` that the public page shares (`toSignupViewSlots`), so
 * the page shows Closed where the service would refuse. Counted back from
 * `slot_at`, so a date-only slot is measured from its noon-UTC anchor rather
 * than from midnight (see `extractSlotAt`). No UI sets the lockout today; the
 * API and the MCP `update_signup` tool do.
 */
export function slotInLockout(
  settings: unknown,
  slotAt: Date | null,
  now: number = Date.now(),
): boolean {
  const cutoff = lockoutCutoff(settings, now);
  if (!slotAt || !cutoff) return false;
  return slotAt.getTime() < cutoff.getTime();
}

/**
 * The earliest slot instant still outside the signup's lockout, or null when
 * it has none: a slot is in the lockout (`slotInLockout`) when it starts
 * before this. For a query that must leave locked-out slots out in SQL, such
 * as the alternatives a full slot's refusal offers.
 */
export function lockoutCutoff(settings: unknown, now: number = Date.now()): Date | null {
  const hours =
    (settings as { lockoutHoursBeforeSlot?: number | null } | null)?.lockoutHoursBeforeSlot ?? 0;
  if (hours <= 0) return null;
  return new Date(now + hours * 3600 * 1000);
}
