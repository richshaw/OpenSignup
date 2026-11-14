import { expect, type Page, test } from '@playwright/test';
import { loadSeed } from './helpers/fixtures';
import { gotoSwedish } from './helpers/swedish';

const seed = loadSeed();

const PHONE = { width: 390, height: 844 };
const NARROW = { width: 320, height: 568 };
const DESKTOP = { width: 1280, height: 800 };

/**
 * Browser-level geometry for the slot row.
 *
 * These assertions exist because the jsdom tests cannot carry them: jsdom
 * computes no layout, so a class-name assertion still passes when a later
 * utility overrides the width. Every width and height claim made about this
 * row during review was measured in a throwaway harness, and two were wrong —
 * one because the harness rendered the *preview* button rather than the real
 * one. Pinning the numbers here is what stops that recurring.
 *
 * Viewports are set per test rather than left to the project, because CI runs
 * `--project=chromium` only: a phone-only assertion gated on the mobile-safari
 * project would silently skip on every run.
 *
 * Each runs on the English seed signup and on the Swedish one, whose labels
 * are longer ("Anmäl dig" where English has "Sign up"): `ACTION_SIZING` in
 * slot-format.ts was sized for English.
 */
const SIGNUPS = [
  {
    name: 'in English',
    path: `/s/${seed.publicSlug}`,
    labels: { full: 'Full', closed: 'Closed' },
    goto: (page: Page, path: string) => page.goto(path),
  },
  {
    name: 'in Swedish',
    path: `/s/${seed.swedish.slug}`,
    labels: { full: 'Fullt', closed: 'Stängt' },
    goto: gotoSwedish,
  },
];

for (const { name, path, labels, goto } of SIGNUPS) {
  const ACTIONS = `button, a[href*="/c/"], span:text-is("${labels.full}"), span:text-is("${labels.closed}")`;

  test.describe(`slot row layout ${name}`, () => {
    test('every action state occupies the same box, on a phone and on desktop', async ({
      page,
    }) => {
      for (const viewport of [PHONE, DESKTOP]) {
        await page.setViewportSize(viewport);
        await goto(page, path);

        const actions = page.locator('ul li').locator(ACTIONS);
        const count = await actions.count();
        expect(count, 'seed should render several slot rows').toBeGreaterThan(1);

        const widths = new Set<number>();
        for (let i = 0; i < count; i += 1) {
          const box = await actions.nth(i).boundingBox();
          expect(box).not.toBeNull();
          widths.add(Math.round(box!.width));
        }
        // The point of the change: Full, Closed, Edit and Sign up are states of
        // one control and share a width, rather than a narrow label hugging the
        // row's edge beside a wider pill.
        expect([...widths], `one width at ${viewport.width}px`).toHaveLength(1);
      }
    });

    test('actions meet a 44px touch target on a phone, and stay compact on desktop', async ({
      page,
    }) => {
      await page.setViewportSize(PHONE);
      await goto(page, path);
      for (const action of await page.locator('ul li').locator(ACTIONS).all()) {
        const box = await action.boundingBox();
        // iOS HIG 44pt / Material 48dp. Sub-pixel rounding, hence the 0.5.
        expect(box!.height, 'phone touch target').toBeGreaterThanOrEqual(43.5);
      }

      await page.setViewportSize(DESKTOP);
      await goto(page, path);
      for (const action of await page.locator('ul li').locator(ACTIONS).all()) {
        const box = await action.boundingBox();
        // 36px: the height the real Sign-up button already was before this work.
        expect(box!.height, 'desktop stays compact').toBeLessThan(44);
      }
    });

    // The box is a fixed width, so a label too long for it wraps or spills
    // out while every box still measures the same.
    test('every action’s label fits its box on one line, down to 320px', async ({ page }) => {
      for (const viewport of [NARROW, PHONE, DESKTOP]) {
        await page.setViewportSize(viewport);
        await goto(page, path);
        for (const action of await page.locator('ul li').locator(ACTIONS).all()) {
          const fit = await action.evaluate((el) => {
            const range = document.createRange();
            range.selectNodeContents(el);
            const tops = [...range.getClientRects()]
              .filter((rect) => rect.width > 0)
              .map((rect) => rect.top)
              .sort((a, b) => a - b);
            const lines = tops.filter((top, i) => i === 0 || top - tops[i - 1]! > 2).length;
            return { lines, spills: el.scrollWidth > el.clientWidth };
          });
          expect(fit, `"${await action.textContent()}" at ${viewport.width}px`).toEqual({
            lines: 1,
            spills: false,
          });
        }
      }
    });

    test('no horizontal overflow down to 320px', async ({ page }) => {
      for (const viewport of [NARROW, PHONE, DESKTOP]) {
        await page.setViewportSize(viewport);
        await goto(page, path);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(overflow, `no overflow at ${viewport.width}px`).toBe(false);
      }
    });
  });
}
