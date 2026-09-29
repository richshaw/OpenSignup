import { expect, test } from '@playwright/test';
import { loginAsSeededOrganizer } from './helpers/auth';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };
const CHOICES = ['Option 1', 'Option 2', 'Option 3', 'Option 4'];

/**
 * A List field's picker in the builder's slot editor. Two bugs kept organizers
 * from adding a choice here, and jsdom can show neither: the slot group cut
 * the menu off at its bottom edge, so "Add to list" could not be clicked, and
 * a <label> around the picker passed each click inside the menu back to the
 * picker's trigger, which reopened the menu after a pick and closed the new
 * item box as soon as it opened. The slot is the last in its group, where the
 * menu hangs furthest past the group's edge.
 *
 * Viewports are set per test, not left to the project, because CI runs
 * `--project=chromium` only.
 */
test.describe('list field picker', () => {
  test.beforeEach(async ({ context }) => {
    await loginAsSeededOrganizer(context);
  });

  for (const [name, viewport] of [
    ['desktop', DESKTOP],
    ['phone', PHONE],
  ] as const) {
    test(`adds and picks a choice from the last slot in a group, on ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport);

      // A fresh signup per run: the default template's empty slot, then a
      // second slot below it, and a List field with enough choices that the
      // menu reaches past the group's edge on a phone too.
      const created = await page.request.post('/api/signups', {
        data: {
          title: `List picker ${Date.now()}`,
          description: '',
          tags: [],
          visibility: 'unlisted',
          settings: {},
        },
      });
      expect(created.ok()).toBe(true);
      const signupId = (await created.json()).data.id as string;
      const field = await page.request.post(`/api/signups/${signupId}/fields`, {
        data: {
          ref: 'kind',
          label: 'Kind',
          fieldType: 'enum',
          config: { fieldType: 'enum', choices: CHOICES },
        },
      });
      expect(field.ok()).toBe(true);
      const slot = await page.request.post(`/api/signups/${signupId}/slots`, {
        data: { capacity: 1, values: { what: 'Juice' } },
      });
      expect(slot.ok()).toBe(true);

      await page.goto(`/app/signups/${signupId}/build`);
      await page.getByRole('button', { name: 'Edit slot — Juice' }).click();

      const trigger = page.getByRole('button', { name: 'Kind value' });
      const menu = page.getByRole('listbox', { name: 'Kind value' });

      // Picking an option closes the menu and shows the pick.
      await trigger.click();
      await menu.getByRole('option', { name: 'Option 1' }).click();
      await expect(menu).toBeHidden();
      await expect(trigger).toHaveText('Option 1');

      // The menu hangs past the group's bottom edge, and nothing may cut it
      // off. Checked directly, because a click can't tell: before clicking,
      // Playwright scrolls a clipped button into view inside the box that
      // clips it, which an organizer cannot do.
      await trigger.click();
      await expect(menu).toBeVisible();
      const clippedBy = await menu.evaluate((el) => {
        const box = el.getBoundingClientRect();
        for (let a = el.parentElement; a; a = a.parentElement) {
          if (getComputedStyle(a).overflowY === 'visible') continue;
          const r = a.getBoundingClientRect();
          if (box.top < r.top || box.bottom > r.bottom) return a.className || a.tagName;
        }
        return null;
      });
      expect(clippedBy, 'an ancestor clips the menu').toBeNull();

      // "Add to list" opens a box for the new item.
      await menu.getByRole('button', { name: 'Add to list' }).click();
      const fieldSaved = page.waitForResponse(
        (r) => r.request().method() === 'PATCH' && r.url().includes(`/api/signups/${signupId}/fields/`),
      );
      await page.getByRole('textbox', { name: 'New option name' }).fill('Snacks');
      await page.keyboard.press('Enter');
      expect((await fieldSaved).ok()).toBe(true);
      await expect(menu).toBeHidden();
      await expect(trigger).toHaveText('Snacks');

      const fields = await page.request.get(`/api/signups/${signupId}/fields`);
      const kind = ((await fields.json()).data as { ref: string; config: { choices?: string[] } }[]).find(
        (f) => f.ref === 'kind',
      );
      expect(kind?.config.choices).toEqual([...CHOICES, 'Snacks']);
    });
  }
});
