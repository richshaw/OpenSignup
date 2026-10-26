/**
 * Walkthrough for the help article "Take someone off a slot"
 * (src/help/articles/take-someone-off-a-slot.tsx). It follows the article's
 * steps by the same on-screen names, so a renamed or moved control fails here
 * and points at the article. With HELP_SCREENSHOTS=1 it also refreshes the
 * article's pictures.
 */
import { expect, test } from '@playwright/test';
import { UI } from '@/help/articles/take-someone-off-a-slot.ui';
import { loginAsSeededOrganizer } from '../helpers/auth';
import { helpShot } from '../helpers/help-shots';

const SLUG = 'take-someone-off-a-slot';

test.describe('help: take someone off a slot', () => {
  // Screenshots at 2x so text stays sharp; the article sizes them in CSS pixels.
  test.use({ deviceScaleFactor: 2 });

  test('the steps work as written', async ({ page, context, browser, isMobile }) => {
    test.skip(isMobile, 'the steps are the same on a phone; responses.spec.ts checks it fits');
    await loginAsSeededOrganizer(context);
    const title = `Snack duty ${Date.now()}`;
    const created = await page.request.post('/api/signups', {
      data: {
        title,
        description: '',
        tags: [],
        visibility: 'unlisted',
        settings: {},
      },
    });
    expect(created.ok()).toBe(true);
    const { id, slug } = (await created.json()).data as { id: string; slug: string };
    const added = await page.request.post(`/api/signups/${id}/slots`, {
      // The slot "Create and publish your first signup" makes, on its date.
      data: { capacity: 1, values: { what: 'Fruit and water', date: '2030-04-06' } },
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
      await page.goto('/app');
      await expect(page.getByRole('heading', { name: UI.yourSignups })).toBeVisible();
      await page.getByRole('link').filter({ hasText: title }).click();
      await page.waitForURL(new RegExp(`/app/signups/${id}`));
      await page.getByRole('tab', { name: new RegExp(`^${UI.responses}`) }).click();
      await page.waitForURL(/\/responses$/);
      const row = page.getByRole('row').filter({ hasText: 'Sam Example' });
      await expect(row).toBeVisible();

      // The button shows Remove; its full name adds who and which slot.
      const remove = row.getByRole('button', { name: new RegExp(`^${UI.remove} `) });
      await expect(remove).toHaveText(UI.remove);
      await remove.click();
      const confirm = page.getByRole('alertdialog');
      await expect(confirm).toContainText('Remove Sam Example from Fruit and water · Sat, Apr 6?');
      await expect(confirm).toContainText('won’t get an email');
      // Keep leaves them on the slot.
      await confirm.getByRole('button', { name: UI.keep }).click();
      await expect(confirm).toHaveCount(0);
      await expect(row.getByRole('cell', { name: 'confirmed', exact: true })).toBeVisible();

      await remove.click();
      // A margin of the page around the dialog, so its rounded corners sit on
      // the dimmed backdrop rather than showing scraps of it.
      await helpShot(page, SLUG, [confirm], 'confirm');
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
      await expect(visitor.getByText('Fruit and water · Sat, Apr 6', { exact: true })).toBeVisible();
    } finally {
      await participant.close();
    }
  });
});
