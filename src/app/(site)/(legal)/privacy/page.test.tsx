// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LOGIN_CODE_MAX_AGE_MS } from '@/auth/login-code-lifetime';
import { SLOT_CHANGE_SETTLE_MINUTES } from '@/lib/reminder-eligibility';
import { DAYS_AFTER_SLOT, MIN_DAYS } from '@/lib/returning-participant';
import { OAUTH_TTL } from '@/oauth/config';
import PrivacyPage from './page';

const DAY_SECONDS = 24 * 60 * 60;

function pageText(): string {
  const { container } = render(<PrivacyPage />);
  return (container.textContent ?? '').replace(/\s+/g, ' ');
}

describe('privacy page', () => {
  it('states how long the sign-in code lasts', () => {
    expect(pageText()).toContain(
      `For up to ${LOGIN_CODE_MAX_AGE_MS / 60_000} minutes, the six-digit code`,
    );
  });

  it('states how long a browser remembers a sign-up without an email', () => {
    expect(DAYS_AFTER_SLOT).toBe(7); // the page says "a week"
    expect(pageText()).toContain(
      `only that browser remembers it: for ${MIN_DAYS} days, or until a week after your slot`,
    );
  });

  it('states when a moved-slot email goes out', () => {
    expect(pageText()).toContain(
      `a moved-slot email about ${SLOT_CHANGE_SETTLE_MINUTES} minutes after`,
    );
  });

  it('states how long an access token and an approval last', () => {
    expect(pageText()).toContain(
      `which is at most ${OAUTH_TTL.ACCESS_TOKEN / 60} minutes. No approval survives longer than ${OAUTH_TTL.GRANT_MAX / DAY_SECONDS} days`,
    );
  });
});
