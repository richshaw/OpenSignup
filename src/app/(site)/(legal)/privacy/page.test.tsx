// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOGIN_CODE_MAX_AGE_MS } from '@/auth/login-code-lifetime';
import { SLOT_CHANGE_SETTLE_MINUTES } from '@/lib/reminder-eligibility';
import { DAYS_AFTER_SLOT, MIN_DAYS } from '@/lib/returning-participant';
import { OAUTH_TTL } from '@/oauth/config';
import { INSTANCE_NAME } from '@/lib/site-config';

const DAY_SECONDS = 24 * 60 * 60;

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('@/lib/privacy-additions');
});

type Additions = {
  lastUpdated: string;
  sections: { heading: string; paragraphs: string[] }[];
} | null;

/**
 * The page, given an instance's additions. Mocks them rather than reading
 * src/lib/privacy-additions.ts, which a deployment fills in its own copy:
 * these tests must pass there too.
 */
async function loadPage(additions: Additions = null) {
  vi.resetModules();
  vi.doMock('@/lib/privacy-additions', () => ({ PRIVACY_ADDITIONS: additions }));
  return (await import('./page')).default;
}

async function pageText(additions: Additions = null): Promise<string> {
  const PrivacyPage = await loadPage(additions);
  const { container } = render(<PrivacyPage />);
  return (container.textContent ?? '').replace(/\s+/g, ' ');
}

describe('privacy page', () => {
  it('states how long the sign-in code lasts', async () => {
    expect(await pageText()).toContain(
      `For up to ${LOGIN_CODE_MAX_AGE_MS / 60_000} minutes, the six-digit code`,
    );
  });

  it('states how long a browser remembers a sign-up without an email', async () => {
    expect(DAYS_AFTER_SLOT).toBe(7); // the page says "a week"
    expect(await pageText()).toContain(
      `only that browser remembers it: for ${MIN_DAYS} days, or until a week after your slot`,
    );
  });

  it('states when a moved-slot email goes out', async () => {
    expect(await pageText()).toContain(
      `a moved-slot email about ${SLOT_CHANGE_SETTLE_MINUTES} minutes after`,
    );
  });

  it('states how long an access token and an approval last', async () => {
    expect(await pageText()).toContain(
      `which is at most ${OAUTH_TTL.ACCESS_TOKEN / 60} minutes. No approval survives longer than ${OAUTH_TTL.GRANT_MAX / DAY_SECONDS} days`,
    );
  });
});

describe("an instance's additions", () => {
  const additions = {
    lastUpdated: '2026-12-01',
    sections: [
      {
        heading: 'Check-in emails',
        paragraphs: [
          'A few days after you make your first signup, we may email you once to ask how it went.',
          'We keep a record that we sent it for as long as your account exists.',
        ],
      },
    ],
  };

  it('changes nothing on a site that adds nothing', async () => {
    const text = await pageText();
    expect(text).toContain('Last updated: 15 November 2026');
    expect(text).toContain(`${INSTANCE_NAME} sends four kinds of email:`);
    expect(text).toContain(`${INSTANCE_NAME} sends no marketing email.`);
    expect(text).not.toContain('Added on this site');
  });

  it('shows each section under its heading, after what the software does', async () => {
    const PrivacyPage = await loadPage(additions);
    render(<PrivacyPage />);
    const headings = screen.getAllByRole('heading').map((h) => h.textContent);
    const added = headings.indexOf('Added on this site');
    expect(added).toBeGreaterThan(headings.indexOf('Third parties'));
    expect(headings[added + 1]).toBe('Check-in emails');
    expect(headings[added + 2]).toBe('Why we use your data');
    expect(screen.getByRole('heading', { level: 3, name: 'Check-in emails' })).toBeInTheDocument();
    for (const paragraph of additions.sections[0]!.paragraphs) {
      expect(screen.getByText(paragraph)).toBeInTheDocument();
    }
  });

  it('points to them wherever the page would otherwise read as the whole story', async () => {
    const text = await pageText(additions);
    expect(text).toContain(
      "This site also does some things OpenSignup doesn't do on its own. They're described under “Added on this site” below, and they add to everything else on this page.",
    );
    expect(text).toContain('OpenSignup, the software this site runs, sends four kinds of email:');
    expect(text).toContain(
      'OpenSignup itself sends no marketing email. Anything else this site sends is described under “Added on this site” below.',
    );
    expect(text).not.toContain(`${INSTANCE_NAME} sends four kinds of email`);
    expect(text).toContain(
      'For what “Added on this site” above describes: the reasons given there.',
    );
    expect(text).toContain('What “Added on this site” above describes: as long as it says there.');
  });

  it('dates the page by whichever changed last', async () => {
    expect(await pageText(additions)).toContain('Last updated: 1 December 2026');
    expect(await pageText({ ...additions, lastUpdated: '2026-01-05' })).toContain(
      'Last updated: 15 November 2026',
    );
  });

  it.each(['2026-02-30', '1/12/2026', ''])(
    'refuses %j as a date, so the build fails',
    async (lastUpdated) => {
      const PrivacyPage = await loadPage({ ...additions, lastUpdated });
      expect(() => PrivacyPage()).toThrow('must be a real day written YYYY-MM-DD');
    },
  );
});
