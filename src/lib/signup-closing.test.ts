import { describe, expect, it } from 'vitest';
import { shownSignupStatus, signupShutReason, slotInLockout } from './signup-closing';

const NOW = Date.parse('2030-04-06T12:00:00Z');
const PAST = new Date(NOW - 60_000);
const FUTURE = new Date(NOW + 60_000);

describe('signupShutReason', () => {
  it('takes sign-ups while open with no closing time, or one still ahead', () => {
    expect(signupShutReason({ status: 'open', closesAt: null }, NOW)).toBeNull();
    expect(signupShutReason({ status: 'open', closesAt: FUTURE }, NOW)).toBeNull();
  });

  it('takes none once the closing time has passed, though the status is still open', () => {
    expect(signupShutReason({ status: 'open', closesAt: PAST }, NOW)).toBe('closes_at');
  });

  it('takes none in any status but open, whatever the closing time', () => {
    for (const status of ['draft', 'closed', 'archived'] as const) {
      expect(signupShutReason({ status, closesAt: null }, NOW)).toBe('status');
      expect(signupShutReason({ status, closesAt: FUTURE }, NOW)).toBe('status');
      expect(signupShutReason({ status, closesAt: PAST }, NOW)).toBe('status');
    }
  });
});

describe('shownSignupStatus', () => {
  it('shows an open signup past its closing time as closed', () => {
    expect(shownSignupStatus({ status: 'open', closesAt: PAST }, NOW)).toBe('closed');
  });

  it('shows every other signup as its status', () => {
    expect(shownSignupStatus({ status: 'open', closesAt: FUTURE }, NOW)).toBe('open');
    expect(shownSignupStatus({ status: 'open', closesAt: null }, NOW)).toBe('open');
    expect(shownSignupStatus({ status: 'closed', closesAt: FUTURE }, NOW)).toBe('closed');
    expect(shownSignupStatus({ status: 'archived', closesAt: PAST }, NOW)).toBe('archived');
  });
});

describe('slotInLockout', () => {
  const HOUR = 3600 * 1000;
  const LOCKOUT = { lockoutHoursBeforeSlot: 24 };

  it('is in the lockout once the slot starts within that many hours', () => {
    expect(slotInLockout(LOCKOUT, new Date(NOW + 2 * HOUR), NOW)).toBe(true);
    expect(slotInLockout(LOCKOUT, new Date(NOW - HOUR), NOW)).toBe(true);
  });

  it('is not in it while the slot is further away than that', () => {
    expect(slotInLockout(LOCKOUT, new Date(NOW + 25 * HOUR), NOW)).toBe(false);
  });

  it('never locks out with no lockout set, a zero lockout, or a slot with no date', () => {
    const soon = new Date(NOW + HOUR);
    expect(slotInLockout({}, soon, NOW)).toBe(false);
    expect(slotInLockout(null, soon, NOW)).toBe(false);
    expect(slotInLockout({ lockoutHoursBeforeSlot: 0 }, soon, NOW)).toBe(false);
    expect(slotInLockout({ lockoutHoursBeforeSlot: null }, soon, NOW)).toBe(false);
    expect(slotInLockout(LOCKOUT, null, NOW)).toBe(false);
  });
});
