import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test, type Page } from '@playwright/test';
import { loginAsSeededOrganizer } from './helpers/auth';
import { BASE_URL, loadSeed } from './helpers/fixtures';
import { createOrganizerIn } from './helpers/organizer-language';

const seed = loadSeed();

// Another website: a page served from the other loopback name, on a port of
// its own, so the browser treats the frame as cross-site, as it would on a real
// host page. A real server rather than a routed page, which Chromium counts as
// public and so blocks from framing a local address.
const HOST_NAME = new URL(BASE_URL).hostname === '127.0.0.1' ? 'localhost' : '127.0.0.1';
let host: Server;
let hostOrigin = '';
// The pages the host serves, by their path, each built by the test that asks
// for it. Nothing from a request goes into a page: a path not listed is a 404.
const hostPages = new Map<string, string>();

test.beforeAll(async () => {
  host = createServer((req, res) => {
    const body = hostPages.get(req.url ?? '');
    res.writeHead(body ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body ?? 'Not found');
  });
  await new Promise<void>((resolve) => host.listen(0, HOST_NAME, resolve));
  hostOrigin = `http://${HOST_NAME}:${(host.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => host.close(resolve));
});

const DENY_CSP = "object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
const EMBED_CSP = "object-src 'none'; base-uri 'self'; frame-ancestors *";

/** Opens the other website's page, framing `path` of the app, `height` px tall. */
async function openHostPage(page: Page, path: string, height = 600) {
  const pagePath = `/page-${hostPages.size + 1}`;
  hostPages.set(
    pagePath,
    `<!doctype html><html lang="en"><title>A school's website</title>
      <h1>Our school</h1>
      <iframe title="Sign-up sheet" src="${BASE_URL}${path}"
        style="width:100%;height:${height}px;border:0"></iframe></html>`,
  );
  await page.goto(`${hostOrigin}${pagePath}`);
  const frame = page.frameLocator('iframe[title="Sign-up sheet"]');
  return { frame, frameUrl: () => page.frames()[1]?.url() ?? '' };
}

test.describe('a signup’s embed, inside another website', () => {
  test('is the only page another site may frame', async ({ request }) => {
    const embed = await request.get(`/s/${seed.publicSlug}/embed`);
    expect(embed.ok()).toBe(true);
    expect(embed.headers()['content-security-policy']).toBe(EMBED_CSP);
    expect(embed.headers()['x-frame-options']).toBeUndefined();
    expect(embed.headers()['x-content-type-options']).toBe('nosniff');

    for (const path of [
      `/s/${seed.publicSlug}`,
      `/s/${seed.publicSlug}/c/${seed.editCommitmentId}`,
      `/s/${seed.publicSlug}/unsubscribe`,
      '/app',
      '/login',
    ]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.headers()['content-security-policy'], path).toBe(DENY_CSP);
      expect(res.headers()['x-frame-options'], path).toBe('DENY');
      expect(res.headers()['x-content-type-options'], path).toBe('nosniff');
    }
  });

  // The signups these tests make are their own organizer's, put straight into
  // the database: made through the API they'd count against the seeded
  // organizer's hourly create limit, which the rest of the suite needs.
  test('signs someone up inside the frame, and every link out opens a new tab', async ({
    page,
  }) => {
    const organizer = await createOrganizerIn(null, `embed-frame-${test.info().project.name}`);
    const signup = organizer.open;

    const { frame, frameUrl } = await openHostPage(page, `/s/${signup.slug}/embed`);
    await expect(frame.getByRole('heading', { name: 'Bake Sale' })).toBeVisible();
    // No site footer inside the frame.
    await expect(frame.getByRole('contentinfo')).toHaveCount(0);

    const row = frame.locator('li').filter({ hasText: 'Cookies' });
    await row.getByRole('button', { name: 'Sign up' }).click();
    await frame.getByLabel('Your name').fill('Pat Tester');
    await frame.getByLabel('Email').fill(`pat+${Date.now()}@example.test`);
    await frame.getByRole('button', { name: 'Confirm' }).click();
    await expect(frame.getByRole('heading', { name: "You're in." })).toBeVisible();

    // The edit link opens a tab of its own; the frame stays on the embed.
    const editLink = frame.getByRole('link', { name: new RegExp(`/s/${signup.slug}/c/`) });
    await expect(editLink).toHaveAttribute('target', '_blank');
    const [editTab] = await Promise.all([page.waitForEvent('popup'), editLink.click()]);
    await expect(editTab).toHaveURL(new RegExp(`/s/${signup.slug}/c/`));
    await editTab.close();
    expect(frameUrl()).toBe(`${BASE_URL}/s/${signup.slug}/embed`);

    // Done leaves the sheet in the frame.
    await frame.getByRole('button', { name: 'Done' }).click();
    await expect(frame.getByRole('heading', { name: 'Bake Sale' })).toBeVisible();
    expect(frameUrl()).toBe(`${BASE_URL}/s/${signup.slug}/embed`);

    // So does the site's name above the sheet.
    const home = frame.locator('main a[href="/"]');
    await expect(home).toHaveAttribute('target', '_blank');
    const [homeTab] = await Promise.all([page.waitForEvent('popup'), home.click()]);
    await homeTab.close();
    expect(frameUrl()).toBe(`${BASE_URL}/s/${signup.slug}/embed`);
    expect(frameUrl()).not.toMatch(/\/c\//);
  });

  test('a returning participant’s Edit links open a new tab', async ({ page }) => {
    // Visited directly, the participant's cookie is kept and sent, so the
    // page shows their sign-up as it would in a frame on the same site.
    await page.goto(`/s/${seed.publicSlug}`);
    const row = page.locator('li').filter({ hasText: seed.openSlotLabel });
    await row.getByRole('button', { name: 'Sign up' }).click();
    await page.getByLabel('Your name').fill('Sam Example');
    await page.getByLabel('Email').fill(`sam+${Date.now()}@example.test`);
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByRole('heading', { name: "You're in." })).toBeVisible();

    await page.goto(`/s/${seed.publicSlug}/embed`);
    const links = page.getByRole('main').getByRole('link');
    await expect(links.first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit or cancel' })).toBeVisible();
    for (const link of await links.all()) {
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAccessibleDescription('Opens in a new tab');
    }
  });

  test('shows each state’s message, and no organizer extras', async ({ page, context }) => {
    const organizer = await createOrganizerIn(null, `embed-states-${test.info().project.name}`);
    await loginAsSeededOrganizer(context, { sessionToken: organizer.sessionToken });
    const { open, draft } = organizer;

    // Signed in as its organizer, on the same site: the signup's own page
    // shows the strip, the embed never does.
    await page.goto(`/s/${open.slug}`);
    await expect(page.getByRole('navigation', { name: 'Organizer' })).toBeVisible();
    await page.goto(`/s/${open.slug}/embed`);
    await expect(page.getByRole('heading', { name: 'Bake Sale' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Organizer' })).toHaveCount(0);

    // A draft gets the visitor's message, even from its own organizer.
    await page.goto(`/s/${draft.slug}/embed`);
    await expect(page.getByRole('heading', { name: 'This signup isn’t ready yet' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open your draft' })).toHaveCount(0);

    const close = await page.request.post(`/api/signups/${open.id}/close`);
    expect(close.ok(), await close.text()).toBe(true);
    await page.goto(`/s/${open.slug}/embed`);
    await expect(page.getByRole('heading', { name: 'Bake Sale' })).toBeVisible();
    await expect(page.getByRole('status').first()).toContainText('Closed');
    await expect(page.getByRole('navigation', { name: 'Organizer' })).toHaveCount(0);

    const archive = await page.request.post(`/api/signups/${open.id}/archive`);
    expect(archive.ok(), await archive.text()).toBe(true);
    await page.goto(`/s/${open.slug}/embed`);
    await expect(page.getByText('This signup is no longer available')).toBeVisible();

    const unknown = await page.goto(`/s/no-such-signup-${Date.now()}/embed`);
    expect(unknown?.status()).toBe(404);
    await expect(page.getByText('Sorry, this signup is no longer available')).toBeVisible();
    await expect(page.getByRole('contentinfo')).toHaveCount(0);
  });

  test('fits the sign-up sheet in a phone-sized frame', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    try {
      const { frame } = await openHostPage(page, `/s/${seed.publicSlug}/embed`, 600);
      const row = frame.locator('li').filter({ hasText: seed.openSlotLabel });
      await row.getByRole('button', { name: 'Sign up' }).click();
      // Confirm can be reached inside the 600px frame, scrolling the sheet if need be.
      const confirm = frame.getByRole('button', { name: 'Confirm' });
      await confirm.scrollIntoViewIfNeeded();
      await expect(confirm).toBeInViewport();
      await expect(frame.getByLabel('Your name')).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
