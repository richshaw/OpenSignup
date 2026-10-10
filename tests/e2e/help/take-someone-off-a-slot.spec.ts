/**
 * Walkthrough for the help article "Take someone off a slot"
 * (src/help/articles/take-someone-off-a-slot.tsx). It follows the article's
 * steps by the same on-screen names, so a renamed or moved control fails here
 * and points at the article. With HELP_SCREENSHOTS=1 it also refreshes the
 * article's pictures.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { UI } from '@/help/articles/take-someone-off-a-slot.ui';
import { loginAsSeededOrganizer } from '../helpers/auth';

const SLUG = 'take-someone-off-a-slot';
const CAPTURE = process.env.HELP_SCREENSHOTS === '1';
const SHOT_DIR = `public/help/${SLUG}`;

/**
 * The target with a margin of the page around it: the dialog's rounded corners
 * then sit on its dimmed backdrop, rather than showing scraps of it at the
 * corners of the picture.
 */
async function shot(page: Page, target: Locator, name: string): Promise<void> {
  if (!CAPTURE) return;
  // Fonts and focus rings settle after the last action.
  await page.waitForTimeout(300);
  const box = await target.boundingBox();
  if (!box) throw new Error(`${name}: not on the page`);
  // Whole pixels, so the file is exactly twice the size the article gives.
  const pad = 16;
  const x = Math.floor(box.x) - pad;
  const y = Math.floor(box.y) - pad;
  await page.screenshot({
    path: `${SHOT_DIR}/${name}.png`,
    clip: {
      x,
      y,
      width: Math.ceil(box.x + box.width) + pad - x,
      height: Math.ceil(box.y + box.height) + pad - y,
    },
    animations: 'disabled',
  });
}

test.describe('help: take someone off a slot', () => {
  // Screenshots at 2x so text stays sharp; the article sizes them in CSS pixels.
  test.use({ deviceScaleFactor: 2 });

  test('the steps work as written', async ({ page, context, browser, isMobile }) => {
    test.skip(isMobile, 'the steps are the same on a phone; responses.spec.ts checks it fits');
    await loginAsSeededOrganizer(context);
    const created = await page.request.post('/api/signups', {
      data: {
        title: `Snack duty ${Date.now()}`,
        description: '',
        tags: [],
        visibility: 'unlisted',
        settings: {},
      },
    });
    expect(created.ok()).toBe(true);
    const { id, slug } = (await created.json()).data as { id: string; slug: string };
    const added = await page.request.post(`/api/signups/${id}/slots`, {
      data: { capacity: 1, values: { what: 'Fruit and water' } },
    });
    expect(added.ok()).toBe(true);
    const slotId = (await added.json()).data.id as string;
    expect((await page.request.post(`/api/signups/${id}/publish`)).ok()).toBe(true);

    // Sam signs up from a browser of their own.
    const participant = await browser.newContext();
    try {
      const visitor = await participant.newPage();
      const committed = await visitor.request.post(`/api/slots/${slotId}/commitments`, {
        // An address of its own, from the range kept for documentation (RFC
        // 5737), so this sign-up doesn't count against the per-IP limit every
        // other spec's sign-ups share.
        headers: { 'x-forwarded-for': '203.0.113.78' },
        data: { name: 'Sam Example', email: `sam+${Date.now()}@example.test`, quantity: 1 },
      });
      expect(committed.ok()).toBe(true);
      const editUrl = (await committed.json()).data.editUrl as string;

      // Remove someone from a slot
      await page.goto(`/app/signups/${id}/build`);
      await page.getByRole('tab', { name: new RegExp(`^${UI.responses}`) }).click();
      await page.waitForURL(/\/responses$/);
      const row = page.getByRole('row').filter({ hasText: 'Sam Example' });
      await expect(row).toBeVisible();

      // The button shows Remove; its full name adds who and which slot.
      const remove = row.getByRole('button', { name: new RegExp(`^${UI.remove} `) });
      await expect(remove).toHaveText(UI.remove);
      await remove.click();
      const confirm = page.getByRole('alertdialog');
      await expect(confirm).toContainText('Remove Sam Example from Fruit and water?');
      await expect(confirm).toContainText('won’t get an email');
      // Keep leaves them on the slot.
      await confirm.getByRole('button', { name: UI.keep }).click();
      await expect(confirm).toHaveCount(0);
      await expect(row.getByRole('cell', { name: 'confirmed', exact: true })).toBeVisible();

      await remove.click();
      await shot(page, confirm, 'confirm');
      await confirm.getByRole('button', { name: UI.yesRemove }).click();

      // What happens next
      await expect(row.getByRole('cell', { name: UI.removed, exact: true })).toBeVisible();
      await expect(row.getByRole('button', { name: new RegExp(`^${UI.remove} `) })).toHaveCount(0);
      await expect(page.getByRole('tab', { name: `${UI.responses} 0` })).toBeVisible();

      // Their spot is open to anyone again.
      await visitor.goto(`/s/${slug}`);
      const slotRow = visitor.locator('li').filter({ hasText: 'Fruit and water' });
      await expect(slotRow.getByRole('button', { name: /^Sign up/ })).toBeVisible();

      await visitor.goto(editUrl);
      await expect(visitor.getByRole('heading', { name: UI.removedPage })).toBeVisible();
    } finally {
      await participant.close();
    }
  });
});
