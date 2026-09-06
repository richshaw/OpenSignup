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
      (r) =>
        r.request().method() === 'POST' && r.url().includes(`/app/signups/${signupId}/settings`),
    );
    await save.click();
    await saved;
    await expect(save).toBeEnabled();

    await expect(lead).toHaveValue('48');
    await expect(sendReminders).not.toBeChecked();
  });

  // The third control in the same form. It was left unkeyed when the two above
  // were fixed, so it should have shown the same stale value after a save. This
  // covers it directly rather than by assuming the sibling fix generalises.
  test('the reminder date field survives the post-save re-render', async ({ page }) => {
    const created = await page.request.post('/api/signups', {
      data: {
        title: `Reminder anchor ${Date.now()}`,
        description: '',
        tags: [],
        visibility: 'unlisted',
        settings: {},
      },
    });
    expect(created.ok()).toBe(true);
    const signupId = (await created.json()).data.id as string;

    await page.goto(`/app/signups/${signupId}/settings`);
    const anchor = page.locator('select[name="reminderFromFieldRef"]');
    const save = page.getByRole('button', { name: 'Save' });

    // DEFAULT_TEMPLATE's date field, and the empty option that means "pick it
    // automatically" — the state every signup starts in, since nothing writes
    // reminderFromFieldRef at creation.
    await expect(anchor).toHaveValue('');
    const dateOption = anchor.locator('option[value="date"]');
    await expect(dateOption).toHaveCount(1);

    await anchor.selectOption('date');
    const saved = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' && r.url().includes(`/app/signups/${signupId}/settings`),
    );
    await save.click();
    await saved;
    await expect(save).toBeEnabled();

    // The assertion that matters: the value as the organizer sees it right
    // after the save, before any navigation. Reloading here would pass whether
    // or not the control snapped back.
    await expect(anchor).toHaveValue('date');
  });
});
