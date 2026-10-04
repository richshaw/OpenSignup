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
      data: {
        settings: {
          sendReminders: boolean;
          reminderFromFieldRef?: string;
          groupByFieldRefs: string[];
        };
      };
    };
    return body.data.settings;
  }

  // A fresh signup per test so retries and projects never compete over one row.
  // createSignup applies DEFAULT_TEMPLATE — fields `what` (text) and `date`
  // (date) — and anchors reminders on `date` from the start.
  async function createSignup(page: Page, title: string): Promise<string> {
    const created = await page.request.post('/api/signups', {
      data: {
        title: `${title} ${Date.now()}`,
        description: '',
        tags: [],
        visibility: 'unlisted',
        settings: {},
      },
    });
    expect(created.ok()).toBe(true);
    return (await created.json()).data.id as string;
  }

  test('the date field editor switches reminders off and on; a second date field is blocked', async ({
    page,
  }) => {
    const signupId = await createSignup(page, 'Reminder field');
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

  test('a group-by save keeps reminders switched off elsewhere off, and shows them off', async ({
    page,
  }) => {
    const signupId = await createSignup(page, 'Settings merge');

    await page.goto(`/app/signups/${signupId}/build`);
    await page.getByRole('button', { name: 'Fields (2)' }).click();
    const dialog = page.getByRole('dialog');
    const bell = dialog.getByLabel(BELL);
    await expect(bell).toBeVisible();

    // Reminders go off somewhere else (another tab, an AI assistant) while
    // this Build tab stays open. It has not heard, so its bell stays.
    const elsewhere = await page.request.patch(`/api/signups/${signupId}`, {
      data: { settings: { sendReminders: false } },
    });
    expect(elsewhere.ok()).toBe(true);
    await expect(bell).toBeVisible();

    // Save the other control on this tab.
    const saved = page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && r.url().endsWith(`/api/signups/${signupId}`),
    );
    await dialog.getByRole('button', { name: 'Don’t group' }).click();
    await dialog
      .getByRole('listbox', { name: 'Group slots by' })
      .getByRole('option', { name: 'Date' })
      .click();
    expect((await saved).ok()).toBe(true);

    // The save sent only the group-by, so reminders stay off, and the tab
    // now shows what the server holds: no bell, an unticked box.
    await expect(bell).toHaveCount(0);
    // In the fields list: the group-by picker is now a "Date" button too.
    await dialog
      .getByTestId(/^fields-row-/)
      .getByRole('button', { name: 'Date', exact: true })
      .click();
    await expect(dialog.getByRole('checkbox', { name: CHECKBOX })).not.toBeChecked();
    expect(await settingsOf(page, signupId)).toMatchObject({
      sendReminders: false,
      reminderFromFieldRef: 'date',
      groupByFieldRefs: ['date'],
    });
  });
});
