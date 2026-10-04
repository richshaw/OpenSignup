import { expect, test, type Page } from '@playwright/test';
import { CANCELLED_PAGE } from '@/app/s/[slug]/cancelled-message';
import { GONE_PAGE } from '@/app/s/[slug]/gone-message';
import { loginAsSeededOrganizer } from './helpers/auth';
import { loadSeed } from './helpers/fixtures';

const seed = loadSeed();

/**
 * A fresh published signup with these slots, made as the seeded organizer, so
 * a test can move, cancel and close without touching anyone else's state.
 */
async function freshSignup(page: Page, title: string, slotNames: string[]) {
  await loginAsSeededOrganizer(page.context());
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
  const { id, slug } = (await created.json()).data as { id: string; slug: string };
  const slotIds: string[] = [];
  for (const what of slotNames) {
    const added = await page.request.post(`/api/signups/${id}/slots`, {
      data: { capacity: 5, values: { what } },
    });
    expect(added.ok()).toBe(true);
    slotIds.push((await added.json()).data.id as string);
  }
  expect((await page.request.post(`/api/signups/${id}/publish`)).ok()).toBe(true);
  return { id, slug, slotIds };
}

/** Signs up on a slot through the API, as the sign-up dialog does. */
async function signUp(page: Page, slotId: string) {
  const created = await page.request.post(`/api/slots/${slotId}/commitments`, {
    data: { name: 'Pat Example', email: `pat+${Date.now()}@example.test`, quantity: 1 },
  });
  expect(created.ok()).toBe(true);
  const { commitment, editToken, editUrl } = (await created.json()).data as {
    commitment: { id: string };
    editToken: string;
    editUrl: string;
  };
  return {
    id: commitment.id,
    api: `/api/commitments/${commitment.id}?token=${editToken}`,
    editUrl,
  };
}

