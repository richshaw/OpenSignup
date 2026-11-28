// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CookiesPage from './cookies/page';
import { formatDay } from './legal-header';
import PrivacyPage from './privacy/page';
import TermsPage from './terms/page';

// A deployment fills in its own additions, which can date the privacy page
// later than its text; these tests are about each page's own date.
vi.mock('@/lib/privacy-additions', () => ({ PRIVACY_ADDITIONS: null }));

/** The PAGE_UPDATED a page's source declares. Next.js allows a page no other exports. */
function pageUpdated(page: string): string {
  const source = readFileSync(path.resolve(__dirname, page, 'page.tsx'), 'utf8');
  const iso = /^const PAGE_UPDATED = '([^']*)';$/m.exec(source)?.[1];
  if (!iso) throw new Error(`${page}/page.tsx declares no PAGE_UPDATED`);
  return iso;
}

describe('legal pages', () => {
  it.each([
    ['privacy', PrivacyPage],
    ['cookies', CookiesPage],
    ['terms', TermsPage],
  ])('the %s page shows its own PAGE_UPDATED, formatted', (page, Page) => {
    const { container } = render(<Page />);
    const shown = container.querySelector('header p')?.textContent;
    expect(shown).toBe(`Last updated: ${formatDay(pageUpdated(page))}`);
  });

  it('no page types a formatted date by hand', () => {
    for (const page of ['privacy', 'cookies', 'terms']) {
      const source = readFileSync(path.resolve(__dirname, page, 'page.tsx'), 'utf8');
      expect(source, page).not.toMatch(/Last updated:/);
    }
  });
});

describe('formatDay', () => {
  it('writes a real day the way the pages always have', () => {
    expect(formatDay('2026-11-12')).toBe('12 November 2026');
    expect(formatDay('2026-10-31')).toBe('31 October 2026');
    expect(formatDay('2024-02-29')).toBe('29 February 2024');
  });

  it.each(['2026-02-30', '2026-13-01', '2026-00-10', '1/12/2026', '2026-1-01', ''])(
    'refuses %j, naming where the date is set',
    (date) => {
      expect(() => formatDay(date, 'PAGE_UPDATED in terms/page.tsx')).toThrow(
        `must be a real day written YYYY-MM-DD (PAGE_UPDATED in terms/page.tsx), not "${date}"`,
      );
    },
  );
});
