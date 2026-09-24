#!/usr/bin/env node
// Headless-Chromium REPL for driving a running OpenSignup (see app.sh start).
// One command per line on stdin; `help` lists them. Run from the repo root:
//
//   node .claude/skills/run-opensignup/driver.mjs <<'EOF'
//   login
//   nav /app/signups/${draftSignupId}/build
//   ss build
//   EOF
//
// `${key}` is replaced with that key from tests/e2e/.seed.json (re-read on every
// line, since `app.sh seed` and the e2e suite rewrite it). Piped input stops at the
// first failing command and exits 1; a TTY session reports the error and carries on.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const SHOTS = process.env.SHOTS_DIR ?? '/tmp/opensignup-shots';
const SEED_FILE = path.join(REPO, 'tests/e2e/.seed.json');
// The installed Playwright expects a browser build this container doesn't have;
// the preinstalled Chromium works. CHROMIUM_PATH overrides.
const CHROMIUM =
  process.env.CHROMIUM_PATH ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const HELP = `commands. Selectors are Playwright selectors: css, text=..., role=button[name="Publish"]
(a quoted role name must match the whole name; role=link[name=/Sign in/] matches part of it):
  nav <path|url>              go to a page, print where it ended up (redirects included)
  click <selector>            click the first visible match
  fill <selector> = <value>   type into an input (fill-label <Label> = <value> finds it by label)
  press <key>                 e.g. Enter
  wait-for <selector>         wait until visible
  wait-url <text>             wait until the URL contains <text>
  url | text <selector>       print the URL / the element's text
  ss <name> [caption...]      screenshot to ${SHOTS}/NN-<name>.png; a caption adds a bar with it and the URL
  login                       sign in as the seeded organizer (installs the seeded session cookie)
  logout                      drop this browser's cookies (a session ending elsewhere; the DB row stays)
  send-link [email]           on /login: fill the email (default: seeded organizer), press Send magic link
  email-link [email]          open the link that email would carry (then: click role=link[name=/Sign in/])
  tab <n>                     switch to tab n (0-based), opening it if new; tabs share cookies
  device desktop|phone        new browser context at 1280x800 or iPhone 14 size (drops cookies and tabs)
  errors                      console errors and page errors since the last call
  eval <js expression>        evaluate in the page, print JSON
  sql <query>                 run against DATABASE_URL, print rows
  seed                        print the seeded ids usable as \${key}
  sleep <ms> | help | quit`;

const strict = !process.stdin.isTTY;
let browser;
let context;
let pages = [];
let current = 0;
let shotCount = 0;
let pageErrors = [];

const page = () => pages[current];

function readSeed() {
  return existsSync(SEED_FILE) ? JSON.parse(readFileSync(SEED_FILE, 'utf8')) : {};
}

function expand(line) {
  const seed = readSeed();
  return line.replace(/\$\{(\w+)\}/g, (m, key) => {
    if (!(key in seed)) throw new Error(`no ${key} in tests/e2e/.seed.json (run app.sh seed)`);
    return String(seed[key]);
  });
}

function abs(target) {
  return /^https?:/.test(target) ? target : `${BASE}${target.startsWith('/') ? '' : '/'}${target}`;
}

function shown(url) {
  // Decode twice (the emailed link nests a URL) and never show a sign-in token.
  let out = url.replace(BASE, '');
  try {
    out = decodeURIComponent(decodeURIComponent(out));
  } catch {
    // leave as is
  }
  return out.replace(/token=[0-9a-f]+/g, 'token=[redacted]');
}

function watch(p) {
  p.setDefaultTimeout(10_000);
  p.setDefaultNavigationTimeout(30_000);
  p.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(`console: ${msg.text()}`);
  });
  p.on('pageerror', (err) => pageErrors.push(`pageerror: ${err.message}`));
  return p;
}

async function openContext(device) {
  if (context) await context.close();
  let options = { viewport: { width: 1280, height: 800 } };
  if (device === 'phone') {
    const { defaultBrowserType: _unused, ...iphone } = devices['iPhone 14'];
    options = iphone;
  } else if (device !== 'desktop') {
    throw new Error('device desktop|phone');
  }
  context = await browser.newContext(options);
  pages = [watch(await context.newPage())];
  current = 0;
}

function splitValue(rest, usage) {
  const at = rest.indexOf(' = ');
  if (at < 0) throw new Error(usage);
  return [rest.slice(0, at).trim(), rest.slice(at + 3)];
}

async function screenshot(name, caption) {
  mkdirSync(SHOTS, { recursive: true });
  shotCount += 1;
  const file = path.join(
    SHOTS,
    `${String(shotCount).padStart(2, '0')}-${name.replace(/[^\w.-]+/g, '-')}.png`,
  );
  if (caption) {
    await page().evaluate(
      ({ caption, url }) => {
        const bar = document.createElement('div');
        bar.id = '__driver_caption';
        const title = document.createElement('div');
        title.style.fontWeight = '600';
        title.textContent = caption;
        const where = document.createElement('div');
        where.style.opacity = '0.8';
        where.textContent = `URL: ${url}`;
        bar.append(title, where);
        Object.assign(bar.style, {
          position: 'fixed',
          left: '0',
          right: '0',
          top: '0',
          zIndex: '2147483647',
          background: '#111827',
          color: '#fff',
          padding: '8px 12px',
          overflowWrap: 'anywhere',
          font: `${window.innerWidth < 500 ? 11 : 13}px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace`,
        });
        document.body.appendChild(bar);
        document.documentElement.style.marginTop = `${bar.offsetHeight}px`;
      },
      { caption, url: shown(page().url()) },
    );
  }
  await page().screenshot({ path: file });
  if (caption) {
    await page().evaluate(() => {
      document.getElementById('__driver_caption')?.remove();
      document.documentElement.style.marginTop = '';
    });
  }
  return file;
}

