/**
 * Walkthrough for the help article "Close or reopen a signup"
 * (src/help/articles/close-or-reopen-a-signup.tsx). It follows the article's
 * steps by the same on-screen names, on a computer and on a phone, so a
 * renamed or moved control fails here and points at the article. With
 * HELP_SCREENSHOTS=1 (`pnpm help:screenshots`) the computer's run also
 * refreshes the article's pictures.
 */
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { UI } from '@/help/articles/close-or-reopen-a-signup.ui';
import { loginAsSeededOrganizer } from '../helpers/auth';
import { createPublishedSignup } from '../helpers/signups';

const SLUG = 'close-or-reopen-a-signup';
const CAPTURE = process.env.HELP_SCREENSHOTS === '1';
const SHOT_DIR = `public/help/${SLUG}`;
const TITLE = 'Snack duty — Spring season';

type Pad = number | { top: number; right: number; bottom: number; left: number };

/**
 * The part of the page that holds every one of `targets`, with `pad` pixels
 * of the page around it (the same on every side, or each side's own), in
 * whole pixels, so the file is exactly twice the size the article gives.
 */
async function shot(page: Page, targets: Locator[], name: string, pad: Pad = 16): Promise<void> {
  if (!CAPTURE) return;
  const around = typeof pad === 'number' ? { top: pad, right: pad, bottom: pad, left: pad } : pad;
  // Fonts and focus settle after the last action.
  await page.waitForTimeout(300);
  const boxes = await Promise.all(targets.map((target) => target.boundingBox()));
  const found = boxes.filter((box) => box !== null);
  if (found.length !== targets.length) throw new Error(`${name}: not on the page`);
  const x = Math.floor(Math.min(...found.map((b) => b.x))) - around.left;
  const y = Math.floor(Math.min(...found.map((b) => b.y))) - around.top;
  const right = Math.ceil(Math.max(...found.map((b) => b.x + b.width))) + around.right;
  const bottom = Math.ceil(Math.max(...found.map((b) => b.y + b.height))) + around.bottom;
  await page.screenshot({
    path: `${SHOT_DIR}/${name}.png`,
    clip: { x, y, width: right - x, height: bottom - y },
    animations: 'disabled',
  });
}

/**
 * The signup the pictures show, published: two slots of two spots each. A new
 * signup starts with an empty slot, which goes, so people's page shows only
 * these two.
 */
async function snackDuty(request: APIRequestContext) {
  const signup = await createPublishedSignup(request, {
    title: TITLE,
    slot: { values: { what: 'Fruit and water', date: '2030-04-06' }, capacity: 2 },
  });
  const listed = await request.get(`/api/signups/${signup.id}/slots`);
  expect(listed.ok()).toBe(true);
  const slots = (await listed.json()).data as { id: string; values: { what?: string } }[];
  for (const empty of slots.filter((slot) => !slot.values.what)) {
    expect((await request.delete(`/api/slots/${empty.id}`)).ok()).toBe(true);
  }
  const added = await request.post(`/api/signups/${signup.id}/slots`, {
    data: { values: { what: 'Orange slices', date: '2030-04-13' }, capacity: 2 },
  });
  expect(added.ok()).toBe(true);
  const fruit = slots.find((slot) => slot.values.what === 'Fruit and water');
  if (!fruit) throw new Error('the signup should have its Fruit and water slot');
  return { ...signup, fruitId: fruit.id };
}

/** "On the Your signups page, choose your signup." */
async function chooseFromYourSignups(page: Page, id: string): Promise<void> {
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: UI.yourSignups })).toBeVisible();
  // Every run makes a signup with this title, so this one is found by where it goes.
  await page.locator(`a[href="/app/signups/${id}"]`).click();
  await page.waitForURL(new RegExp(`/app/signups/${id}/build$`));
}

