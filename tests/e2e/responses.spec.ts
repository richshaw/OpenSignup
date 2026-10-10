import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { removeRefusal } from '@/app/app/(chrome)/signups/[id]/responses/remove-refusal';
import { CANCELLED_PAGE } from '@/app/s/[slug]/cancelled-message';
import { loginAsSeededOrganizer } from './helpers/auth';

/** Each row's Remove is named for its person and slot. */
const REMOVE_SAM = 'Remove Sam Example from Fruit and water';
const QUESTION =
  'Remove Sam Example from Fruit and water? Their spot opens up for someone else. ' +
  'They won’t get an email about it.';

/**
 * A fresh published signup per test, with one single-spot slot: the test owns
 * its state, and the slot offering "Sign up" again shows the spot came back.
 */
async function createSignupWithSlot(page: Page) {
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
  return { signupId, slug, slotId };
}

/**
 * The sign-ups here come from an address of their own, from the range kept for
 * documentation (RFC 5737). The per-IP limit on signing up allows 10 a minute,
 * and every other spec's sign-ups share one bucket, so together they ran over.
 */
const SIGN_UP_HEADERS = { 'x-forwarded-for': '203.0.113.77' };

/** Signs Sam Example, or someone else, up for the slot, and returns their edit link. */
async function signUp(request: APIRequestContext, slotId: string, name = 'Sam Example') {
  const email = `${name.split(' ')[0]?.toLowerCase()}+${Date.now()}@example.test`;
  const committed = await request.post(`/api/slots/${slotId}/commitments`, {
    headers: SIGN_UP_HEADERS,
    data: { name, email, quantity: 1 },
  });
  expect(committed.ok()).toBe(true);
  return (await committed.json()).data.editUrl as string;
}

/**
 * Wholly inside the window and inside the table's scroll box, which clips
 * whatever it has scrolled out of sight.
 */
async function expectOnScreen(page: Page, target: Locator) {
  const box = await target.boundingBox();
  const frame = await page.locator('table').locator('..').boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  if (!box || !frame) throw new Error('not on the page');
  expect(box.x).toBeGreaterThanOrEqual(Math.max(0, frame.x));
  expect(box.x + box.width).toBeLessThanOrEqual(Math.min(width, frame.x + frame.width));
}

/** Wholly inside the window, with at least `margin` pixels clear on each side. */
async function expectInWindow(page: Page, target: Locator, margin: number) {
  const box = await target.boundingBox();
  const { width, height } = page.viewportSize() ?? { width: 0, height: 0 };
  if (!box) throw new Error('not on the page');
  expect(box.x).toBeGreaterThanOrEqual(margin);
  expect(box.y).toBeGreaterThanOrEqual(margin);
  expect(box.x + box.width).toBeLessThanOrEqual(width - margin);
  expect(box.y + box.height).toBeLessThanOrEqual(height - margin);
}

/** Tall enough for a thumb: 44px, the usual smallest touch target. */
async function expectTouchSize(target: Locator) {
  expect((await target.boundingBox())?.height).toBeGreaterThanOrEqual(44);
}

/** Nothing sits on top of it: the point at its centre hits it, or something in it. */
async function expectUncovered(target: Locator) {
  const hit = await target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return top !== null && el.contains(top);
  });
  expect(hit).toBe(true);
}

