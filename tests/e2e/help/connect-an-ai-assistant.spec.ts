/**
 * Walkthrough for the help article "Connect an AI assistant"
 * (src/help/articles/connect-an-ai-assistant.tsx). It follows the article's
 * steps by the same on-screen names, so a renamed or moved control fails here
 * and points at the article. With HELP_SCREENSHOTS=1
 * (`pnpm help:screenshots`) it also refreshes the article's pictures.
 *
 * The part inside the assistant can't be driven from here, so the test plays
 * the assistant: it asks for access the way an MCP client does, as the
 * `e2e-client` static client (OAUTH_STATIC_CLIENTS; ci.yml sets it). Without
 * that client the file skips, as the OAuth consent smoke does.
 */
import { createHash, randomBytes } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { UI } from '@/help/articles/connect-an-ai-assistant.ui';
import { OAUTH_TTL } from '@/oauth/config';
import { loginAsSeededOrganizer } from '../helpers/auth';
import { BASE_URL } from '../helpers/fixtures';
import { createSoloOrganizer } from '../helpers/seed';

const SLUG = 'connect-an-ai-assistant';
const CAPTURE = process.env.HELP_SCREENSHOTS === '1';
const SHOT_DIR = `public/help/${SLUG}`;

const CLIENT_ID = 'e2e-client';
const REDIRECT_URI = `${BASE_URL}/e2e/oauth-callback`;
const MCP_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
};

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function authorizeUrl(challenge: string, resource: string) {
  const q = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'signups:read signups:write offline_access',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource,
    state: 'help',
  });
  return `${BASE_URL}/api/oauth/authorize?${q}`;
}

/** One JSON-RPC call to the MCP server; the answer comes back as one SSE event. */
async function mcp(
  request: APIRequestContext,
  address: string,
  accessToken: string | null,
  method: string,
  params: Record<string, unknown> = {},
) {
  const res = await request.post(address, {
    headers: accessToken ? { ...MCP_HEADERS, authorization: `Bearer ${accessToken}` } : MCP_HEADERS,
    data: { jsonrpc: '2.0', id: 1, method, params },
  });
  const line = (await res.text()).split('\n').find((l) => l.startsWith('data:'));
  return { res, body: line ? JSON.parse(line.slice(5)) : null };
}

