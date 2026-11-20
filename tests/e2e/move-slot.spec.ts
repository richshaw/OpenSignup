import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { loginAsSeededOrganizer } from './helpers/auth';

/**
 * Move up and Move down in a slot's editor reorder slots without dragging, so
 * a keyboard or screen-reader user can do it too. They move a slot inside its
 * group, keep focus on the button pressed (a move down re-inserts the
 * editor's node), and save as a drag does.
 */
test.describe('moving a slot from its editor', () => {
  test.beforeEach(async ({ context }) => {
    await loginAsSeededOrganizer(context);
  });

  const DAY = '2030-04-06';
  const OTHER_DAY = '2030-04-07';

  async function post(request: APIRequestContext, url: string, data: unknown) {
    const res = await request.post(url, { data });
    expect(res.ok(), `${url}: ${await res.text()}`).toBe(true);
    return (await res.json()).data as { id: string };
  }

  /**
   * A draft grouped by date, with three slots on one day and one on the next,
   * from the default template (`what`, `date`). Its own empty slot sits under
   * no date, last.
   */
  async function createSignup(request: APIRequestContext): Promise<string> {
    const signup = await post(request, '/api/signups', {
      title: `Move slots ${Date.now()}`,
      description: '',
      tags: [],
      visibility: 'unlisted',
      settings: { groupByFieldRefs: ['date'] },
    });
    for (const [what, date] of [
      ['Apples', DAY],
      ['Bread', DAY],
      ['Cheese', DAY],
      ['Dates', OTHER_DAY],
    ]) {
      await post(request, `/api/signups/${signup.id}/slots`, {
        values: { what, date },
        capacity: 2,
      });
    }
    return signup.id;
  }

  /** The slots' `what`s in the order the server keeps them, blanks left out. */
  async function savedOrder(page: Page, signupId: string): Promise<string[]> {
    const res = await page.request.get(`/api/signups/${signupId}/slots`);
    expect(res.ok()).toBe(true);
    const slots = (await res.json()).data as { values: Record<string, unknown> }[];
    return slots.map((s) => s.values.what).filter((w): w is string => typeof w === 'string');
  }

  test('moves a slot up and down inside its day, by keyboard, and keeps it there', async ({
    page,
  }) => {
    const signupId = await createSignup(page.request);
    await page.goto(`/app/signups/${signupId}/build`);

    await page.getByRole('button', { name: /^Edit slot — Cheese,/ }).focus();
    await page.keyboard.press('Enter');
    const editor = page.getByRole('group', { name: 'Editing slot — Cheese' });
    const up = editor.getByRole('button', { name: 'Move up' });
    const down = editor.getByRole('button', { name: 'Move down' });
    const status = editor.getByRole('status');

    await up.focus();
    await page.keyboard.press('Enter');
    await expect(status).toHaveText('Moved to 2 of 3');
    await expect(up).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(status).toHaveText('Moved to 1 of 3');
    await expect(up).toHaveAttribute('aria-disabled', 'true');
    await expect
      .poll(() => savedOrder(page, signupId))
      .toEqual(['Cheese', 'Apples', 'Bread', 'Dates']);

    // At the top of its day it stays put, rather than crossing into no day.
    await page.keyboard.press('Enter');
    await expect(status).toHaveText('Already at the top');
    await expect(up).toBeFocused();

    // Down: React re-inserts the editor's node, and focus stays on the button.
    await down.focus();
    await page.keyboard.press('Enter');
    await expect(status).toHaveText('Moved to 2 of 3');
    await expect(down).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(status).toHaveText('Moved to 3 of 3');
    await expect(down).toBeFocused();
    // The last slot of its day doesn't move into the next day.
    await page.keyboard.press('Enter');
    await expect(status).toHaveText('Already at the bottom');
    await expect
      .poll(() => savedOrder(page, signupId))
      .toEqual(['Apples', 'Bread', 'Cheese', 'Dates']);

    await page.reload();
    const rows = await page.getByRole('button', { name: /^Edit slot — / }).allTextContents();
    const shown = rows.map((r) =>
      ['Apples', 'Bread', 'Cheese', 'Dates'].find((w) => r.includes(w)),
    );
    expect(shown.filter(Boolean)).toEqual(['Apples', 'Bread', 'Cheese', 'Dates']);
  });
});
