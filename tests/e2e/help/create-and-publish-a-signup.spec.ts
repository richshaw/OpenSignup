/**
 * Walkthrough for the help article "Create and publish your first signup"
 * (src/help/articles/create-and-publish-a-signup.tsx). It follows the
 * article's steps by the same on-screen names, so a renamed or moved control
 * fails here and points at the article. With HELP_SCREENSHOTS=1
 * (`pnpm help:screenshots`) it also refreshes the article's pictures.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { UI } from '@/help/articles/create-and-publish-a-signup.ui';
import { loginAsSeededOrganizer } from '../helpers/auth';

const SLUG = 'create-and-publish-a-signup';
const CAPTURE = process.env.HELP_SCREENSHOTS === '1';
const SHOT_DIR = `public/help/${SLUG}`;

async function shot(page: Page, target: Locator, name: string): Promise<void> {
  if (!CAPTURE) return;
  // Fonts and the save indicator settle after the last action.
  await page.waitForTimeout(300);
  await target.screenshot({ path: `${SHOT_DIR}/${name}.png`, animations: 'disabled' });
}

test.describe('help: create and publish your first signup', () => {
  // Screenshots at 2x so text stays sharp; the article sizes them in CSS pixels.
  test.use({ deviceScaleFactor: 2 });

  test('the steps work as written', async ({ page, context, browser, isMobile }) => {
    test.skip(isMobile, 'the phone path is its own test below');
    await loginAsSeededOrganizer(context);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Create the signup
    await page.goto('/app');
    await expect(page.getByRole('heading', { name: UI.yourSignups })).toBeVisible();
    await page.getByRole('link', { name: UI.newSignup, exact: true }).click();
    // Sites with drafting switched on ask first; the article says to skip it.
    // Wait for either screen: isVisible() doesn't wait, and the page is still
    // loading right after the click.
    const compose = page.getByRole('heading', { name: UI.composeHeading });
    await expect(compose.or(page.getByLabel(UI.title))).toBeVisible();
    if (await compose.isVisible()) {
      await expect(page.getByRole('button', { name: UI.draftCompose })).toBeVisible();
      await page.getByRole('link', { name: UI.skipCompose }).click();
    }
    await page.getByLabel(UI.title).fill('Snack duty — Spring season');
    await expect(page.getByLabel(UI.description)).toBeVisible();
    await shot(page, page.locator('form', { has: page.getByLabel(UI.title) }), 'new-signup');
    await page.getByRole('button', { name: UI.createSignup }).click();
    await page.waitForURL(/\/build$/);
    await expect(page.getByText('draft', { exact: true }).locator('visible=true')).toBeVisible();
    // "Nobody else can see a draft": its link says it isn't ready yet.
    const draftLink = await page
      .getByRole('link', { name: 'Open public page' })
      .locator('visible=true')
      .getAttribute('href');
    const outsider = await browser.newPage();
    await outsider.goto(draftLink ?? '');
    await expect(outsider.getByText(/isn.t ready yet/)).toBeVisible();
    await outsider.close();

    // Add slots
    await page.getByText(UI.emptySlot, { exact: true }).click();
    // An open slot; only one is open at a time.
    const slotEditor = page.locator('[data-testid^="slot-editor-"]');
    await expect(slotEditor.getByText(UI.what, { exact: true })).toBeVisible();
    await expect(slotEditor.getByText(UI.date, { exact: true })).toBeVisible();
    await slotEditor.getByRole('textbox', { name: `${UI.what} value` }).fill('Fruit and water');
    await slotEditor.getByLabel(`${UI.date} value`).fill('2030-04-06');
    await slotEditor.getByRole('spinbutton', { name: UI.capacity }).fill('2');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await shot(page, slotEditor, 'slot');
    await slotEditor.getByRole('button', { name: UI.done }).click();
    await expect(page.getByRole('button', { name: /Fruit and water/ })).toBeVisible();

    await page.getByRole('button', { name: UI.addSlot }).click();
    await expect(page.getByRole('button', { name: /^Edit slot/ })).toHaveCount(2);
    // The article warns that a slot left empty reaches people as "Untitled slot".
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    const [withEmpty] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('link', { name: UI.preview }).click(),
    ]);
    await expect(withEmpty.getByText(UI.untitledSlot)).toBeVisible();
    await withEmpty.close();

    await page.getByRole('button', { name: /Fruit and water/ }).click();
    await slotEditor.getByRole('button', { name: UI.duplicate }).click();
    await slotEditor.getByRole('button', { name: UI.done }).click();
    await expect(page.getByRole('button', { name: /^Edit slot/ })).toHaveCount(3);
    // "Then open the copy and change its date." The copy lands last.
    await page
      .getByRole('button', { name: /Fruit and water/ })
      .last()
      .click();
    await slotEditor.getByLabel(`${UI.date} value`).fill('2030-04-13');
    await slotEditor.getByRole('button', { name: UI.done }).click();
    await page.getByText(UI.emptySlot, { exact: true }).click();
    await slotEditor.getByRole('button', { name: UI.delete }).click();
    await expect(page.getByRole('button', { name: /^Edit slot/ })).toHaveCount(2);
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();

    // Reminders: on for a new signup, switched off from the date field.
    await page.getByRole('button', { name: new RegExp(`^${UI.fields}`) }).click();
    // One dialog; its name changes to "Edit field" once a field is chosen.
    const fields = page.getByRole('dialog');
    await fields.getByRole('button', { name: UI.date, exact: true }).click();
    await expect(fields.getByRole('checkbox', { name: UI.reminderToggle })).toBeChecked();
    await expect(fields.getByRole('button', { name: UI.save })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(fields).toBeHidden();

    // Publish and share the link
    const [preview] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('link', { name: UI.preview }).click(),
    ]);
    await expect(
      preview.getByRole('heading', { name: 'Snack duty — Spring season' }),
    ).toBeVisible();
    await expect(preview.getByText(UI.untitledSlot)).toHaveCount(0);
    await preview.close();

    await page.getByRole('button', { name: UI.publish, exact: true }).click();
    await expect(page.getByText(UI.published)).toBeVisible();

    const header = page
      .locator('header', { has: page.getByText(UI.publicLink, { exact: true }) })
      .locator('visible=true');
    await expect(header.getByText(UI.publicLink, { exact: true })).toBeVisible();
    if (CAPTURE) {
      // Each site has its own address; show a stand-in, not this test server's.
      // Only the text changes: the copy button still copies the real link.
      await header
        .locator('span.font-mono')
        .evaluate(
          (el) => (el.textContent = 'https://your-site.example/s/snack-duty-spring-season'),
        );
      // Crop to the title and the link: the whole header is too wide to read
      // once it is scaled into the article's column.
      const chip = header.getByRole('button', { name: UI.copyPublicLink }).locator('..');
      const title = header.getByRole('heading', { level: 1 });
      const pill = header.getByText('open', { exact: true });
      const boxes = await Promise.all([title, pill, chip].map((l) => l.boundingBox()));
      if (boxes.some((b) => !b)) throw new Error('title, status or link not on screen');
      const [t, st, c] = boxes as [
        NonNullable<(typeof boxes)[0]>,
        NonNullable<(typeof boxes)[0]>,
        NonNullable<(typeof boxes)[0]>,
      ];
      const pad = 16;
      const left = Math.min(t.x, c.x) - pad;
      const right = Math.max(st.x + st.width, c.x + c.width) + pad;
      await page.waitForTimeout(300);
      await page.screenshot({
        path: `${SHOT_DIR}/published.png`,
        clip: {
          x: left,
          y: t.y - pad,
          width: right - left,
          height: c.y + c.height + pad - (t.y - pad),
        },
        animations: 'disabled',
      });
    }
    await header.getByRole('button', { name: UI.copyPublicLink }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/\/s\/snack-duty-spring-season/);

    // What happens next: the link opens a page people can sign up on.
    await page.goto(copied);
    await expect(page.getByRole('heading', { name: 'Snack duty — Spring season' })).toBeVisible();
    await expect(page.getByText('Fruit and water')).toHaveCount(2);
    await expect(page.getByText('0 of 2 signed up')).toHaveCount(2);
    const signUp = page.getByRole('button', { name: new RegExp(`^${UI.signUp} for`) });
    await expect(signUp).toHaveCount(2);
    await expect(signUp.first()).toHaveText(UI.signUp);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('publish is under the three dots, and there is no preview', async ({ page, context }) => {
      await loginAsSeededOrganizer(context);
      const created = await page.request.post('/api/signups', {
        data: {
          title: `Phone publish ${Date.now()}`,
          description: '',
          tags: [],
          visibility: 'unlisted',
          settings: {},
        },
      });
      expect(created.ok()).toBe(true);
      const id = (await created.json()).data.id as string;

      await page.goto(`/app/signups/${id}/build`);
      await expect(page.getByRole('link', { name: UI.preview })).toBeHidden();
      await page.getByRole('button', { name: UI.moreActions }).click();
      await page.getByRole('button', { name: UI.publishOnPhone }).click();
      await expect(page.getByText(UI.published)).toBeVisible();
      await expect(
        page.getByText(UI.publicLink, { exact: true }).locator('visible=true'),
      ).toBeVisible();
    });
  });
});