test.describe('help: connect an AI assistant', () => {
  // Screenshots at 2x so text stays sharp; the article sizes them in CSS pixels.
  test.use({ deviceScaleFactor: 2 });

  test('the steps work as written', async ({ page, context, request, isMobile }) => {
    test.skip(isMobile, 'the phone path is its own test below');
    // Connecting and disconnecting change the whole account, so this test
    // has an organizer of its own rather than sharing the seeded one.
    const me = await createSoloOrganizer();
    await loginAsSeededOrganizer(context, { sessionToken: me.sessionToken });

    // Add OpenSignup to your assistant: the address the article prints is
    // this site's MCP server. Without access, it answers the way an
    // assistant expects, pointing it at where to ask for access.
    await page.goto(`/help/${SLUG}`);
    const address = ((await page.locator('[data-help-copy]').first().textContent()) ?? '').trim();
    expect(address).toBe(`${BASE_URL}/api/mcp`);
    const locked = await mcp(request, address, null, 'tools/list');
    expect(locked.res.status()).toBe(401);
    expect(locked.res.headers()['www-authenticate']).toContain('resource_metadata=');

    const { verifier, challenge } = pkce();
    const probe = await request.get(authorizeUrl(challenge, address), {
      maxRedirects: 0,
      headers: { accept: 'text/html' },
    });
    test.skip(
      probe.status() === 400 && (await probe.text()).includes('invalid_client'),
      'OAUTH_STATIC_CLIENTS has no "e2e-client": set it as in .env.example to run this walkthrough',
    );

    // Approve the connection
    await page.goto(authorizeUrl(challenge, address));
    await expect(page).toHaveURL(/\/oauth\/consent\//);
    // A client set up by the site has no website to check; the page says so.
    await expect(page.getByText('was set up by the people who run this site')).toBeVisible();
    const permissions = page.getByRole('region', { name: UI.willBeAbleTo });
    await expect(permissions.getByText(UI.seeSignups, { exact: true })).toBeVisible();
    await expect(permissions.getByText(UI.editSignups, { exact: true })).toBeVisible();
    // "An app only gets this if it asks for it on its own."
    await expect(permissions.getByText(UI.seePeople)).toHaveCount(0);
    const allow = page.getByRole('button', { name: UI.allow, exact: true });
    const dontAllow = page.getByRole('button', { name: UI.dontAllow, exact: true });
    await expect(dontAllow).toBeVisible();
    if (CAPTURE) {
      // From the list down to the two buttons: the part the step is about,
      // and the same whichever app is asking.
      const [list, buttons] = await Promise.all([permissions.boundingBox(), dontAllow.boundingBox()]);
      if (!list || !buttons) throw new Error('permissions or buttons not on screen');
      const pad = 16;
      await page.waitForTimeout(300);
      await page.screenshot({
        path: `${SHOT_DIR}/approve.png`,
        clip: {
          x: list.x - pad,
          y: list.y - pad,
          width: list.width + 2 * pad,
          height: buttons.y + buttons.height - list.y + 2 * pad,
        },
        animations: 'disabled',
      });
    }
    await allow.click();
    await page.waitForURL(/\/e2e\/oauth-callback\?/);
    const code = new URL(page.url()).searchParams.get('code');
    expect(code).toBeTruthy();
    const tokenRes = await request.post(`${BASE_URL}/api/oauth/token`, {
      form: {
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code: code ?? '',
        code_verifier: verifier,
        resource: address,
      },
    });
    expect(tokenRes.status()).toBe(200);
    const tokens = (await tokenRes.json()) as { access_token: string; refresh_token: string };

    // Try it: what the assistant makes is a draft, on Your signups.
    const title = 'Snack duty — Autumn season';
    const created = await mcp(request, address, tokens.access_token, 'tools/call', {
      name: 'create_signup',
      arguments: {
        title,
        fields: [
          { ref: 'what', label: 'What', fieldType: 'text' },
          { ref: 'date', label: 'Date', fieldType: 'date' },
        ],
        slots: [{ values: { what: 'Snacks', date: '2030-10-05' }, capacity: 2 }],
      },
    });
    expect(created.body?.result?.isError ?? false).toBe(false);
    await page.goto('/app');
    await expect(page.getByRole('heading', { name: UI.yourSignups })).toBeVisible();
    const row = page.getByRole('link', { name: new RegExp(title) });
    await expect(row.getByText('draft', { exact: true })).toBeVisible();

    // Disconnect an assistant. On a wide screen the link reads as your email.
    await page.getByRole('link', { name: me.email, exact: true }).click();
    await expect(page.getByRole('heading', { name: UI.settings, level: 1 })).toBeVisible();
    await page.getByRole('link', { name: new RegExp(`^${UI.connectedApps}`) }).click();
    await expect(page.getByRole('heading', { name: UI.connectedApps, level: 1 })).toBeVisible();
    const app = page.getByRole('listitem').filter({ hasText: CLIENT_ID });
    await expect(app.getByText(UI.seeSignups, { exact: true })).toBeVisible();
    await expect(app.getByText(UI.editSignups, { exact: true })).toBeVisible();
    await expect(app.getByText(/last used|not used yet/)).toBeVisible();
    // The article's "up to N minutes" is the same number the page gives.
    const minutes = Math.round(OAUTH_TTL.ACCESS_TOKEN / 60);
    await expect(page.getByText(`within ${minutes} minutes`)).toBeVisible();
    await app.getByRole('button', { name: UI.disconnect }).click();
    await expect(page.getByRole('status')).toContainText('Disconnected');
    await expect(page.getByRole('listitem').filter({ hasText: CLIENT_ID })).toHaveCount(0);

    // "Stops an assistant from working": it can't renew its access...
    const renew = await request.post(`${BASE_URL}/api/oauth/token`, {
      form: { grant_type: 'refresh_token', client_id: CLIENT_ID, refresh_token: tokens.refresh_token },
    });
    expect(renew.status()).toBe(400);
    // ...though what it already holds keeps working until it runs out.
    const stillHeld = await mcp(request, address, tokens.access_token, 'tools/list');
    expect(stillHeld.res.status()).toBe(200);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('the header link says Settings', async ({ page, context }) => {
      await loginAsSeededOrganizer(context);
      await page.goto('/app');
      await page.getByRole('link', { name: UI.settings, exact: true }).click();
      await expect(page.getByRole('heading', { name: UI.settings, level: 1 })).toBeVisible();
      await page.getByRole('link', { name: new RegExp(`^${UI.connectedApps}`) }).click();
      await expect(page.getByRole('heading', { name: UI.connectedApps, level: 1 })).toBeVisible();
    });
  });
});
