import { createHash, randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { loginAsSeededOrganizer } from './helpers/auth';
import { BASE_URL, loadSeed } from './helpers/fixtures';
import { createDisposableSession } from './helpers/seed';

/**
 * Consent smoke: approve, deny, and disconnect, driven the way a real MCP
 * client would drive a browser.
 *
 * Needs the `e2e-client` entry in OAUTH_STATIC_CLIENTS (ci.yml sets it; see
 * .env.example for the local line). When it is missing the whole file skips
 * with a message rather than failing on invalid_client. Stateful — one
 * organizer, one client, one grant — so playwright.config.ts runs it in a
 * single project.
 */

const CLIENT_ID = 'e2e-client';
const REDIRECT_URI = `${BASE_URL}/e2e/oauth-callback`;
const RESOURCE = `${BASE_URL}/api/mcp`;

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function authorizeUrl(challenge: string, scope: string) {
  const q = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: RESOURCE,
    state: 'e2e',
  });
  return `${BASE_URL}/api/oauth/authorize?${q}`;
}

test.describe('OAuth consent', () => {
  test.beforeAll(async ({ request }) => {
    const probe = await request.get(authorizeUrl('probe-only-not-a-real-challenge-value-0000000', 'signups:read'), {
      maxRedirects: 0,
      headers: { accept: 'text/html' },
    });
    const body = await probe.text();
    test.skip(
      probe.status() === 400 && body.includes('invalid_client'),
      'OAUTH_STATIC_CLIENTS has no "e2e-client" — set it as in .env.example to run the consent smoke',
    );
  });

  test.beforeEach(async ({ context }) => {
    await loginAsSeededOrganizer(context);
  });

  test('approve issues a code, the token reaches the MCP route, and disconnect revokes it', async ({ page, request }) => {
    const { verifier, challenge } = pkce();
    await page.goto(authorizeUrl(challenge, 'signups:read signups:write offline_access'));
    await expect(page).toHaveURL(/\/oauth\/consent\//);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('e2e-client');
    await expect(page.getByText('E2E test client')).toBeVisible();
    await expect(page.getByText('See your signups and their slots')).toBeVisible();
    await expect(page.getByText('names and email addresses')).toHaveCount(0);

    await page.getByRole('button', { name: 'Allow', exact: true }).click();
    await page.waitForURL(/\/e2e\/oauth-callback\?/);
    const redirected = new URL(page.url());
    const code = redirected.searchParams.get('code');
    expect(code).toBeTruthy();
    expect(redirected.searchParams.get('state')).toBe('e2e');
    expect(redirected.searchParams.get('iss')).toBe(BASE_URL);

    const tokenRes = await request.post(`${BASE_URL}/api/oauth/token`, {
      form: { grant_type: 'authorization_code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, code: code!, code_verifier: verifier, resource: RESOURCE },
    });
    expect(tokenRes.status()).toBe(200);
    const tokens = await tokenRes.json();
    expect(tokens.scope).toBe('signups:read signups:write');

    const mcp = await request.get(`${BASE_URL}/api/mcp`, { headers: { authorization: `Bearer ${tokens.access_token}` } });
    expect(mcp.status()).toBe(200);
    expect((await mcp.json()).data.scopes).toEqual(['signups:read', 'signups:write']);

    const noToken = await request.get(`${BASE_URL}/api/mcp`);
    expect(noToken.status()).toBe(401);
    expect(noToken.headers()['www-authenticate']).toContain('resource_metadata=');

    // The account link in the header opens the settings hub, which lists this section.
    await page.goto(`${BASE_URL}/app`);
    // Its accessible name is the email on wide screens and "Settings" on narrow ones.
    await page.locator('header a[href="/app/settings"]').click();
    await expect(page).toHaveURL(/\/app\/settings$/);
    await page.getByRole('link', { name: /Connected apps/ }).click();
    await expect(page).toHaveURL(/\/app\/settings\/connected-apps$/);
    const row = page.getByRole('listitem').filter({ hasText: 'e2e-client' });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Disconnect' }).click();
    await expect(page.getByRole('status')).toContainText('Disconnected');
    await expect(page.getByText('No connected apps')).toBeVisible();

    const afterRevoke = await request.post(`${BASE_URL}/api/oauth/token`, {
      form: { grant_type: 'refresh_token', client_id: CLIENT_ID, refresh_token: tokens.refresh_token },
    });
    expect(afterRevoke.status()).toBe(400);
    expect((await afterRevoke.json()).error).toBe('invalid_grant');
  });

  test('deny returns access_denied to the client and issues nothing', async ({ page }) => {
    const { challenge } = pkce();
    await page.goto(authorizeUrl(challenge, 'signups:read'));
    await expect(page).toHaveURL(/\/oauth\/consent\//);
    await page.getByRole('button', { name: "Don't allow" }).click();
    await page.waitForURL(/\/e2e\/oauth-callback\?/);
    const redirected = new URL(page.url());
    expect(redirected.searchParams.get('error')).toBe('access_denied');
    expect(redirected.searchParams.get('code')).toBeNull();
  });

  test('a request for participant data is called out on the consent screen', async ({ page }) => {
    const { challenge } = pkce();
    await page.goto(authorizeUrl(challenge, 'signups:read commitments:read'));
    await expect(page.getByText('including their names and email addresses')).toBeVisible();
    await expect(page.getByText('Participants gave these details to you')).toBeVisible();
    await page.getByRole('button', { name: "Don't allow" }).click();
    await page.waitForURL(/\/e2e\/oauth-callback\?/);
  });

  test('"sign in as someone else" signs out and returns to the same consent request', async ({ browser }) => {
    const context = await browser.newContext();
    await loginAsSeededOrganizer(context, { sessionToken: await createDisposableSession(loadSeed().organizerId) });
    const page = await context.newPage();
    const { challenge } = pkce();
    await page.goto(authorizeUrl(challenge, 'signups:read'));
    await expect(page).toHaveURL(/\/oauth\/consent\//);
    const consentUrl = page.url();
    await page.getByRole('button', { name: 'Sign in as someone else' }).click();
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Foauth%2Fconsent%2F/);
    // Signed out for real: the consent page now demands a login.
    await page.goto(consentUrl);
    await expect(page).toHaveURL(/\/login\?callbackUrl=/);
    await context.close();
  });

  test('the consent page without a session sends the organizer to log in and back', async ({ browser }) => {
    const fresh = await browser.newContext();
    const page = await fresh.newPage();
    const { challenge } = pkce();
    await page.goto(authorizeUrl(challenge, 'signups:read'));
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Foauth%2Fconsent%2F/);
    await fresh.close();
  });
});
