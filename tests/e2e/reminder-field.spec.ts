import { expect, test, type Page } from '@playwright/test';
import { loginAsSeededOrganizer } from './helpers/auth';

/**
 * Reminders are configured on the date field itself: the Build tab's field
 * editor carries a "Send a reminder email before this date" checkbox, one date
 * field per signup holds it, and a bell marks that field in the fields list.
 * Underneath, `settings.sendReminders` is the switch and
 * `settings.reminderFromFieldRef` the anchor every slot takes its instant from
 * — so turning reminders off must leave the anchor where it was.
 */
test.describe('reminder field', () => {
  test.beforeEach(async ({ context }) => {
    await loginAsSeededOrganizer(context);
  });

  const CHECKBOX = 'Send a reminder email before this date';
  const BELL = 'Reminders sent the day before this date';

  async function settingsOf(page: Page, signupId: string) {
    const res = await page.request.get(`/api/signups/${signupId}`);
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as {
      data: { settings: { sendReminders: boolean; reminderFromFieldRef?: string } };
    };
    return body.data.settings;
  }

  test('the date field editor switches reminders off and on; a second date field is blocked', async ({
    page,
  }) => {
    // A fresh signup per run so retries and projects never compete over one row.
    // createSignup applies DEFAULT_TEMPLATE — fields `what` (text) and `date`
    // (date) — and anchors reminders on `date` from the start.
    const created = await page.request.post('/api/signups', {
      data: {
        title: `Reminder field ${Date.now()}`,
        description: '',
        tags: [],
        visibility: 'unlisted',
        settings: {},
      },
    });
    expect(created.ok()).toBe(true);
    const signupId = (await created.json()).data.id as string;
    expect(await settingsOf(page, signupId)).toMatchObject({
      sendReminders: true,
      reminderFromFieldRef: 'date',
    });

    await page.goto(`/app/signups/${signupId}/build`);
    await page.getByRole('button', { name: 'Fields (2)' }).click();
    // Not addressed by name: Radix names the dialog after its title, which
    // reads "Fields · 2" in the list and "Edit field" / "New field" in the editor.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const bell = dialog.getByLabel(BELL);
    const checkbox = dialog.getByRole('checkbox', { name: CHECKBOX });
    const save = dialog.getByRole('button', { name: 'Save' });
    // The settings PATCH, as opposed to the field PATCH at .../fields/<id>.
    const settingsSaved = () =>
      page.waitForResponse(
        (r) => r.request().method() === 'PATCH' && r.url().endsWith(`/api/signups/${signupId}`),
      );

    // The template's date field carries the reminder.
    await expect(bell).toBeVisible();

    // Off: the bell goes, the switch flips, the anchor stays.
    await dialog.getByRole('button', { name: 'Date', exact: true }).click();
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    let saved = settingsSaved();
    await save.click();
    expect((await saved).ok()).toBe(true);
    await expect(bell).toHaveCount(0);
    expect(await settingsOf(page, signupId)).toMatchObject({
      sendReminders: false,
      reminderFromFieldRef: 'date',
    });

    // On again.
    await dialog.getByRole('button', { name: 'Date', exact: true }).click();
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    saved = settingsSaved();
    await save.click();
    expect((await saved).ok()).toBe(true);
    await expect(bell).toBeVisible();
    expect(await settingsOf(page, signupId)).toMatchObject({
      sendReminders: true,
      reminderFromFieldRef: 'date',
    });

    // A second date field cannot take the reminder while `Date` holds it.
    await dialog.getByRole('button', { name: 'Add field' }).click();
    await dialog.getByLabel('Field name').fill('Setup day');
    await dialog.getByRole('button', { name: 'Date', exact: true }).click();
    const added = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith(`/api/signups/${signupId}/fields`),
    );
    await dialog.getByRole('button', { name: 'Add field' }).click();
    expect((await added).ok()).toBe(true);

    await dialog.getByRole('button', { name: 'Setup day', exact: true }).click();
    await expect(checkbox).toBeDisabled();
    await expect(checkbox).not.toBeChecked();
    await expect(dialog.getByRole('note')).toContainText(
      'Date is already the reminder field for this signup',
    );
    // Nothing moved underneath.
    expect(await settingsOf(page, signupId)).toMatchObject({
      sendReminders: true,
      reminderFromFieldRef: 'date',
    });
  });
});