test.describe('token-gated commitment editing', () => {
  test('participant edits notes, cancels, then finds the link says so', async ({ page }) => {
    // Own state per attempt: commit via the API so projects and retries never
    // edit/cancel the same commitment twice.
    const name = 'Casey Editor';
    const created = await page.request.post(`/api/slots/${seed.editSlotId}/commitments`, {
      data: { name, email: `casey+${Date.now()}@example.test`, quantity: 1 },
    });
    expect(created.ok()).toBe(true);
    const editUrl = (await created.json()).data.editUrl as string;

    await page.goto(editUrl);
    await expect(page.getByRole('heading', { name: 'Your signup' })).toBeVisible();
    await expect(page.getByLabel('Name')).toHaveValue(name);

    await page.getByLabel('Notes').fill('Bringing plates');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status')).toHaveText('Saved.');

    // Two-step cancel: confirm dialog, then redirect back to the public page.
    await page.getByRole('button', { name: 'Cancel signup' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Confirm cancellation' })).toBeVisible();
    await page.getByRole('button', { name: 'Yes, cancel' }).click();
    await expect(page).toHaveURL(new RegExp(`/s/${seed.editSlug}$`));

    // The link in the confirmation email never changes. Followed again, it
    // says the sign-up was cancelled instead of offering a form that fails.
    await page.goto(editUrl);
    await expect(page.getByRole('heading', { name: CANCELLED_PAGE.open.title })).toBeVisible();
    await expect(page.getByText(CANCELLED_PAGE.open.body)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to the signup' })).toHaveAttribute(
      'href',
      `/s/${seed.editSlug}`,
    );
    await expect(page.getByLabel('Name')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cancel signup' })).toHaveCount(0);

    // Only the right token learns that: a wrong one still gets the page a
    // live sign-up's wrong token gets.
    const wrong = await page.goto(editUrl.replace(/token=[^&]+/, 'token=invalid-token'));
    expect(wrong?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: GONE_PAGE.editLink.title })).toBeVisible();
    await expect(page.getByText(CANCELLED_PAGE.open.title)).toHaveCount(0);
  });

  // Cancelled in another tab while this one was open: the save is refused,
  // and the page reloads as the cancelled page rather than leave a dead form.
  test('a save after a cancel elsewhere turns the page into the cancelled one', async ({
    page,
  }) => {
    const mine = await signUp(page, seed.editSlotId);
    await page.goto(mine.editUrl);
    await expect(page.getByRole('heading', { name: 'Your signup' })).toBeVisible();
    expect((await page.request.delete(mine.api)).ok()).toBe(true);

    await page.getByLabel('Notes').fill('Bringing cups');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: CANCELLED_PAGE.open.title })).toBeVisible();
    await expect(page.getByLabel('Notes')).toHaveCount(0);
    await expect(page.getByText('not active')).toHaveCount(0);
  });

  test('a moved sign-up’s old link leads to the sign-up it moved to', async ({ page }) => {
    const signup = await freshSignup(page, 'Move flow', ['Morning', 'Afternoon']);
    const first = await signUp(page, signup.slotIds[0]!);
    const move = await page.request.patch(first.api, {
      data: { swapToSlotId: signup.slotIds[1] },
    });
    expect(move.ok()).toBe(true);
    const movedTo = (await move.json()).data.id as string;

    // Still signed up, so not "cancelled", and nothing inviting a second sign-up.
    await page.goto(first.editUrl);
    await expect(page.getByRole('heading', { name: CANCELLED_PAGE.moved.title })).toBeVisible();
    await expect(page.getByText(CANCELLED_PAGE.moved.body)).toBeVisible();
    await expect(page.getByText(CANCELLED_PAGE.open.title)).toHaveCount(0);
    await page.getByRole('link', { name: 'See your sign-up' }).click();
    await expect(page).toHaveURL(new RegExp(`/s/${signup.slug}/c/${movedTo}\\?token=`));
    await expect(page.getByRole('heading', { name: 'Your signup' })).toBeVisible();

    // Once the sign-up it moved to is cancelled too, the old link says so.
    await page.getByRole('button', { name: 'Cancel signup' }).click();
    await page.getByRole('button', { name: 'Yes, cancel' }).click();
    await expect(page).toHaveURL(new RegExp(`/s/${signup.slug}$`));
    await page.goto(first.editUrl);
    await expect(page.getByRole('heading', { name: CANCELLED_PAGE.open.title })).toBeVisible();
    await expect(page.getByText(CANCELLED_PAGE.open.body)).toBeVisible();
  });

  test('a cancelled sign-up’s link does not suggest signing up again once closed', async ({
    page,
  }) => {
    const signup = await freshSignup(page, 'Closed after cancel', ['Morning']);
    const mine = await signUp(page, signup.slotIds[0]!);
    expect((await page.request.delete(mine.api)).ok()).toBe(true);
    expect((await page.request.post(`/api/signups/${signup.id}/close`)).ok()).toBe(true);

    await page.goto(mine.editUrl);
    await expect(page.getByRole('heading', { name: CANCELLED_PAGE.closed.title })).toBeVisible();
    await expect(page.getByText(CANCELLED_PAGE.closed.body)).toBeVisible();
    await expect(page.getByText(/sign up again/)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Back to the signup' })).toHaveAttribute(
      'href',
      `/s/${signup.slug}`,
    );
  });

  // The token alone finds the sign-up, so the slug in the link could be any
  // signup's. Left as it was, the back link would lead there.
  test('an edit link with another signup’s slug goes to its own', async ({ page }) => {
    const path = `c/${seed.editCommitmentId}?token=${seed.editToken}`;
    await page.goto(`/s/${seed.publicSlug}/${path}`);
    const url = new URL(page.url());
    expect(`${url.pathname}${url.search}`).toBe(`/s/${seed.editSlug}/${path}`);
    await expect(page.getByRole('heading', { name: 'Your signup' })).toBeVisible();
    await expect(page.getByRole('link', { name: '← Back to signup' })).toHaveAttribute(
      'href',
      `/s/${seed.editSlug}`,
    );
  });
});
