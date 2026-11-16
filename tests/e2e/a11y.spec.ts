import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { NOT_FOUND_PAGE } from '@/app/not-found-message';
import { loginAsSeededOrganizer } from './helpers/auth';
import { englishName, TEST_LOCALES } from '@/i18n/testing/locales';
import { loadSeed } from './helpers/fixtures';
import { escaped, gotoIn, messagesIn } from './helpers/languages';
import { UNSHIPPED_LOCALES } from './helpers/unshipped-locales';

const seed = loadSeed();

test.describe('accessibility', () => {
  test('public signup page has no WCAG A/AA violations', async ({ page }) => {
    await page.goto(`/s/${seed.publicSlug}`);
    await expect(page.getByRole('heading', { name: seed.publicTitle })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(
      results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  });

  // In a test language, the page's language is on <html> and <main>, and
  // longer words go in the same boxes.
  for (const locale of TEST_LOCALES) {
    const { open } = seed.languages[locale];
    test(`the ${englishName(locale)} test signup’s page has no WCAG A/AA violations`, async ({
      page,
    }) => {
      await gotoIn(page, locale, `/s/${open.slug}`);
      await expect(page.getByRole('heading', { name: open.title })).toBeVisible();

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(
        results.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => n.target),
        })),
      ).toEqual([]);
    });
  }

  // Rendered outside every layout (src/app/global-not-found.tsx), so nothing
  // but the page itself gives it a `lang`.
  test("the site's 404 has no WCAG A/AA violations", async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(page.getByRole('heading', { name: NOT_FOUND_PAGE.title })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(
      results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  });

  for (const { name, slug, slotLabel, signUp, yourName, locale } of [
    {
      name: 'commit dialog',
      slug: seed.publicSlug,
      slotLabel: seed.openSlotLabel,
      signUp: 'Sign up',
      yourName: 'Your name',
      locale: null,
    },
    {
      name: 'commit dialog with the email optional',
      slug: seed.optionalEmailSlug,
      slotLabel: seed.optionalEmailSlotLabel,
      signUp: 'Sign up',
      yourName: 'Your name',
      locale: null,
    },
    // Email optional too, and asking how many spots.
    ...TEST_LOCALES.map((locale) => ({
      name: `commit dialog on the ${englishName(locale)} test signup`,
      slug: seed.languages[locale].open.slug,
      slotLabel: seed.languages[locale].open.slots.many,
      signUp: messagesIn(locale, 'participant.dialog')('signUp'),
      yourName: messagesIn(locale, 'participant.fields')('name'),
      locale,
    })),
  ]) {
    test(`${name} has no WCAG A/AA violations`, async ({ page }) => {
      if (locale) await gotoIn(page, locale, `/s/${slug}`);
      else await page.goto(`/s/${slug}`);
      const row = page.locator('li').filter({ hasText: slotLabel });
      await row.getByRole('button', { name: signUp }).click();
      await expect(page.getByLabel(yourName)).toBeVisible();

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(
        results.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => n.target),
        })),
      ).toEqual([]);
    });
  }

  // A sign-up's own pages, in English and in each test signup's language,
  // which the whole page takes, from <html lang> to the footer.
  for (const { name, path, locale } of [
    {
      name: 'an edit page',
      path: `/s/${seed.editSlug}/c/${seed.editCommitmentId}?token=${seed.editToken}`,
      locale: null,
    },
    { name: 'an unsubscribe page', path: `/s/${seed.publicSlug}/unsubscribe`, locale: null },
    ...TEST_LOCALES.flatMap((locale) => [
      {
        name: `the ${englishName(locale)} test signup’s edit page`,
        path: seed.languages[locale].open.editPath,
        locale,
      },
      {
        name: `the ${englishName(locale)} test signup’s unsubscribe page`,
        path: seed.languages[locale].open.unsubscribePath,
        locale,
      },
    ]),
  ]) {
    test(`${name} has no WCAG A/AA violations`, async ({ page }) => {
      if (locale) await gotoIn(page, locale, path);
      else await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(
        results.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => n.target),
        })),
      ).toEqual([]);
    });
  }

  test('Remove confirmation on the Responses tab has no WCAG A/AA violations', async ({
    page,
    context,
  }) => {
    await loginAsSeededOrganizer(context);
    const created = await page.request.post('/api/signups', {
      data: {
        title: `Axe remove ${Date.now()}`,
        description: '',
        tags: [],
        visibility: 'unlisted',
        settings: {},
      },
    });
    expect(created.ok()).toBe(true);
    const signupId = (await created.json()).data.id as string;
    const added = await page.request.post(`/api/signups/${signupId}/slots`, {
      data: { capacity: 1, values: { what: 'Fruit and water' } },
    });
    expect(added.ok()).toBe(true);
    const slotId = (await added.json()).data.id as string;
    expect((await page.request.post(`/api/signups/${signupId}/publish`)).ok()).toBe(true);
    const committed = await page.request.post(`/api/slots/${slotId}/commitments`, {
      // An address of its own, from the range kept for documentation (RFC
      // 5737), so this sign-up doesn't count against the per-IP limit other
      // specs' sign-ups share.
      headers: { 'x-forwarded-for': '203.0.113.79' },
      data: { name: 'Sam Example', email: `sam+${Date.now()}@example.test`, quantity: 1 },
    });
    expect(committed.ok()).toBe(true);

    await page.goto(`/app/signups/${signupId}/responses`);
    await page.getByRole('button', { name: 'Remove Sam Example from Fruit and water' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Confirm removal' });
    await expect(confirm).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(
      results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);

    // On a phone too, where each person is a card rather than a table row.
    await page.keyboard.press('Escape');
    await expect(confirm).toBeHidden();
    await page.setViewportSize({ width: 390, height: 844 });
    const phone = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(
      phone.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  });

  // The open editor sits on a grey of its own, where the brand blue of its
  // Done button was 4.4:1.
  test('the Build tab with a slot’s editor open has no WCAG A/AA violations', async ({
    page,
    context,
  }) => {
    await loginAsSeededOrganizer(context);
    const created = await page.request.post('/api/signups', {
      data: {
        title: `Axe build ${Date.now()}`,
        description: '',
        tags: [],
        visibility: 'unlisted',
        settings: {},
      },
    });
    expect(created.ok()).toBe(true);
    const signupId = (await created.json()).data.id as string;
    const added = await page.request.post(`/api/signups/${signupId}/slots`, {
      data: { capacity: 2, values: { what: 'Fruit and water' } },
    });
    expect(added.ok()).toBe(true);

    await page.goto(`/app/signups/${signupId}/build`);
    // The Fields dialog opens only once the page has hydrated, by when a
    // click on a slot opens its editor.
    await page.getByRole('button', { name: /^Fields/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByText('Fruit and water', { exact: true }).click();
    await expect(
      page.locator('[data-slot-editor]').getByRole('button', { name: 'Done' }),
    ).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(
      results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  });

  // The organizer app for an organizer whose account stores each test
  // language, with its signups in it: the language is on <html> and the
  // app's wrapper, and longer words go in the same boxes.
  for (const locale of TEST_LOCALES) {
    const { organizer } = seed.languages[locale];
    const language = englishName(locale);
    const unshippedHint = `the organizer app isn’t in ${locale}: start the server with E2E_UNSHIPPED_LOCALES=${UNSHIPPED_LOCALES}`;

    test(`Your signups in ${language} has no WCAG A/AA violations`, async ({ page, context }) => {
      await loginAsSeededOrganizer(context, { sessionToken: organizer.sessionToken });
      await page.goto('/app');
      await expect(page.getByRole('heading', { level: 1 }), unshippedHint).toHaveText(
        messagesIn(locale, 'organizer.dashboard')('title'),
      );

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(
        results.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => n.target),
        })),
      ).toEqual([]);
    });

    test(`the Build tab in ${language}, and with a slot’s editor open, has no WCAG A/AA violations`, async ({
      page,
      context,
    }) => {
      const build = messagesIn(locale, 'organizer.build');
      await loginAsSeededOrganizer(context, { sessionToken: organizer.sessionToken });
      await page.goto(`/app/signups/${organizer.signups.build.id}/build`);
      // The Fields dialog opens only once the page has hydrated, by when a
      // click on a slot opens its editor.
      const fields = new RegExp(`^${escaped(build('fields.label'))}`);
      await page.getByRole('button', { name: fields }).locator('visible=true').click();
      await expect(page.getByRole('dialog'), unshippedHint).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);

      const expectNoViolations = async (where: string) => {
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();

        expect(
          results.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.map((n) => n.target),
          })),
          where,
        ).toEqual([]);
      };

      await expectNoViolations('the Build tab');
      await page.locator('[data-slot-row]').first().click();
      await expect(
        page.locator('[data-slot-editor]').getByRole('button', { name: build('editor.done') }),
      ).toBeVisible();
      await expectNoViolations('the Build tab with a slot’s editor open');
    });
  }
});
