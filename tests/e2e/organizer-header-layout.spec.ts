import { expect, type Locator, type Page, test } from '@playwright/test';
import { CATALOG_LOCALES } from '@/i18n/config';
import { englishName } from '@/i18n/testing/locales';
import { loginAsSeededOrganizer } from './helpers/auth';
import { expectOneLine } from './helpers/label-fit';
import { createOrganizerIn, messagesIn, type OrganizerIn } from './helpers/organizer-language';
import { unshippedHint } from './helpers/unshipped-locales';

const NARROW = { width: 320, height: 568 };
const PHONE = { width: 390, height: 844 };

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** `locator`'s box on screen, as edges. */
async function edges(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  expect(box, `${await locator.textContent()} should be on screen`).not.toBeNull();
  return { left: box!.x, right: box!.x + box!.width, top: box!.y, bottom: box!.y + box!.height };
}

function overlaps(a: Box, b: Box): boolean {
  // Half a pixel either way for sub-pixel rounding.
  return (
    a.left < b.right - 0.5 &&
    b.left < a.right - 0.5 &&
    a.top < b.bottom - 0.5 &&
    b.top < a.bottom - 0.5
  );
}

/**
 * The organizer header's layout at phone widths, in every language with a
 * catalog, English included, so the next language is measured without
 * touching this spec. Each language's organizer stores it on their account
 * (`createOrganizerIn`), so the header and its crumbs are in it.
 *
 * The crumb trail and the header's links (Help, Account, Sign out) share one
 * row. The trail is the side that gives way: its crumbs shorten with "…"
 * rather than running under the links. Every crumb is measured against every
 * link, since a crumb that spills out of the trail's box leaves the box
 * itself clear of them.
 *
 * Viewports are set per test, as slot-row-layout.spec.ts does, because CI
 * runs the chromium project only.
 */
for (const locale of CATALOG_LOCALES) {
  test.describe(`organizer header on a phone in ${englishName(locale)}`, () => {
    let organizer: OrganizerIn;
    const chrome = messagesIn(locale, 'organizer.chrome');
    const crumbs = messagesIn(locale, 'organizer.crumbs');
    const dashboard = messagesIn(locale, 'organizer.dashboard');

    test.beforeAll(async ({}, testInfo) => {
      organizer = await createOrganizerIn(locale, `header-${testInfo.project.name}`);
    });

    test.beforeEach(async ({ context }) => {
      await loginAsSeededOrganizer(context, { sessionToken: organizer.sessionToken });
    });

    /** Each page with crumbs, and the crumbs it shows after the site's name. */
    function pagesWithCrumbs(): { path: string; trail: string[] }[] {
      const title = 'Bake Sale';
      return [
        { path: '/app/signups/new', trail: [crumbs('newSignup')] },
        { path: '/app/settings', trail: [crumbs('settings')] },
        {
          path: '/app/settings/connected-apps',
          trail: [crumbs('settings'), crumbs('connectedApps')],
        },
        ...(['build', 'responses', 'settings'] as const).map((tab) => ({
          path: `/app/signups/${organizer.open.id}/${tab}`,
          trail: [title],
        })),
      ];
    }

    async function expectCrumbsClear(page: Page, path: string, trail: string[], width: number) {
      const where = `on ${path} at ${width}px`;
      const nav = page.getByRole('navigation', { name: chrome('breadcrumb') });
      await expect(
        nav,
        `the header should be in ${locale}: ${unshippedHint(locale)}`,
      ).toBeVisible();
      // The site's name, then each crumb: links, and the current page.
      const items = nav.locator(':scope > a, :scope > span:not([aria-hidden])');
      await expect(items).toHaveCount(trail.length + 1);
      // Shortened on screen, the crumbs keep their whole words for screen readers.
      for (const [i, label] of trail.entries()) {
        await expect(items.nth(i + 1), where).toHaveText(label);
      }

      const header = page.getByRole('banner');
      const links = [
        header.getByRole('link', { name: chrome('help'), exact: true }),
        header.getByRole('link', { name: chrome('account'), exact: true }),
        header.getByRole('button', { name: chrome('signOut'), exact: true }),
      ];
      const linkBoxes: Box[] = [];
      for (const link of links) {
        await expect(
          link,
          `${chrome('help')}, ${chrome('account')} and ${chrome('signOut')} stay visible ${where}`,
        ).toBeVisible();
        linkBoxes.push(await edges(link));
      }
      const navBox = await edges(nav);
      for (const item of await items.all()) {
        const box = await edges(item);
        const text = await item.textContent();
        expect(box.right, `"${text}" stays inside the trail ${where}`).toBeLessThanOrEqual(
          navBox.right + 0.5,
        );
        for (const [i, linkBox] of linkBoxes.entries()) {
          expect(
            overlaps(box, linkBox),
            `"${text}" clear of ${await links[i]!.textContent()} ${where}`,
          ).toBe(false);
        }
        // One line, so the header stays one row high.
        expect(box.bottom - box.top, `"${text}" on one line ${where}`).toBeLessThan(30);
      }
    }

    for (const viewport of [NARROW, PHONE]) {
      test(`no crumb runs into the header's links at ${viewport.width}px`, async ({ page }) => {
        await page.setViewportSize(viewport);
        for (const { path, trail } of pagesWithCrumbs()) {
          await page.goto(path);
          await expectCrumbsClear(page, path, trail, viewport.width);
        }
      });

      test(`New signup stays on one line at ${viewport.width}px`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto('/app');
        const button = page
          .getByRole('main')
          .getByRole('link', { name: dashboard('newSignup'), exact: true });
        await expect(button, unshippedHint(locale)).toBeVisible();
        await expectOneLine(button, `on Your signups at ${viewport.width}px`);
      });
    }
  });
}
