import { expect, test, type Locator, type Page } from '@playwright/test';
import { loginAsSeededOrganizer } from './helpers/auth';
import { createPublishedSignup } from './helpers/signups';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

/**
 * While a form button waits for its answer, it swaps its label for a spinner
 * and a word like "Saving…". That swap must not move anything: the button
 * keeps its height, and the spinner sits in its middle. jsdom computes no
 * layout, so this is measured in the browser.
 */
async function expectSteadyWhileWaiting(page: Page, button: Locator, waitingName: string) {
  const before = await button.boundingBox();
  await button.click();
  const waiting = page.getByRole('button', { name: waitingName });
  await expect(waiting).toBeDisabled();
  const during = await waiting.boundingBox();
  const spinner = await waiting.locator('[aria-hidden="true"]').boundingBox();
  if (!before || !during || !spinner) throw new Error('button or spinner not on the page');

  expect(during.height, 'height while waiting').toBeCloseTo(before.height, 0);
  const middle = during.y + during.height / 2;
  const spinnerMiddle = spinner.y + spinner.height / 2;
  expect(Math.abs(spinnerMiddle - middle), 'spinner off the middle').toBeLessThanOrEqual(0.5);
}

test.describe('a form button while it waits', () => {
  for (const viewport of [DESKTOP, PHONE]) {
    test(`keeps its height and centres its spinner at ${viewport.width}px`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize(viewport);
      await loginAsSeededOrganizer(context);
      const { id } = await createPublishedSignup(page.request, {
        title: `Waiting button ${Date.now()}`,
        slot: { values: { what: 'Fruit and water' }, capacity: 2 },
      });

      // Hold every server action's request, so the waiting state stays on screen.
      await page.route(`**/app/signups/${id}/settings`, async (route) => {
        if (route.request().headers()['next-action']) return;
        await route.continue();
      });
      await page.goto(`/app/signups/${id}/settings`);

      await expectSteadyWhileWaiting(page, page.getByRole('button', { name: 'Save' }), 'Saving…');

      await page.getByRole('button', { name: 'Delete signup' }).click();
      await expectSteadyWhileWaiting(
        page,
        page.getByRole('button', { name: 'Yes, delete signup' }),
        'Deleting…',
      );
    });
  }
});
