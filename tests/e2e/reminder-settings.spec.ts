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

  test('lead time and the reminders toggle survive the post-save re-render', async ({ page }) => {
    // A fresh signup per run so retries and projects never compete over one row.
    // createSignup applies DEFAULT_TEMPLATE, whose date field is what makes the
    // reminders form render at all.
    const created = await page.request.post('/api/signups', {
      data: {
        title: `Reminder lead ${Date.now()}`,
        description: '',
        tags: [],
        visibility: 'unlisted',
        settings: {},
      },
    });
    expect(created.ok()).toBe(true);
    const signupId = (await created.json()).data.id as string;

    await page.goto(`/app/signups/${signupId}/settings`);
    // Addressed by name: "Send reminder" and "Send reminder emails" both match
    // a by-label lookup, and the select's accessible name absorbs its options.
    const lead = page.locator('select[name="reminderLeadHours"]');
    const sendReminders = page.locator('input[name="sendReminders"]');
    const save = page.getByRole('button', { name: 'Save' });

    await expect(lead).toHaveValue('24');
    await expect(sendReminders).toBeChecked();

    await lead.selectOption('48');
    await sendReminders.uncheck();
    const saved = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes(`/app/signups/${signupId}/settings`),
    );
    await save.click();
    await saved;
    await expect(save).toBeEnabled();

    await expect(lead).toHaveValue('48');
    await expect(sendReminders).not.toBeChecked();
  });
});
