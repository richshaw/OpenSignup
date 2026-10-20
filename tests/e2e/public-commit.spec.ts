import { expect, test } from '@playwright/test';
import { loadSeed } from './helpers/fixtures';

const seed = loadSeed();

test.describe('public commit flow', () => {
  test('participant signs up for an open slot and gets an edit link', async ({ page }) => {
    await page.goto(`/s/${seed.publicSlug}`);
    await expect(page.getByRole('heading', { name: seed.publicTitle })).toBeVisible();

    const row = page.locator('li').filter({ hasText: seed.openSlotLabel });
    await row.getByRole('button', { name: 'Sign up' }).click();

    // Unique email per attempt so CI retries don't trip the duplicate-commit
    // conflict check.
    const email = `pat+${Date.now()}@example.test`;
    await page.getByLabel('Your name').fill('Pat Tester');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByRole('heading', { name: "You're in." })).toBeVisible();
    const editLink = page.getByRole('link', {
      name: new RegExp(`/s/${seed.publicSlug}/c/`),
    });
    await expect(editLink).toBeVisible();

    // Closing the dialog refreshes; the cookie marks the row as ours.
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(row.getByRole('link', { name: 'Edit' })).toBeVisible();
  });

  test('the Email box is required where the signup asks for it', async ({ page }) => {
    await page.goto(`/s/${seed.publicSlug}`);
    const row = page.locator('li').filter({ hasText: seed.openSlotLabel });
    await row.getByRole('button', { name: 'Sign up' }).click();

    await expect(page.getByLabel('Email', { exact: true })).toHaveJSProperty('required', true);
    await expect(page.getByLabel('Email (optional)')).toHaveCount(0);
  });

  test('participant signs up with the Email box left blank where it is optional', async ({
    page,
    context,
    browserName,
  }) => {
    await page.goto(`/s/${seed.optionalEmailSlug}`);
    const row = page.locator('li').filter({ hasText: seed.optionalEmailSlotLabel });
    await row.getByRole('button', { name: 'Sign up' }).click();

    // Without an email nobody is found again, so a retry is simply another
    // participant and needs no unique detail.
    await page.getByLabel('Your name').fill('Sam Example');
    const email = page.getByLabel('Email (optional)');
    await expect(email).toHaveJSProperty('required', false);
    // The seeded slot has no date, so no reminder to promise.
    await expect(email).toHaveAccessibleDescription(
      "We'll email you your link to change or cancel. Without an email, save the link we show you after you sign up.",
    );
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByRole('heading', { name: "You're in." })).toBeVisible();
    await expect(
      page.getByText("Save this link now: we won't email it, and only this browser remembers it."),
    ).toBeVisible();
    const editLink = page.getByRole('link', {
      name: new RegExp(`/s/${seed.optionalEmailSlug}/c/`),
    });
    const editUrl = await editLink.getAttribute('href');
    expect(editUrl).toBeTruthy();
    // The <wbr> break points add nothing to what a screen reader hears.
    await expect(editLink).toHaveAccessibleName(editUrl!);

    // The link is how they change or cancel, so the screen offers to copy it
    // rather than to share it. Only Chromium lets a test grant the clipboard.
    await expect(page.getByRole('button', { name: 'Share link' })).toHaveCount(0);
    const copy = page.getByRole('button', { name: 'Copy link' });
    await expect(copy).toBeVisible();
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await copy.click();
      await expect(page.getByRole('dialog').getByRole('status')).toHaveText('Link copied.');
      // Said on the button that did it, not under Add to calendar (#408).
      await expect(
        page.getByRole('dialog').getByRole('button', { name: 'Link copied' }),
      ).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(editUrl);
    }

    await page.goto(editUrl!);
    await expect(page.getByRole('heading', { name: 'Your spot' })).toBeVisible();
    await expect(page.getByText("You're editing this as Sam Example.")).toBeVisible();
  });

  // The connection drops after the sign-up got through but before its answer
  // arrived. Pressing Confirm again must give back that sign-up, not make a
  // second one whose link nobody has (#387).
  test('a sign-up sent again after its answer was lost gets the same spot back', async ({
    page,
  }) => {
    await page.goto(`/s/${seed.optionalEmailSlug}`);
    const row = page.locator('li').filter({ hasText: seed.optionalEmailSlotLabel });
    await row.getByRole('button', { name: 'Sign up' }).click();
    await page.getByLabel('Your name').fill('Robin Example');

    // The first request reaches the server, which saves the sign-up, and the
    // browser is then told the connection failed.
    let firstId: string | undefined;
    await page.route(
      '**/api/slots/*/commitments',
      async (route) => {
        const response = await route.fetch();
        firstId = (await response.json()).data.commitment.id;
        await route.abort('failed');
      },
      { times: 1 },
    );
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('network error');
    expect(firstId).toBeTruthy();

    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByRole('heading', { name: "You're in." })).toBeVisible();
    const editUrl = await page
      .getByRole('link', { name: new RegExp(`/s/${seed.optionalEmailSlug}/c/`) })
      .getAttribute('href');
    expect(new URL(editUrl!, page.url()).pathname).toBe(
      `/s/${seed.optionalEmailSlug}/c/${firstId}`,
    );
  });

  test('full slot shows Full and no sign-up affordance', async ({ page }) => {
    await page.goto(`/s/${seed.publicSlug}`);
    const row = page.locator('li').filter({ hasText: seed.fullSlotLabel });
    await expect(row.getByText('Full')).toBeVisible();
    await expect(row.getByRole('button', { name: 'Sign up' })).toHaveCount(0);
    // A capacity-1 slot shows no counter: "0 left" would say only what "Full"
    // beside it already says. The two assertions above are what the state
    // actually means. A full slot with more spots is covered by
    // signup-view.test.tsx.
    await expect(row.getByText(/\d+ left|spots left/)).toHaveCount(0);
  });

  test('header links the instance name home and no longer says "Public signup"', async ({
    page,
  }) => {
    await page.goto(`/s/${seed.publicSlug}`);

    // The brand mark is the page's only trust signal for who is serving it, so
    // assert it is present, non-empty and points home. Its text is whatever
    // NEXT_PUBLIC_INSTANCE_NAME is set to, so match on the link, not the copy.
    const brand = page.locator('main a[href="/"]').first();
    await expect(brand).toBeVisible();
    await expect(brand).toHaveText(/\S/);

    // The removed segment. A participant arrives from a shared link, and
    // "Public" reads as "publicly listed", which this page is not — it is
    // served with robots: noindex.
    await expect(page.getByText('Public signup')).toHaveCount(0);
  });
});
