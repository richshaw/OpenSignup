import { expect, test } from '@playwright/test';
import { loginAsSeededOrganizer } from './helpers/auth';

/**
 * Regression: the reminder controls used to discard what you had just saved.
 *
 * React resets a form's uncontrolled fields once its action resolves, and that
 * reset restores each control to its DOM default — the `checked`/`selected`
 * attribute React writes at mount and leaves alone on re-render. The row was
 * written correctly every time, but the control snapped back to its page-load
 * value, which reads as a failed save.
 *
 * Asserting after a reload would pass either way, and asserting straight after
 * the click would pass on the value the organizer just picked, since the reset
 * lands slightly later. So this waits for the action's own round trip and for
 * `useFormStatus` to clear `pending` — the point the stale value would appear.
 */
test.describe('reminder settings', () => {
  test.beforeEach(async ({ context }) => {
    await loginAsSeededOrganizer(context);
  });

  test('the reminders toggle survives the post-save re-render', async ({ page }) => {
    // A fresh signup per run so retries and projects never compete over one row.
    // createSignup applies DEFAULT_TEMPLATE, whose date field is what makes the
    // reminders form render at all.
    const created = await page.request.post('/api/signups', {
      data: {
        title: `Reminder toggle ${Date.now()}`,
        description: '',
        tags: [],
        visibility: 'unlisted',
        settings: {},
      },
    });
    expect(created.ok()).toBe(true);
    const signupId = (await created.json()).data.id as string;

    await page.goto(`/app/signups/${signupId}/settings`);
    const sendReminders = page.locator('input[name="sendReminders"]');
    const select = page.getByLabel('Reminder date field');
    const save = page.getByRole('button', { name: 'Save' });

    // The lead is fixed; there is no timing control to find.
    await expect(page.locator('select[name="reminderLeadHours"]')).toHaveCount(0);
    await expect(sendReminders).toBeChecked();
    // A new signup is anchored on its template date field from the start.
    await expect(select).toHaveValue('date');

    await sendReminders.uncheck();
    const saved = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' && r.url().includes(`/app/signups/${signupId}/settings`),
    );
    await save.click();
    await saved;
    await expect(save).toBeEnabled();

    await expect(sendReminders).not.toBeChecked();
    await expect(select).toHaveValue('date');
  });
});
