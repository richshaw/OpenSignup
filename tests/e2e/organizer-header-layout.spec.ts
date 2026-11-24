import { expect, type Locator, type Page, test } from '@playwright/test';
import { CATALOG_LOCALES } from '@/i18n/config';
import { englishName } from '@/i18n/testing/locales';
import { loginAsSeededOrganizer } from './helpers/auth';
import { expectOneLine } from './helpers/label-fit';
import {
  createOrganizerIn,
  messagesIn,
  type OrganizerIn,
  retitleSignup,
} from './helpers/organizer-language';
import { unshippedHint } from './helpers/unshipped-locales';

const NARROW = { width: 320, height: 568 };
const PHONE = { width: 390, height: 844 };
/** The narrowest width that shows the whole trail (Tailwind's `md`), and a laptop's. */
const TABLET = { width: 768, height: 1024 };
const LAPTOP = { width: 1024, height: 768 };

/** A title long enough that the trail can't show all of it beside the header's links. */
const LONG_TITLE = 'Bake Sale and Spring Fair Volunteers: Saturday Morning Setup Crew';

/** The smallest a link may be to click or tap (WCAG 2.2, 2.5.8, in CSS pixels). */
const MIN_TARGET = 24;

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
 * The organizer header's layout, in every language with a catalog, English
 * included, so the next language is measured without touching this spec.
 * Each language's organizer stores it on their account (`createOrganizerIn`),
 * so the header and its crumbs are in it.
 *
 * On a phone the header shows the site's name and the header's links (Help,
 * Account, Sign out), and no trail: the page's heading says where you are, and
 * the site's name is the way back to Your signups, so it must stay big enough
 * to tap. From `md` up the whole trail shows on the same row; only the current
 * page's crumb may shorten, and the links before it keep their words. Every
 * item is measured against every header link, since an item that spills out
 * of the trail's box leaves the box itself clear of them.
 *
 * Viewports are set per test, as slot-row-layout.spec.ts does, because CI
 * runs the chromium project only.
 */
