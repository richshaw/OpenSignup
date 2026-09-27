#!/usr/bin/env node
// Headless-Chromium command driver for a running OpenSignup (see SKILL.md).
//
// Reads one command per line from stdin and runs them in order, so it works
// both as a script (pipe a heredoc) and as a REPL under tmux. Exits 1 if any
// command failed, so a script run doubles as a smoke test.
//
//   node .claude/skills/run-opensignup/driver.mjs <<'EOF'
//   login pat@example.com
//   ss dashboard
//   EOF
//
// Env: OPENSIGNUP_URL (default http://localhost:3000), OPENSIGNUP_LOG (the
// web server's stdout, default /tmp/opensignup-web.log), SHOT_DIR (default
// /tmp/opensignup-shots), CHROMIUM_PATH (browser binary override).
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import * as readline from 'node:readline';

const BASE = process.env.OPENSIGNUP_URL ?? 'http://localhost:3000';
const LOG = process.env.OPENSIGNUP_LOG ?? '/tmp/opensignup-web.log';
const SHOT_DIR = process.env.SHOT_DIR ?? '/tmp/opensignup-shots';
mkdirSync(SHOT_DIR, { recursive: true });

// The repo pins a Playwright whose bundled Chromium may not be installed; a
// container with browsers under /opt/pw-browsers has a version-free symlink.
const executablePath =
  process.env.CHROMIUM_PATH ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const VIEWPORTS = {
  desktop: { viewport: { width: 1280, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
};

let browser = null;
let context = null;
let page = null;
const consoleErrors = [];
let failures = 0;

let viewportKind = 'desktop';

async function open(kind = 'desktop', storageState = undefined) {
  const opts = VIEWPORTS[kind];
  if (!opts) throw new Error(`open: expected desktop or phone, got "${kind}"`);
  viewportKind = kind;
  browser ??= await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  // A new context drops cookies: a fresh visitor (use it for the participant side).
  await context?.close();
  context = await browser.newContext({ ...opts, baseURL: BASE, storageState });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  return `${kind} browser, fresh cookies`;
}

async function ensurePage() {
  if (!page) await open('desktop');
  return page;
}

// Both headers (desktop and phone) are in the DOM, one hidden by CSS, so every
// lookup keeps only what's actually on screen.
function visible(locator) {
  return locator.locator('visible=true').first();
}

// Server-rendered buttons are on screen before React has wired them up, and
// `pnpm dev` compiles a page's scripts on its first visit: a click that lands
// in that gap does nothing. Waiting for the network to go quiet covers it.
async function settle(p) {
  await p.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
}

async function go(p, target) {
  const res = await p.goto(target, { waitUntil: 'domcontentloaded' });
  await settle(p);
  return res;
}

async function findClickable(p, name) {
  for (const role of ['button', 'link', 'tab', 'menuitem', 'checkbox']) {
    const loc = visible(p.getByRole(role, { name, exact: true }));
    if (await loc.count()) return loc;
  }
  const byText = visible(p.getByText(name, { exact: true }));
  if (await byText.count()) return byText;
  const partial = visible(p.getByRole('button', { name }));
  if (await partial.count()) return partial;
  throw new Error(`nothing visible to click named "${name}"`);
}

/** The newest console email line in the server log mentioning `needle`, parsed loosely. */
function emailsInLog(since = 0) {
  if (!existsSync(LOG)) throw new Error(`no server log at ${LOG} (set OPENSIGNUP_LOG)`);
  // pino-pretty in dev: strip colours, then split on the "would send" marker.
  // `since` is a byte offset (from statSync): slice the bytes, then decode, since
  // the email previews are full of multi-byte invisible characters.
  const raw = readFileSync(LOG)
    .subarray(since)
    .toString('utf8')
    .replace(/\x1b\[[0-9;]*m/g, '');
  return raw.split(/\[email:console\] \S* ?would send/).slice(1);
}

async function waitForEmail(to, sinceBytes, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = emailsInLog(sinceBytes).find((e) => e.includes(to));
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`no email to ${to} appeared in ${LOG} within ${timeoutMs / 1000}s`);
}

const COMMANDS = {
  open: (arg) => open(arg || 'desktop'),

  async nav(target) {
    const p = await ensurePage();
    const res = await go(p, target || '/');
    return `${res?.status()} ${p.url()}`;
  },

  // Signs in the real way: request a magic link, read it from the dev server's
  // console email in the log, open it and press "Sign in". Needs `pnpm dev`
  // (production redacts the link). The session is saved and reused, because
  // the site allows only 5 sign-in emails per address per hour.
  async login(email) {
    if (!email) throw new Error('login: give an email, e.g. login pat@example.com');
    const saved = path.join(SHOT_DIR, `.session-${email.replace(/[^\w.@-]/g, '_')}.json`);
    if (existsSync(saved)) {
      await open(viewportKind, saved);
      await go(page, '/app');
      if (!new URL(page.url()).pathname.startsWith('/login')) {
        return `signed in as ${email} (saved session) -> ${page.url()}`;
      }
    }
    await open(viewportKind);
    const p = page;
    const since = existsSync(LOG) ? statSync(LOG).size : 0;
    await go(p, '/login');
    await p.getByLabel('Email', { exact: true }).fill(email);
    await p.getByRole('button', { name: 'Send magic link' }).click();
    const mail = await waitForEmail(email, since);
    const link = mail.match(/https?:\/\/[^\s"',\]]+\/login\/confirm\?next=[^\s"',\]]+/)?.[0];
    if (!link) {
      throw new Error(
        'sign-in email has no usable link: is this `pnpm start`? It redacts tokens; use `pnpm dev`',
      );
    }
    await go(p, link);
    await p.getByRole('link', { name: /Sign in/ }).click();
    await p.waitForURL(/\/app(\/|$|\?)/, { timeout: 30_000 });
    await settle(p);
    await context.storageState({ path: saved });
    return `signed in as ${email} -> ${p.url()}`;
  },

  async click(name) {
    const p = await ensurePage();
    await (await findClickable(p, name)).click();
    await settle(p);
    return `clicked "${name}"`;
  },

  async 'click-css'(sel) {
    const p = await ensurePage();
    await visible(p.locator(sel)).click();
    await settle(p);
    return `clicked ${sel}`;
  },

  // fill <label> = <value>   (label is the field's accessible name)
  async fill(arg) {
    const m = arg.match(/^(.+?)\s+=\s+(.*)$/);
    if (!m) throw new Error('fill: use "fill <label> = <value>"');
    const p = await ensurePage();
    await visible(p.getByLabel(m[1], { exact: true })).fill(m[2]);
    return `filled "${m[1]}"`;
  },

  async press(key) {
    const p = await ensurePage();
    await p.keyboard.press(key);
    return `pressed ${key}`;
  },

  async wait(text) {
    const p = await ensurePage();
    await visible(p.getByText(text)).waitFor({ timeout: 20_000 });
    return `saw "${text}"`;
  },

  // Go to a link's address in this tab (links like "Open public page" open a new tab).
  async follow(name) {
    const p = await ensurePage();
    const href = await visible(p.getByRole('link', { name, exact: true })).getAttribute('href');
    if (!href) throw new Error(`link "${name}" has no href`);
    await go(p, href);
    return p.url();
  },

  // The same page as a new visitor with no cookies: how to act as a participant.
  async 'as-visitor'() {
    const here = page?.url();
    await open(viewportKind);
    if (here && here !== 'about:blank') await go(page, here);
    return `fresh visitor at ${page.url()}`;
  },

  async 'wait-url'(pattern) {
    const p = await ensurePage();
    await p.waitForURL(new RegExp(pattern), { timeout: 20_000 });
    await settle(p);
    return p.url();
  },

  // Full page. Scrolls first so lazy images (help screenshots) have loaded.
  async ss(name) {
    const p = await ensurePage();
    await p.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 50));
      }
      window.scrollTo(0, 0);
    });
    await p.waitForLoadState('networkidle').catch(() => {});
    const file = path.join(SHOT_DIR, `${name || `shot-${Date.now()}`}.png`);
    await p.screenshot({ path: file, fullPage: true });
    return file;
  },

  async 'ss-el'(arg) {
    const [sel, name] = arg.split(/\s+(?=[^\s]+$)/);
    const p = await ensurePage();
    const file = path.join(SHOT_DIR, `${name || `el-${Date.now()}`}.png`);
    await visible(p.locator(sel)).screenshot({ path: file });
    return file;
  },

  async text(sel) {
    const p = await ensurePage();
    const t = await visible(p.locator(sel || 'main')).innerText();
    return t.length > 2000 ? `${t.slice(0, 2000)}\n…(${t.length} chars)` : t;
  },

  async url() {
    return (await ensurePage()).url();
  },

  async eval(expr) {
    const p = await ensurePage();
    return JSON.stringify(await p.evaluate(expr));
  },

  // The newest console email (to an address, if given) from the server log.
  // Waits a little: confirmation emails are sent after the response.
  async email(to) {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const mails = emailsInLog().filter((e) => !to || e.includes(to));
      if (mails.length) {
        // Stop before textPreview: it's mostly invisible preheader padding.
        const lines = mails.at(-1).trim().split('\n');
        const end = lines.findIndex((l) => l.includes('textPreview'));
        return lines.slice(0, end === -1 ? 12 : end).join('\n');
      }
      if (Date.now() > deadline)
        throw new Error(`no console email${to ? ` to ${to}` : ''} in ${LOG}`);
      await new Promise((r) => setTimeout(r, 300));
    }
  },

  // Organizer session cookie, ready for curl -b.
  async cookie() {
    await ensurePage();
    const c = (await context.cookies(BASE)).find((k) => k.name.endsWith('authjs.session-token'));
    if (!c) throw new Error('no session cookie: login first');
    return `${c.name}=${c.value}`;
  },

  async errors() {
    const out = consoleErrors.length ? consoleErrors.join('\n') : '(no console errors)';
    consoleErrors.length = 0;
    return out;
  },

  async quit() {
    await browser?.close();
    browser = context = page = null;
    return 'closed';
  },

  help() {
    return `commands: ${Object.keys(COMMANDS).join(', ')}`;
  },
};

const interactive = process.stdin.isTTY;
const rl = readline.createInterface({ input: process.stdin, terminal: false });
if (interactive) process.stdout.write('opensignup> ');
for await (const line of rl) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const [cmd, ...rest] = trimmed.split(/\s+/);
  const fn = COMMANDS[cmd];
  const arg = trimmed.slice(cmd.length).trim();
  console.log(`> ${trimmed}`);
  if (!fn) {
    failures++;
    console.log(`ERROR: unknown command "${cmd}" (try: help)`);
  } else {
    try {
      console.log(await fn(arg || rest.join(' ')));
    } catch (e) {
      failures++;
      console.log(`ERROR: ${e.message.split('\n')[0]}`);
    }
  }
  if (cmd === 'quit') break;
  if (interactive) process.stdout.write('opensignup> ');
}
await browser?.close();
process.exit(failures ? 1 : 0);