test.describe('Responses tab', () => {
  test('organizer removes one person and their spot opens up', async ({
    page,
    context,
    browser,
  }) => {
    await loginAsSeededOrganizer(context);
    const { signupId, slug, slotId } = await createSignupWithSlot(page);

    // The participant signs up from a browser of their own, which keeps the
    // cookie that marks their sign-up on the public page.
    const participant = await browser.newContext();
    try {
      const visitor = await participant.newPage();
      const editUrl = await signUp(visitor.request, slotId);

      await visitor.goto(`/s/${slug}`);
      const slotRow = visitor.locator('li').filter({ hasText: 'Fruit and water' });
      // Theirs: Edit in place of Sign up, and the banner.
      await expect(slotRow.getByRole('link', { name: 'Edit' })).toBeVisible();
      await expect(slotRow.getByRole('button', { name: 'Sign up' })).toHaveCount(0);
      await expect(visitor.getByText("You're signed up")).toBeVisible();
      // Their edit page stays open in another tab while they are removed.
      const form = await participant.newPage();
      await form.goto(editUrl);
      await expect(form.getByRole('heading', { name: 'Your signup' })).toBeVisible();

      await page.goto(`/app/signups/${signupId}/responses`);
      await expect(page.getByRole('tab', { name: 'Responses 1' })).toBeVisible();
      const row = page.getByRole('row').filter({ hasText: 'Sam Example' });
      const remove = row.getByRole('button', { name: REMOVE_SAM, exact: true });
      await remove.click();
      const confirm = page.getByRole('alertdialog', { name: 'Confirm removal' });
      await expect(confirm).toContainText(QUESTION);
      await expect(confirm).toHaveAccessibleDescription(QUESTION);
      await expect(confirm.getByRole('button', { name: 'Keep' })).toBeFocused();
      // Keep changes nothing, and hands focus back to Remove.
      await confirm.getByRole('button', { name: 'Keep' }).click();
      await expect(confirm).toHaveCount(0);
      await expect(row.getByRole('cell', { name: 'confirmed' })).toBeVisible();
      await expect(remove).toBeFocused();
      // So does Escape.
      await page.keyboard.press('Enter');
      await expect(confirm).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(confirm).toHaveCount(0);
      await expect(remove).toBeFocused();

      await remove.click();
      await confirm.getByRole('button', { name: 'Yes, remove' }).click();
      // Removed, not "cancelled", which is what they would do themselves.
      const status = row.getByRole('cell', { name: 'removed', exact: true });
      await expect(status).toBeVisible();
      await expect(remove).toHaveCount(0);
      // The button is gone; focus stays in the row, on what happened.
      await expect(status).toBeFocused();
      // The tab counts only the people still signed up.
      await expect(page.getByRole('tab', { name: 'Responses 0' })).toBeVisible();

      // The spot is free again, and their page no longer says it is theirs.
      await visitor.reload();
      await expect(slotRow.getByRole('button', { name: 'Sign up' })).toBeVisible();
      await expect(slotRow.getByRole('link', { name: 'Edit' })).toHaveCount(0);
      await expect(visitor.getByText("You're signed up")).toHaveCount(0);

      // Their edit link says the organizer took them off, and does not invite
      // them to sign up again.
      await visitor.goto(editUrl);
      await expect(
        visitor.getByRole('heading', { name: CANCELLED_PAGE.removed.title }),
      ).toBeVisible();
      await expect(visitor.getByText(CANCELLED_PAGE.removed.body)).toBeVisible();
      await expect(visitor.getByText(/sign up again/)).toHaveCount(0);
      await expect(visitor.getByRole('link', { name: 'Back to the signup' })).toBeVisible();

      // A save from the page left open is refused, and it reloads to say so.
      await form.getByLabel('Notes').fill('Bringing cups');
      await form.getByRole('button', { name: 'Save' }).click();
      await expect(form.getByRole('heading', { name: CANCELLED_PAGE.removed.title })).toBeVisible();
      await expect(form.getByLabel('Notes')).toHaveCount(0);
    } finally {
      await participant.close();
    }
  });

  test('the confirmation opens over the table, which keeps its size and place', async ({
    page,
    context,
  }) => {
    await loginAsSeededOrganizer(context);
    const { signupId, slotId } = await createSignupWithSlot(page);
    await signUp(page.request, slotId);
    const added = await page.request.post(`/api/signups/${signupId}/slots`, {
      data: { capacity: 1, values: { what: 'Orange slices' } },
    });
    expect(added.ok()).toBe(true);
    await signUp(page.request, (await added.json()).data.id as string, 'Alex Example');

    await page.goto(`/app/signups/${signupId}/responses`);
    const remove = page.getByRole('button', { name: REMOVE_SAM, exact: true });
    const alexRemove = page.getByRole('button', {
      name: 'Remove Alex Example from Orange slices',
      exact: true,
    });
    await expect(alexRemove).toBeVisible();
    const layout = () =>
      Promise.all([
        page.locator('table').boundingBox(),
        ...['Email', 'Slot', 'Status'].map((name) =>
          page.getByRole('columnheader', { name }).boundingBox(),
        ),
      ]);
    const before = await layout();

    await remove.click();
    const confirm = page.getByRole('alertdialog', { name: 'Confirm removal' });
    await expect(confirm).toContainText(QUESTION);
    await expect(confirm).toHaveAccessibleDescription(QUESTION);
    await expect(confirm.getByRole('button', { name: 'Keep' })).toBeFocused();
    // The table and its columns stay where they were.
    expect(await layout()).toEqual(before);
    // The rest of the page is out of reach: the point over Alex's Remove hits
    // the dialog's backdrop, not the button.
    const hit = await alexRemove.evaluate((button) => {
      const r = button.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { onButton: button.contains(top), inDialog: top?.closest('dialog')?.open === true };
    });
    expect(hit).toEqual({ onButton: false, inDialog: true });

    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    await expect(remove).toBeFocused();
  });

  test('Status says moved for the sign-up a move left behind', async ({ page, context }) => {
    await loginAsSeededOrganizer(context);
    const { signupId, slotId } = await createSignupWithSlot(page);
    const added = await page.request.post(`/api/signups/${signupId}/slots`, {
      data: { capacity: 1, values: { what: 'Orange slices' } },
    });
    expect(added.ok()).toBe(true);
    const otherSlotId = (await added.json()).data.id as string;
    const committed = await page.request.post(`/api/slots/${slotId}/commitments`, {
      headers: SIGN_UP_HEADERS,
      data: { name: 'Sam Example', email: `sam+${Date.now()}@example.test`, quantity: 1 },
    });
    expect(committed.ok()).toBe(true);
    const { commitment, editToken } = (await committed.json()).data as {
      commitment: { id: string };
      editToken: string;
    };
    const moved = await page.request.patch(
      `/api/commitments/${commitment.id}?token=${editToken}`,
      { data: { swapToSlotId: otherSlotId } },
    );
    expect(moved.ok()).toBe(true);

    await page.goto(`/app/signups/${signupId}/responses`);
    const rows = page.getByRole('row').filter({ hasText: 'Sam Example' });
    await expect(
      rows.filter({ hasText: 'Fruit and water' }).getByRole('cell', { name: 'moved', exact: true }),
    ).toBeVisible();
    await expect(
      rows
        .filter({ hasText: 'Orange slices' })
        .getByRole('cell', { name: 'confirmed', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Responses 1' })).toBeVisible();
  });

  test('Keep and Escape wait while a removal is in flight', async ({ page, context }) => {
    await loginAsSeededOrganizer(context);
    const { signupId, slotId } = await createSignupWithSlot(page);
    await signUp(page.request, slotId);

    // Hold the server action's request until the test lets it go.
    let release = () => {};
    const released = new Promise<void>((resolve) => (release = resolve));
    await page.route(`**/app/signups/${signupId}/responses`, async (route) => {
      if (route.request().method() === 'POST') await released;
      await route.continue();
    });

    await page.goto(`/app/signups/${signupId}/responses`);
    const row = page.getByRole('row').filter({ hasText: 'Sam Example' });
    await row.getByRole('button', { name: REMOVE_SAM, exact: true }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Confirm removal' });
    await confirm.getByRole('button', { name: 'Yes, remove' }).click();
    await expect(confirm.getByRole('button', { name: 'Removing…' })).toBeDisabled();
    await expect(confirm.getByRole('button', { name: 'Keep' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(confirm).toBeVisible();

    release();
    await expect(row.getByRole('cell', { name: 'removed', exact: true })).toBeFocused();
  });

  test('a refusal shows in the confirmation, and is gone when it opens again', async ({
    page,
    context,
  }) => {
    await loginAsSeededOrganizer(context);
    const { signupId, slotId } = await createSignupWithSlot(page);
    await signUp(page.request, slotId);

    await page.goto(`/app/signups/${signupId}/responses`);
    const row = page.getByRole('row').filter({ hasText: 'Sam Example' });
    await row.getByRole('button', { name: REMOVE_SAM, exact: true }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Confirm removal' });

    // The signup is deleted in another tab while the confirmation is open.
    const other = await context.newPage();
    await other.goto(`/app/signups/${signupId}/settings`);
    await other.getByRole('button', { name: 'Delete signup' }).click();
    await other.getByRole('button', { name: 'Yes, delete signup' }).click();
    await other.waitForURL(/\/app$/);
    await other.close();

    await confirm.getByRole('button', { name: 'Yes, remove' }).click();
    // In plain words, not the service's "commitment not found".
    await expect(confirm.getByRole('alert')).toHaveText(removeRefusal('not_found'));
    // Focus left the button while it was disabled; it comes back to Keep, so
    // Escape still closes the confirmation.
    await expect(confirm.getByRole('button', { name: 'Keep' })).toBeFocused();
    await page.keyboard.press('Escape');
    const remove = row.getByRole('button', { name: REMOVE_SAM, exact: true });
    await expect(remove).toBeFocused();
    await remove.click();
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole('alert')).toHaveCount(0);
  });

  test('fits a phone screen: the table scrolls, the page does not', async ({ page, context }) => {
    await loginAsSeededOrganizer(context);
    await page.setViewportSize({ width: 390, height: 844 });
    const { signupId, slotId } = await createSignupWithSlot(page);
    await signUp(page.request, slotId);
    // Someone to take off, on a slot whose name is too long for one line on a
    // phone.
    const added = await page.request.post(`/api/signups/${signupId}/slots`, {
      data: { capacity: 1, values: { what: 'Orange slices and water' } },
    });
    expect(added.ok()).toBe(true);
    await signUp(page.request, (await added.json()).data.id as string, 'Alex Example');

    await page.goto(`/app/signups/${signupId}/responses`);
    const sam = page.getByRole('row').filter({ hasText: 'Sam Example' });
    const alex = page.getByRole('row').filter({ hasText: 'Alex Example' });
    await expect(sam).toBeVisible();
    const pageFits = () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await pageFits()).toBe(true);
    const scrollBox = page.locator('table').locator('..');
    const scrollTable = (end: boolean) =>
      scrollBox.evaluate((el, end) => (el.scrollLeft = end ? el.scrollWidth : 0), end);

    // Remove is in view without scrolling the table, and big enough for a
    // thumb.
    await expectOnScreen(page, sam.getByRole('button', { name: REMOVE_SAM, exact: true }));
    await expectTouchSize(sam.getByRole('button', { name: REMOVE_SAM, exact: true }));
    const remove = alex.getByRole('button', {
      name: 'Remove Alex Example from Orange slices and water',
      exact: true,
    });
    await expectOnScreen(page, remove);
    await expectTouchSize(remove);
    // The confirmation fits the screen with room to spare on each side, and
    // its buttons are as easy to hit.
    await remove.click();
    const confirm = page.getByRole('alertdialog', { name: 'Confirm removal' });
    await expectInWindow(page, confirm, 16);
    for (const name of ['Keep', 'Yes, remove']) {
      await expectInWindow(page, confirm.getByRole('button', { name }), 16);
      await expectTouchSize(confirm.getByRole('button', { name }));
    }
    expect(await pageFits()).toBe(true);
    await confirm.getByRole('button', { name: 'Yes, remove' }).click();
    const removed = alex.getByRole('cell', { name: 'removed', exact: true });
    await expect(removed).toBeVisible();

    // Rows stay at most two lines of text high: cells keep their width and the
    // table scrolls, rather than squeezing to a word per line.
    await scrollTable(false);
    for (const row of [sam, alex]) {
      expect((await row.boundingBox())?.height).toBeLessThanOrEqual(72);
    }
    expect(await scrollBox.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    // Nothing is held over a row without Remove: at the box's right edge,
    // Alex's row shows its own cells, not an empty Actions cell.
    const frame = await scrollBox.boundingBox();
    const alexBox = await alex.boundingBox();
    if (!frame || !alexBox) throw new Error('not on the page');
    const atEdge = await alex.evaluate(
      (tr, [x, y]) => {
        const top = document.elementFromPoint(x!, y!);
        return top !== null && tr.contains(top) && !tr.lastElementChild?.contains(top);
      },
      [frame.x + frame.width - 8, alexBox.y + alexBox.height / 2],
    );
    expect(atEdge).toBe(true);

    // Scrolled to the end, every row's Slot and Status can be read, removed
    // or not, and Remove is still in view.
    await scrollTable(true);
    for (const [row, status] of [
      [sam, 'confirmed'],
      [alex, 'removed'],
    ] as const) {
      await expectUncovered(row.getByRole('cell', { name: /^What: / }));
      const statusCell = row.getByRole('cell', { name: status, exact: true });
      await expectUncovered(statusCell);
      await expectOnScreen(page, statusCell);
    }
    await expectOnScreen(page, sam.getByRole('button', { name: REMOVE_SAM, exact: true }));
    expect(await pageFits()).toBe(true);
  });
});
