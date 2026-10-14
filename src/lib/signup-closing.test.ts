import { describe, expect, it } from 'vitest';
import { shownSignupStatus, signupShutReason } from './signup-closing';

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