for (const locale of CATALOG_LOCALES) {
  test.describe(`organizer header in ${englishName(locale)}`, () => {
    let organizer: OrganizerIn;
    const chrome = messagesIn(locale, 'organizer.chrome');
    const crumbs = messagesIn(locale, 'organizer.crumbs');
    const dashboard = messagesIn(locale, 'organizer.dashboard');

    test.beforeAll(async ({}, testInfo) => {
      organizer = await createOrganizerIn(locale, `header-${testInfo.project.name}`);
      // Long enough to fill the trail, so its current crumb has to shorten.
      await retitleSignup(organizer.open.id, LONG_TITLE);
    });

    test.beforeEach(async ({ context }) => {
      await loginAsSeededOrganizer(context, { sessionToken: organizer.sessionToken });
    });

    /** Each page with crumbs, and the crumbs it shows after the site's name. */
    function pagesWithCrumbs(): { path: string; trail: string[] }[] {
      return [
        { path: '/app/signups/new', trail: [crumbs('newSignup')] },
        { path: '/app/settings', trail: [crumbs('settings')] },
        {
          path: '/app/settings/connected-apps',
          trail: [crumbs('settings'), crumbs('connectedApps')],
        },
        ...(['build', 'responses', 'settings'] as const).map((tab) => ({
          path: `/app/signups/${organizer.open.id}/${tab}`,
          trail: [LONG_TITLE],
        })),
      ];
    }

    /**
     * The header's links, checked visible, and their boxes. From `sm` up the
     * account link reads as the organizer's address, not "Account".
     */
    async function headerLinks(page: Page, where: string, wide: boolean) {
      const header = page.getByRole('banner');
      const links = [
        header.getByRole('link', { name: chrome('help'), exact: true }),
        header.getByRole('link', { name: wide ? organizer.email : chrome('account'), exact: true }),
        header.getByRole('button', { name: chrome('signOut'), exact: true }),
      ];
      const boxes: { name: string; box: Box }[] = [];
      for (const link of links) {
        await expect(
          link,
          `${chrome('help')}, ${chrome('account')} and ${chrome('signOut')} stay visible ${where}`,
        ).toBeVisible();
        boxes.push({ name: (await link.textContent()) ?? '', box: await edges(link) });
      }
      return boxes;
    }

    /** Checks `item` is one line high, inside the trail and clear of the header's links. */
    async function expectClear(
      item: Locator,
      navBox: Box,
      links: { name: string; box: Box }[],
      where: string,
    ) {
      const box = await edges(item);
      const text = await item.textContent();
      expect(box.right, `"${text}" stays inside the trail ${where}`).toBeLessThanOrEqual(
        navBox.right + 0.5,
      );
      for (const link of links) {
        expect(overlaps(box, link.box), `"${text}" clear of ${link.name} ${where}`).toBe(false);
      }
      // One line, so the header stays one row high.
      expect(box.bottom - box.top, `"${text}" on one line ${where}`).toBeLessThan(30);
    }

    function trailOf(page: Page) {
      const nav = page.getByRole('navigation', { name: chrome('breadcrumb') });
      return {
        nav,
        home: nav.getByRole('link').first(),
        // The crumbs after the site's name: links, and the current page.
        crumbs: nav.locator(':scope > span > a, :scope > span > span:not([aria-hidden])'),
      };
    }

    for (const viewport of [NARROW, PHONE]) {
      test(`only the site's name shows in the trail at ${viewport.width}px`, async ({ page }) => {
        await page.setViewportSize(viewport);
        for (const { path, trail } of pagesWithCrumbs()) {
          const where = `on ${path} at ${viewport.width}px`;
          await page.goto(path);
          const { nav, home, crumbs: items } = trailOf(page);
          await expect(
            nav,
            `the header should be in ${locale}: ${unshippedHint(locale)}`,
          ).toBeVisible();
          const links = await headerLinks(page, where, false);
          await expect(home, `the way back to Your signups ${where}`).toBeVisible();
          await expect(home).toHaveAttribute('href', '/app');
          const homeBox = await edges(home);
          expect(
            homeBox.right - homeBox.left,
            `the site's name is big enough to tap ${where}`,
          ).toBeGreaterThanOrEqual(MIN_TARGET);
          await expectClear(home, await edges(nav), links, where);
          // The crumbs are in the page but not shown, so they can't be tabbed to.
          await expect(items).toHaveCount(trail.length);
          for (const item of await items.all()) await expect(item, where).toBeHidden();
          // The page's own heading says where you are instead.
          await expect(page.getByRole('heading', { level: 1 }).first(), where).toBeVisible();
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

    for (const viewport of [TABLET, LAPTOP]) {
      test(`the whole trail fits beside the header's links at ${viewport.width}px`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        for (const { path, trail } of pagesWithCrumbs()) {
          const where = `on ${path} at ${viewport.width}px`;
          await page.goto(path);
          const { nav, home, crumbs: items } = trailOf(page);
          await expect(
            nav,
            `the header should be in ${locale}: ${unshippedHint(locale)}`,
          ).toBeVisible();
          const links = await headerLinks(page, where, true);
          const navBox = await edges(nav);
          await expect(items).toHaveCount(trail.length);
          // Shortened on screen, the current crumb keeps its whole words for screen readers.
          for (const [i, label] of trail.entries())
            await expect(items.nth(i), where).toHaveText(label);
          // The site's name and the crumbs before the current page are links:
          // they keep their words, so they read in full and are easy to click.
          const earlier = [home, ...(await items.all()).slice(0, -1)];
          for (const link of earlier) {
            await expectOneLine(link, where);
            await expectClear(link, navBox, links, where);
          }
          const current = items.last();
          await expect(current).toHaveAttribute('aria-current', 'page');
          const currentBox = await edges(current);
          expect(
            currentBox.right - currentBox.left,
            `the current page's crumb still shows some of its words ${where}`,
          ).toBeGreaterThanOrEqual(MIN_TARGET);
          await expectClear(current, navBox, links, where);
        }
      });
    }
  });
}
