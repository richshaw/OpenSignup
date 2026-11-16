import { expect, test } from '@playwright/test';
import { formatSlotDate } from '@/lib/slot-label';
import { loginAsSeededOrganizer } from './helpers/auth';
import { loadSeed } from './helpers/fixtures';
import { gotoSwedish } from './helpers/swedish';

const seed = loadSeed();
const { id, slug, title, slots, noDateHeading, manyDate, editPath, unsubscribePath } = seed.swedish;

/**
 * The seeded Swedish signup (tests/e2e/helpers/seed.ts): its participants'
 * text comes from sv.json, and what only its organizers read stays English,
 * marked so, until the organizer app has other languages.
 */
test.describe('the Swedish test signup', () => {
  test('shows participants its text in Swedish', async ({ page }) => {
    await gotoSwedish(page, `/s/${slug}`);
    const main = page.locator('main');
    await expect(main.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(main.getByRole('heading', { name: noDateHeading })).toBeVisible();
    const row = (label: string) => main.locator('li').filter({ hasText: label });
    await expect(row(slots.one).getByRole('button', { name: /^Anmäl dig till / })).toHaveText(
      'Anmäl dig',
    );
    await expect(row(slots.full)).toContainText('Fullt');
    await expect(main.getByText(/Sign up|Full\b|signed up|spots left/)).toHaveCount(0);
    // Until the signup's pages get a layout of their own (#628), the page
    // around <main> stays English: <html lang> and the footer.
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('navigation', { name: 'Footer' })).toBeVisible();
  });

  test('keeps its organizer’s strip English, marked lang="en"', async ({ page, context }) => {
    await loginAsSeededOrganizer(context);
    await gotoSwedish(page, `/s/${slug}`);
    const strip = page.getByRole('navigation', { name: 'Organizer' });
    await expect(strip).toHaveAttribute('lang', 'en');
    await expect(strip).toContainText('Your signup. Only organizers see this bar.');
    await expect(strip.getByRole('link', { name: 'See responses' })).toBeVisible();
    await expect(strip.getByRole('link', { name: 'Edit signup' })).toBeVisible();
  });

  test('keeps the Preview banner English, marked lang="en", over a Swedish page', async ({
    page,
    context,
  }) => {
    await loginAsSeededOrganizer(context);
    await gotoSwedish(page, `/app/signups/${id}/preview`);
    const banner = page.locator('main [lang="en"]');
    await expect(banner).toContainText('Preview');
    await expect(banner).toContainText(
      'This signup is live. The page below shows what visitors see.',
    );
    // The disabled button is the participants', with the organizer's tip.
    const button = page
      .locator('li')
      .filter({ hasText: slots.one })
      .getByRole('button', { name: /^Anmäl dig till / });
    await expect(button).toBeDisabled();
    await expect(button).toHaveText('Anmäl dig');
    await expect(button).toHaveAttribute('title', 'Preview: publish to enable signups');
  });

  // A sign-up's own pages take the signup's language from the row their link
  // reads. Their words stay English until #630 moves them to the catalog, but
  // the slot's date is already the signup's.
  test('reads a sign-up’s slot date in Swedish on its edit page', async ({ page }) => {
    await gotoSwedish(page, editPath);
    await expect(page.locator('main')).toContainText(
      `${slots.many} · ${formatSlotDate(manyDate, 'sv')}`,
    );
  });

  test('marks the unsubscribe page as Swedish', async ({ page }) => {
    await gotoSwedish(page, unsubscribePath);
    await expect(page.locator('main')).toContainText(title);
  });
});
