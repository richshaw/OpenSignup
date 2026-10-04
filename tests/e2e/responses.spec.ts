import { expect, test } from '@playwright/test';
import { loginAsSeededOrganizer } from './helpers/auth';

test.describe('Responses tab', () => {
  test('organizer removes one person and their spot opens up', async ({
    page,
    context,
    browser,
  }) => {
    await loginAsSeededOrganizer(context);
    // A fresh signup per run, with one single-spot slot: the test owns its
    // state, and the slot offering "Sign up" again shows the spot came back.
    const created = await page.request.post('/api/signups', {
      data: {
        title: `Remove flow ${Date.now()}`,
        description: '',
        tags: [],
        visibility: 'unlisted',
        settings: {},
      },
    });
    expect(created.ok()).toBe(true);
    const { id: signupId, slug } = (await created.json()).data as { id: string; slug: string };
    const added = await page.request.post(`/api/signups/${signupId}/slots`, {
      data: { capacity: 1, values: { what: 'Fruit and water' } },
    });
    expect(added.ok()).toBe(true);
    const slotId = (await added.json()).data.id as string;
    expect((await page.request.post(`/api/signups/${signupId}/publish`)).ok()).toBe(true);

    // The participant signs up from a browser of their own, which keeps the
    // cookie that marks their sign-up on the public page.
    const participant = await browser.newContext();
    try {
      const visitor = await participant.newPage();
      const committed = await visitor.request.post(`/api/slots/${slotId}/commitments`, {
        data: { name: 'Sam Example', email: `sam+${Date.now()}@example.test`, quantity: 1 },
      });
      expect(committed.ok()).toBe(true);
      const editUrl = (await committed.json()).data.editUrl as string;

      await visitor.goto(`/s/${slug}`);
      const slotRow = visitor.locator('li').filter({ hasText: 'Fruit and water' });
      // Theirs: Edit in place of Sign up, and the banner.
      await expect(slotRow.getByRole('link', { name: 'Edit' })).toBeVisible();
      await expect(slotRow.getByRole('button', { name: 'Sign up' })).toHaveCount(0);
      await expect(visitor.getByText("You're signed up")).toBeVisible();

      await page.goto(`/app/signups/${signupId}/responses`);
      const row = page.getByRole('row').filter({ hasText: 'Sam Example' });
      await row.getByRole('button', { name: 'Remove' }).click();
      const confirm = page.getByRole('alertdialog', { name: 'Confirm removal' });
      await expect(confirm).toContainText(
        'Remove Sam Example from Fruit and water? Their spot opens up for someone else. ' +
          'They won’t get an email about it.',
      );
      // Keep changes nothing.
      await confirm.getByRole('button', { name: 'Keep' }).click();
      await expect(confirm).toHaveCount(0);
      await expect(row.getByRole('cell', { name: 'confirmed' })).toBeVisible();
      await row.getByRole('button', { name: 'Remove' }).click();
      await confirm.getByRole('button', { name: 'Yes, remove' }).click();
      await expect(row.getByRole('cell', { name: 'cancelled' })).toBeVisible();
      await expect(row.getByRole('button', { name: 'Remove' })).toHaveCount(0);

      // The spot is free again, and their page no longer says it is theirs.
      await visitor.reload();
      await expect(slotRow.getByRole('button', { name: 'Sign up' })).toBeVisible();
      await expect(slotRow.getByRole('link', { name: 'Edit' })).toHaveCount(0);
      await expect(visitor.getByText("You're signed up")).toHaveCount(0);

      // Their edit link says the sign-up was cancelled, not by whom.
      await visitor.goto(editUrl);
      await expect(
        visitor.getByRole('heading', { name: 'This sign-up was cancelled' }),
      ).toBeVisible();
    } finally {
      await participant.close();
    }
  });
});
