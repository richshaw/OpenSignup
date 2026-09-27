import { expect, test } from '@playwright/test';
import { loadSeed } from './helpers/fixtures';

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
 */
const ACTIONS = 'button, a[href*="/c/"], span:text-is("Full"), span:text-is("Closed")';

test.describe('slot row layout', () => {
  test('every action state occupies the same box, on a phone and on desktop', async ({ page }) => {
    for (const viewport of [PHONE, DESKTOP]) {
      await page.setViewportSize(viewport);
      await page.goto(`/s/${seed.publicSlug}`);

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
    await page.goto(`/s/${seed.publicSlug}`);
    for (const action of await page.locator('ul li').locator(ACTIONS).all()) {
      const box = await action.boundingBox();
      // iOS HIG 44pt / Material 48dp. Sub-pixel rounding, hence the 0.5.
      expect(box!.height, 'phone touch target').toBeGreaterThanOrEqual(43.5);
    }

    await page.setViewportSize(DESKTOP);
    await page.goto(`/s/${seed.publicSlug}`);
    for (const action of await page.locator('ul li').locator(ACTIONS).all()) {
      const box = await action.boundingBox();
      // 36px: the height the real Sign-up button already was before this work.
      expect(box!.height, 'desktop stays compact').toBeLessThan(44);
    }
  });

  test('no horizontal overflow down to 320px', async ({ page }) => {
    for (const viewport of [NARROW, PHONE, DESKTOP]) {
      await page.setViewportSize(viewport);
      await page.goto(`/s/${seed.publicSlug}`);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow, `no overflow at ${viewport.width}px`).toBe(false);
    }
  });
});
