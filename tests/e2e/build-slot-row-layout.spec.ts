import { expect, test, type Locator } from '@playwright/test';
import { loginAsSeededOrganizer } from './helpers/auth';
import { createDraft } from './helpers/signups';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

type Box = { x: number; y: number; width: number; height: number };

async function box(target: Locator): Promise<Box> {
  const found = await target.boundingBox();
  if (!found) throw new Error('expected a visible box');
  return found;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Browser-level geometry for a closed slot row on the Build tab. Hovering the
 * row, or putting focus in it, shows a toolbar (Edit, Duplicate, Delete) at
 * its right edge, where the row's "0 of N taken" count sits. jsdom computes no
 * layout, so only a browser can tell whether the two overlap.
 *
 * Viewports are set per test rather than left to the project, because CI runs
 * `--project=chromium` only.
 */
for (const [name, viewport] of [
  ['on desktop', DESKTOP],
  ['on a phone', PHONE],
] as const) {
  test.describe(`build tab slot row ${name}`, () => {
    test.beforeEach(async ({ context, page }) => {
      await loginAsSeededOrganizer(context);
      await page.setViewportSize(viewport);
    });

    test('the toolbar never covers the count, on hover or on focus', async ({ page }) => {
      // A long first value and a summary beside it, so the row's text is
      // already as wide as it can be and has to give up room for the toolbar.
      const draft = await createDraft(page.request, {
        title: `Row toolbar ${Date.now()}`,
        values: {
          what: 'Bring a large tray of sandwiches and two jugs of lemonade for everyone',
          date: '2030-04-06',
        },
      });
      await page.goto(`/app/signups/${draft.id}/build`);
      await page.waitForLoadState('networkidle');

      const slot = page.getByTestId(`wysiwyg-slot-${draft.slotId}`);
      const row = slot.locator(`[data-slot-row="${draft.slotId}"]`);
      const count = row.getByText(/taken$/);
      const toolbar = slot.getByRole('button', { name: /^Duplicate slot/ }).locator('..');
      await expect(count).toBeVisible();

      const rest = { row: await box(row), count: await box(count) };

      for (const reveal of ['hover', 'focus'] as const) {
        // Start from a row at rest each time.
        await page.mouse.move(0, 0);
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await expect(toolbar).toHaveCSS('opacity', '0');
        expect(await box(count), 'a row at rest keeps its count in place').toEqual(rest.count);

        if (reveal === 'hover') await row.hover();
        else await row.focus();
        await expect(toolbar).toHaveCSS('opacity', '1');

        const shown = { row: await box(row), count: await box(count), toolbar: await box(toolbar) };
        expect(
          overlaps(shown.count, shown.toolbar),
          `count ${JSON.stringify(shown.count)} under toolbar ${JSON.stringify(shown.toolbar)} on ${reveal}`,
        ).toBe(false);
        expect(shown.count.x + shown.count.width).toBeLessThanOrEqual(shown.toolbar.x);
        // The count keeps its full width, and the row doesn't grow.
        expect(shown.count.width).toBeCloseTo(rest.count.width, 0);
        expect(shown.row.height).toBeCloseTo(rest.row.height, 0);
      }
    });
  });
}
