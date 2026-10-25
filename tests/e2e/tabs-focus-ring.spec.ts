import { expect, test } from '@playwright/test';
import { loginAsSeededOrganizer } from './helpers/auth';
import { loadSeed } from './helpers/fixtures';

const seed = loadSeed();

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

/**
 * The signup tab row scrolls sideways (`overflow-x-auto`), and a box that
 * scrolls one way clips both ways, so a focus ring drawn outside a tab lost
 * its top and bottom edges (and, from `sm` up, the first tab's left edge).
 * jsdom computes no layout, so the geometry is checked in a real browser.
 *
 * Viewports are set per test because CI runs `--project=chromium` only.
 */
test.describe('signup tabs focus ring', () => {
  test.beforeEach(async ({ context }) => {
    await loginAsSeededOrganizer(context);
  });

  for (const viewport of [PHONE, DESKTOP]) {
    test(`a keyboard-focused tab's whole ring fits in the tab row at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(`/app/signups/${seed.draftSignupId}/build`);
      await expect(page.getByRole('tablist', { name: 'Signup sections' })).toBeVisible();

      // Press Tab until Build has focus, so focus comes from the keyboard and
      // :focus-visible applies as it does for a real user. Chromium can start
      // the first Tab part-way down the page, so this may wrap round once.
      let reached = false;
      for (let i = 0; i < 60 && !reached; i += 1) {
        await page.keyboard.press('Tab');
        reached = await page.evaluate(() => {
          const el = document.activeElement;
          return el?.getAttribute('role') === 'tab' && (el.textContent ?? '').startsWith('Build');
        });
      }
      expect(reached, 'Tab should reach the Build tab').toBe(true);

      for (const label of ['Build', 'Responses', 'Settings']) {
        const ring = await page.evaluate(() => {
          const tab = document.activeElement as HTMLElement;
          const row = tab.closest('[role="tablist"]') as HTMLElement;
          const style = getComputedStyle(tab);
          const grow = parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth);
          const t = tab.getBoundingClientRect();
          const r = row.getBoundingClientRect();
          // Overflow clips at the row's padding box: inside its border.
          const clip = {
            left: r.left + row.clientLeft,
            top: r.top + row.clientTop,
            right: r.left + row.clientLeft + row.clientWidth,
            bottom: r.top + row.clientTop + row.clientHeight,
          };
          return {
            text: tab.textContent ?? '',
            focusVisible: tab.matches(':focus-visible'),
            outlineStyle: style.outlineStyle,
            box: {
              left: t.left - grow,
              top: t.top - grow,
              right: t.right + grow,
              bottom: t.bottom + grow,
            },
            clip,
          };
        });

        expect(ring.text).toContain(label);
        expect(ring.focusVisible, `${label} is keyboard-focused`).toBe(true);
        expect(ring.outlineStyle, `${label} draws a ring`).not.toBe('none');
        // Sub-pixel layout, hence the 0.5.
        expect(ring.box.left, `${label} ring left`).toBeGreaterThanOrEqual(ring.clip.left - 0.5);
        expect(ring.box.top, `${label} ring top`).toBeGreaterThanOrEqual(ring.clip.top - 0.5);
        expect(ring.box.right, `${label} ring right`).toBeLessThanOrEqual(ring.clip.right + 0.5);
        expect(ring.box.bottom, `${label} ring bottom`).toBeLessThanOrEqual(ring.clip.bottom + 0.5);

        await page.keyboard.press('Tab');
      }
    });
  }
});