test.describe('help: close or reopen a signup', () => {
  // Screenshots at 2x so text stays sharp; the article sizes them in CSS pixels.
  test.use({ deviceScaleFactor: 2 });

  test('the steps work as written', async ({ page, context, browser, isMobile }) => {
    test.skip(isMobile, 'the phone path is its own test below');
    await loginAsSeededOrganizer(context);
    const signup = await snackDuty(page.request);
    const stored = async () =>
      (await (await page.request.get(`/api/signups/${signup.id}`)).json()).data as {
        status: string;
        closesAt: string | null;
      };

    // Sam signs up from a browser of their own, so the question says they keep their spot.
    const participant = await browser.newContext();
    try {
      const sam = await participant.newPage();
      const committed = await sam.request.post(`/api/slots/${signup.fruitId}/commitments`, {
        // An address of its own, from the range kept for documentation (RFC
        // 5737), so this sign-up doesn't count against the per-IP limit the
        // other specs' sign-ups share.
        headers: { 'x-forwarded-for': '203.0.113.80' },
        data: { name: 'Sam Example', email: `sam+${Date.now()}@example.test`, quantity: 1 },
      });
      expect(committed.ok()).toBe(true);
      const editUrl = (await committed.json()).data.editUrl as string;

      // Close your signup
      await chooseFromYourSignups(page, signup.id);
      const pill = (status: string) =>
        page.getByText(status, { exact: true }).locator('visible=true');
      const link = page
        .locator('span.font-mono')
        .filter({ hasText: `/s/${signup.slug}` })
        .locator('visible=true');
      await expect(link).toHaveText(new RegExp(`/s/${signup.slug}$`));
      const before = await link.textContent();
      await expect(pill(UI.open)).toBeVisible();

      // "the three dots next to Share"
      const more = page.getByRole('button', { name: UI.moreActions });
      const share = page.getByRole('button', { name: UI.share, exact: true });
      await expect(more).toBeVisible();
      await expect(share).toBeVisible();
      const [moreBox, shareBox] = await Promise.all([more.boundingBox(), share.boundingBox()]);
      if (!moreBox || !shareBox) throw new Error('Share and the three dots should be on screen');
      const gap = moreBox.x - (shareBox.x + shareBox.width);
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThan(16);

      await more.click();
      const panel = page.getByRole('dialog', { name: UI.moreActions });
      await panel.getByRole('button', { name: UI.closeSignup }).click();
      // How many spots are taken or still open, and that nobody can sign up
      // until it's reopened. Sam has one of Fruit and water's two spots.
      const message = panel.getByRole('group');
      await expect(message).toContainText('3 of 4 spots are still open.');
      await expect(message).toContainText('People can’t sign up until you reopen it.');
      // Not yet leaves it open.
      await panel.getByRole('button', { name: UI.notYet }).click();
      await expect(panel).toBeHidden();
      await expect(pill(UI.open)).toBeVisible();
      expect((await stored()).status).toBe('open');

      await more.click();
      await panel.getByRole('button', { name: UI.closeSignup }).click();
      const closeNow = message.getByRole('button', { name: UI.closeSignup });
      await expect(closeNow).toBeVisible();
      if (CAPTURE) {
        // No focus ring on Not yet in the picture.
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        // Flush with the panel's left and bottom edges: the page under it
        // shows there otherwise.
        await shot(page, [more, panel], 'close-question', {
          top: 16,
          right: 16,
          bottom: 0,
          left: 0,
        });
      }
      await closeNow.click();

      // While it's closed: "Right after you close it, a grey box under its
      // title says Signup closed."
      const banner = page.getByText(UI.signupClosed, { exact: true });
      await expect(pill(UI.closed)).toBeVisible();
      await expect(banner).toBeVisible();
      await expect(more).toHaveCount(0);
      expect((await stored()).status).toBe('closed');
      // "marked closed at the top of the page", on every tab
      for (const tab of ['Responses', 'Settings', 'Build']) {
        await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
        await page.waitForURL(new RegExp(`/${tab.toLowerCase()}$`));
        await expect(pill(UI.closed)).toBeVisible();
      }
      // "the link stays the same"
      await expect(link).toHaveText(before ?? '');

      // People who open the link see Closed at the top and on each slot that
      // isn't full (neither is), and can't sign up. A browser of its own,
      // which has signed up for nothing.
      const visitor = await browser.newPage({ deviceScaleFactor: 2 });
      try {
        await visitor.goto(`/s/${signup.slug}`);
        await expect(visitor.getByRole('heading', { name: TITLE })).toBeVisible();
        const closedBox = visitor
          .getByRole('status')
          .filter({ hasText: 'This signup is no longer collecting responses.' });
        await expect(closedBox.getByText(UI.closedForPeople, { exact: true })).toBeVisible();
        const rows = visitor.locator('li').filter({ hasText: /Fruit and water|Orange slices/ });
        await expect(rows).toHaveCount(2);
        for (const row of await rows.all()) {
          await expect(row.getByText(UI.closedForPeople, { exact: true })).toBeVisible();
        }
        await expect(visitor.getByRole('button', { name: /^Sign up/ })).toHaveCount(0);
        await shot(visitor, [closedBox, rows.last()], 'what-people-see');
      } finally {
        await visitor.close();
      }

      // Sam keeps their spot, and their link still changes or cancels it,
      // but takes no more spots.
      await sam.goto(editUrl);
      await expect(sam.getByRole('heading', { name: 'Your spot' })).toBeVisible();
      await expect(
        sam.getByText(
          "You can't add more spots now, but you can still change your details, give spots back, or cancel.",
        ),
      ).toBeVisible();

      // Reopen your signup. An AI assistant gave it a closing time, which has
      // passed: reopening removes it.
      const passed = await page.request.patch(`/api/signups/${signup.id}`, {
        data: { closesAt: '2020-01-01T00:00:00.000Z' },
      });
      expect(passed.ok(), await passed.text()).toBe(true);
      await chooseFromYourSignups(page, signup.id);
      const reopen = page.getByRole('button', { name: UI.reopenSignup });
      const preview = page.getByRole('link', { name: UI.preview }).locator('visible=true');
      // Coming back to it later, the box has gone, and the top of the page
      // says it's closed.
      await expect(pill(UI.closed)).toBeVisible();
      await expect(banner).toHaveCount(0);
      await expect(reopen).toBeVisible();
      // "At the top of the page, choose Reopen signup, next to Preview."
      const [previewBox, reopenBox] = await Promise.all([
        preview.boundingBox(),
        reopen.boundingBox(),
      ]);
      if (!previewBox || !reopenBox)
        throw new Error('Preview and Reopen signup should be on screen');
      const reopenGap = reopenBox.x - (previewBox.x + previewBox.width);
      expect(reopenGap).toBeGreaterThanOrEqual(0);
      expect(reopenGap).toBeLessThan(16);
      expect(reopenBox.y).toBeLessThan(150);
      await shot(page, [preview, reopen], 'reopen-button');
      await reopen.click();

      await expect(banner).toHaveCount(0);
      await expect(pill(UI.open)).toBeVisible();
      await expect(more).toBeVisible();
      await expect(link).toHaveText(before ?? '');
      const after = await stored();
      expect(after.status).toBe('open');
      expect(after.closesAt).toBeNull();

      // People can sign up again, at the same link.
      const again = await browser.newPage();
      try {
        await again.goto(`/s/${signup.slug}`);
        await expect(again.getByText(UI.closedForPeople, { exact: true })).toHaveCount(0);
        await expect(again.getByRole('button', { name: /^Sign up for/ })).toHaveCount(2);
      } finally {
        await again.close();
      }
    } finally {
      await participant.close();
    }
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('the three dots are next to the title, and Reopen signup is behind them', async ({
      page,
      context,
    }) => {
      await loginAsSeededOrganizer(context);
      const signup = await snackDuty(page.request);

      // Close your signup
      await chooseFromYourSignups(page, signup.id);
      const title = page.getByRole('heading', { level: 1, name: TITLE });
      const more = page.getByRole('button', { name: UI.moreActions });
      await expect(title).toBeVisible();
      await expect(more).toBeVisible();
      const [titleBox, moreBox] = await Promise.all([title.boundingBox(), more.boundingBox()]);
      if (!titleBox || !moreBox)
        throw new Error('the title and the three dots should be on screen');
      // Beside the title, at the top, rather than next to Share at the bottom.
      expect(moreBox.x).toBeGreaterThanOrEqual(titleBox.x + titleBox.width - 1);
      expect(moreBox.y).toBeLessThan(titleBox.y + titleBox.height);
      const share = page.getByRole('button', { name: UI.share, exact: true });
      await expect(share).toBeVisible();
      const shareBox = await share.boundingBox();
      expect(shareBox?.y ?? 0).toBeGreaterThan((page.viewportSize()?.height ?? 0) / 2);

      await more.click();
      // On a phone the three dots open a sheet, named after the signup.
      const sheet = page.getByRole('dialog', { name: TITLE });
      await sheet.getByRole('button', { name: UI.closeSignup }).click();
      await expect(
        sheet.getByRole('group', { name: /People can’t sign up until you reopen it\.$/ }),
      ).toBeVisible();
      await expect(sheet.getByRole('button', { name: UI.notYet })).toBeVisible();
      await sheet.getByRole('button', { name: UI.closeSignup }).click();

      // While it's closed
      await expect(sheet).toBeHidden();
      await expect(
        page.getByText(UI.closed, { exact: true }).locator('visible=true'),
      ).toBeVisible();
      const banner = page.getByText(UI.signupClosed, { exact: true });
      await expect(banner).toBeVisible();

      // Reopen your signup: "On a phone, choose the three dots next to your
      // signup's title first." They stay once it's closed.
      await expect(more).toBeVisible();
      await more.click();
      await expect(sheet.getByRole('link', { name: UI.preview })).toBeVisible();
      await expect(sheet.getByRole('button', { name: UI.closeSignup })).toHaveCount(0);
      await sheet.getByRole('button', { name: UI.reopenSignup }).click();
      await expect(sheet).toBeHidden();
      await expect(banner).toHaveCount(0);
      await expect(page.getByText(UI.open, { exact: true }).locator('visible=true')).toBeVisible();
      await expect(more).toBeVisible();
    });
  });
});
