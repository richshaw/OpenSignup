// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOGIN_CODE_MAX_AGE_MS } from '@/auth/login-code-lifetime';
import { SLOT_CHANGE_SETTLE_MINUTES } from '@/lib/reminder-eligibility';
import { DAYS_AFTER_SLOT, MIN_DAYS } from '@/lib/returning-participant';
import { OAUTH_TTL } from '@/oauth/config';
import { INSTANCE_NAME } from '@/lib/site-config';
import type { PrivacyAdditions } from '@/lib/privacy-additions';

const DAY_SECONDS = 24 * 60 * 60;

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('@/lib/privacy-additions');
});

/**
 * The page, given an instance's additions. Mocks them rather than reading
 * src/lib/privacy-additions.ts, which a deployment fills in its own copy:
 * these tests must pass there too.
 */
async function loadPage(additions: PrivacyAdditions | null = null) {
  vi.resetModules();
  vi.doMock('@/lib/privacy-additions', () => ({ PRIVACY_ADDITIONS: additions }));
  return (await import('./page')).default;
}

async function pageText(additions: PrivacyAdditions | null = null): Promise<string> {
  const PrivacyPage = await loadPage(additions);
  const { container } = render(<PrivacyPage />);
  return (container.textContent ?? '').replace(/\s+/g, ' ');
}

/** The "Last updated" line a page's text shows. */
const lastUpdated = (text: string) => /Last updated: \d{1,2} \w+ \d{4}/.exec(text)?.[0];

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
  const additions: PrivacyAdditions = {
    lastUpdated: '2999-01-01',
    sections: [
      {
        heading: 'Check-in emails',
        paragraphs: [
          'A few days after you make your first signup, we may email you once to ask how it went.',
          'We keep a record that we sent it for as long as your account exists.',
        ],
        why: 'To ask a new organizer how their first signup went. (Our legitimate interest in helping organizers.)',
        kept: 'Records of check-in emails: for as long as the account exists.',
      },
    ],
  };

  it('changes nothing on a site that adds nothing', async () => {
    const text = await pageText();
    expect(text).toContain(`${INSTANCE_NAME} sends four kinds of email:`);
    expect(text).toContain(`${INSTANCE_NAME} sends no marketing email.`);
    expect(text).not.toContain('Added on this site');
    expect(text).not.toContain('OpenSignup software');
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
    for (const paragraph of additions.sections[0].paragraphs) {
      expect(screen.getByText(paragraph)).toBeInTheDocument();
    }
  });

  it("lists each section's reason and retention with the page's own", async () => {
    const PrivacyPage = await loadPage(additions);
    render(<PrivacyPage />);
    const listUnder = (heading: string) =>
      within(screen.getByRole('heading', { level: 2, name: heading }).parentElement!).getByRole(
        'list',
      );
    expect(
      within(listUnder('Why we use your data')).getByText(additions.sections[0].why),
    ).toBeInTheDocument();
    expect(
      within(listUnder('How long we keep it')).getByText(additions.sections[0].kept),
    ).toBeInTheDocument();
  });

  it('points to them wherever the page would otherwise read as the whole story', async () => {
    const text = await pageText(additions);
    expect(text).toContain(
      "This site also does some things the OpenSignup software doesn't do on its own. They're described under “Added on this site” below. Where they add to or differ from what this page says elsewhere, what they say applies.",
    );
    expect(text).toContain('On its own, the OpenSignup software sends four kinds of email:');
    expect(text).toContain(
      'On its own, the OpenSignup software sends no marketing email. Anything else this site sends is described under “Added on this site” below.',
    );
    expect(text).not.toContain(`${INSTANCE_NAME} sends four kinds of email`);
    // Once in what's kept about organizers, once in what's kept about participants.
    expect(text.split('Whatever “Added on this site” below says this site keeps.')).toHaveLength(3);
    expect(text).toContain(
      'Any other provider this site uses is named under “Added on this site” below.',
    );
    expect(text).toContain(
      'a provider under “Third parties” or “Added on this site” that this instance',
    );
  });

  it('dates the page by whichever changed last', async () => {
    const pageDate = lastUpdated(await pageText());
    expect(pageDate).toBeDefined();
    expect(lastUpdated(await pageText(additions))).toBe('Last updated: 1 January 2999');
    expect(lastUpdated(await pageText({ ...additions, lastUpdated: '2000-01-01' }))).toBe(pageDate);
  });

  it.each(['2026-02-30', '2026-13-01', '2026-00-10', '1/12/2026', ''])(
    'refuses %j as a date, naming the file, so the build fails',
    async (date) => {
      const PrivacyPage = await loadPage({ ...additions, lastUpdated: date });
      expect(() => PrivacyPage()).toThrow(
        'must be a real day written YYYY-MM-DD (lastUpdated in src/lib/privacy-additions.ts)',
      );
    },
  );
});
