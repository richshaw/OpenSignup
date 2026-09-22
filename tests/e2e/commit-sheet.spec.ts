import { expect, test } from '@playwright/test';
import { loadSeed } from './helpers/fixtures';

const seed = loadSeed();

// Short enough that the seeded signup overflows it with room to spare. The
// seed is only a couple of slots tall, and at 500px it overflowed by 93px —
// so the first scroll landed at the very bottom, and "the page did not move"
// held whether or not anything was locked. The `room` guard below is what
// keeps that from silently coming back.
const PHONE = { width: 390, height: 400 };
const RESTING_OFFSET = 50;

/**
 * What the commit sheet exists to get right, measured in a real browser.
 *
 * The jsdom tests assert `data-scroll-locked` on the body. That is the
 * attribute react-remove-scroll happens to set, not the effect anyone cares
 * about, and jsdom computes no layout and does not scroll, so it cannot tell
 * whether the page actually stayed put. Staying put is the whole bug: on a
 * phone the slot list used to carry on scrolling under the open sheet, so the
 * row you had just tapped slid away while you were filling the form in.
 *
 * Viewport is set per test rather than left to the project, because CI runs
 * `--project=chromium` only — see the same note in slot-row-layout.spec.ts.
 */
test.describe('commit sheet on a phone', () => {
  test('holds the page still while open, and releases it on close', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(`/s/${seed.publicSlug}`);

    const overflows = await page.evaluate(
      () => document.documentElement.scrollHeight > window.innerHeight,
    );
    expect(overflows, 'the seeded page must overflow the viewport to be scrollable').toBe(true);

    // Scroll away from the top, so a position that is silently lost shows up.
    await page.mouse.wheel(0, RESTING_OFFSET);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    const resting = await page.evaluate(() => window.scrollY);

    // There has to be somewhere further to go, or "it did not move" below is
    // true by default and this test proves nothing.
    const room = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight - window.scrollY,
    );
    expect(room, 'needs room below to scroll into, or the lock assertion is vacuous').toBeGreaterThan(
      RESTING_OFFSET,
    );

    const row = page.locator('li').filter({ hasText: seed.openSlotLabel });
    await row.getByRole('button', { name: 'Sign up' }).click();
    // Waits on the form rather than the dialog role, so that the scroll
    // assertion below is what fails if the sheet stops locking — not an
    // earlier assertion about how the sheet is built.
    await expect(page.getByLabel('Your name')).toBeVisible();

    // The regression this guards: before the sheet was a real modal, this
    // wheel scrolled the list out from under it.
    await page.mouse.wheel(0, 600);
    // A fixed wait, deliberately. `expect.poll(...).toBe(resting)` looks
    // tidier and is worthless here: it passes on its first sample, taken
    // before the wheel has been applied, so it cannot catch a page that does
    // move. Asserting that nothing happened means giving it time to happen.
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.scrollY), 'page must not scroll behind the sheet').toBe(
      resting,
    );
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');

    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Released, and the participant is left where they were reading.
    expect(await page.evaluate(() => window.scrollY)).toBe(resting);
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
    // Scrolled back up, not further down: the seeded page is short, so
    // `resting` is already its last scroll position and there is no room
    // below it to prove anything with.
    await page.mouse.wheel(0, -150);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(resting);
  });
});