function sql(query) {
  const env = readFileSync(path.join(REPO, '.env.local'), 'utf8');
  const url = /^DATABASE_URL=(.*)$/m.exec(env)?.[1];
  if (!url) throw new Error('no DATABASE_URL in .env.local');
  return execFileSync('psql', [url, '-tA', '-F', ' | ', '-c', query]).toString().trimEnd();
}

function emailedLink(email) {
  const script = path.join(HERE, 'emailed-link.ts');
  return execFileSync('pnpm', ['-s', 'exec', 'tsx', script, email], {
    cwd: REPO,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .toString()
    .trim();
}

async function run(line) {
  const space = line.indexOf(' ');
  const cmd = space < 0 ? line : line.slice(0, space);
  const rest = space < 0 ? '' : line.slice(space + 1).trim();
  const p = page();
  switch (cmd) {
    case 'help':
      return HELP;
    case 'nav':
      await p.goto(abs(rest));
      await p.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      return shown(p.url());
    case 'click':
      await p.locator(rest).filter({ visible: true }).first().click();
      await p.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      return shown(p.url());
    case 'fill': {
      const [selector, value] = splitValue(rest, 'fill <selector> = <value>');
      await p.locator(selector).filter({ visible: true }).first().fill(value);
      return '';
    }
    case 'fill-label': {
      const [label, value] = splitValue(rest, 'fill-label <Label> = <value>');
      await p.getByLabel(label).filter({ visible: true }).first().fill(value);
      return '';
    }
    case 'press':
      await p.keyboard.press(rest);
      return '';
    case 'wait-for':
      await p.locator(rest).filter({ visible: true }).first().waitFor();
      return '';
    case 'wait-url':
      await p.waitForURL((u) => u.href.includes(rest));
      return shown(p.url());
    case 'url':
      return shown(p.url());
    case 'text':
      return (await p.locator(rest).filter({ visible: true }).first().innerText())
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500);
    case 'ss': {
      const [name, ...caption] = rest.split(' ');
      if (!name) throw new Error('ss <name> [caption...]');
      return screenshot(name, caption.join(' '));
    }
    case 'login': {
      const { sessionToken } = readSeed();
      if (!sessionToken) throw new Error('no seeded session (run app.sh seed)');
      const secure = BASE.startsWith('https://');
      await context.addCookies([
        {
          name: secure ? '__Secure-authjs.session-token' : 'authjs.session-token',
          value: sessionToken,
          url: BASE,
          httpOnly: true,
          secure,
          sameSite: 'Lax',
        },
      ]);
      return 'session cookie set';
    }
    case 'logout':
      await context.clearCookies();
      return 'cookies cleared';
    case 'send-link':
      await p.getByLabel('Email').fill(rest || readSeed().organizerEmail);
      await p.getByRole('button', { name: 'Send magic link' }).click();
      await p.getByPlaceholder('123456').waitFor();
      return 'sent';
    case 'email-link':
      await p.goto(emailedLink(rest || readSeed().organizerEmail));
      return shown(p.url());
    case 'tab': {
      const n = Number(rest);
      if (!Number.isInteger(n) || n < 0 || n > pages.length)
        throw new Error(`tab 0..${pages.length}`);
      if (n === pages.length) pages.push(watch(await context.newPage()));
      current = n;
      await pages[n].bringToFront();
      return `tab ${n}: ${shown(pages[n].url())}`;
    }
    case 'device':
      await openContext(rest);
      return `${rest}, one blank tab`;
    case 'errors': {
      const out = pageErrors.length ? pageErrors.join('\n') : 'none';
      pageErrors = [];
      return out;
    }
    case 'eval':
      return JSON.stringify(await p.evaluate(rest));
    case 'sql':
      return sql(rest);
    case 'seed': {
      const seed = readSeed();
      return Object.entries(seed)
        .filter(([k]) => !/token/i.test(k))
        .map(([k, v]) => `${k} = ${v}`)
        .join('\n');
    }
    case 'sleep':
      await new Promise((r) => setTimeout(r, Number(rest) || 1000));
      return '';
    default:
      throw new Error(`unknown command "${cmd}" (try help)`);
  }
}

browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
await openContext('desktop');
let failed = false;
const rl = readline.createInterface({ input: process.stdin, terminal: false });
for await (const raw of rl) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  if (line === 'quit' || line === 'exit') break;
  console.log(`> ${line}`);
  try {
    const out = await run(expand(line));
    if (out) console.log(String(out).replace(/^/gm, '  '));
  } catch (err) {
    console.log(`  ERROR: ${String(err?.message ?? err).split('\n')[0]}`);
    failed = true;
    if (strict) break;
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
