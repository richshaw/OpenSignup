#!/usr/bin/env node
// Scaffold a new help article and register it.
//
//   node .claude/skills/help-pages/scripts/new-article.mjs <slug> "<Title>" "<Summary>"
//
// Creates src/help/articles/<slug>.ui.ts, src/help/articles/<slug>.tsx and
// tests/e2e/help/<slug>.spec.ts, and adds the article to HELP_ARTICLES
// (src/help/articles.ts), HELP_BODIES (src/help/bodies.tsx) and the sitemap
// test's list of addresses (src/lib/seo.test.ts). The files hold
// TODO markers on purpose: the style checks fail on "TODO" and the walkthrough
// throws, so an unfinished page can't pass CI.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

process.chdir(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());

const [slug, title, summary] = process.argv.slice(2);
const usage = 'usage: new-article.mjs <slug> "<Title>" "<Summary>"';
if (!slug || !title || !summary) throw new Error(usage);
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
  throw new Error(`slug must be lowercase words joined by dashes: ${slug}`);

const files = {
  ui: `src/help/articles/${slug}.ui.ts`,
  body: `src/help/articles/${slug}.tsx`,
  spec: `tests/e2e/help/${slug}.spec.ts`,
};
for (const f of Object.values(files)) if (existsSync(f)) throw new Error(`${f} already exists`);
if (readFileSync('src/help/articles.ts', 'utf8').includes(`slug: '${slug}'`)) {
  throw new Error(`${slug} is already in HELP_ARTICLES`);
}

const component = slug.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
const uiAlias = `${component[0].toLowerCase()}${component.slice(1)}Ui`;
const quote = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

// Every edit is worked out and checked first, then all are written together,
// so a registry this script can't find leaves the tree as it was.
const writes = new Map(); // path -> new contents

writes.set(
  files.ui,
  `/**
 * Every on-screen name "${title}" relies on. The article prints them and its
 * walkthrough (\`tests/e2e/help/${slug}.spec.ts\`) finds them by the same
 * strings, so renaming one on screen fails that test until it's changed here.
 * No imports: the Playwright runner loads this file too.
 */
export const UI = {
  // TODO: every button, link, box and message the steps name, exactly as on screen.
  yourSignups: 'Your signups',
} as const;
`,
);

writes.set(
  files.body,
  `import { Step, Steps, Ui } from '../components';
import { UI } from './${slug}.ui';

export { UI };

export function ${component}() {
  return (
    <>
      <p>TODO: what the reader will have when they finish, in one or two short sentences.</p>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">TODO first part of the task</h2>
        <Steps>
          <Step>
            <p>
              TODO: one action per step. On <Ui>{UI.yourSignups}</Ui>, choose …
            </p>
          </Step>
        </Steps>
      </section>
    </>
  );
}
`,
);

writes.set(
  files.spec,
  `/**
 * Walkthrough for the help article "${title}"
 * (src/help/articles/${slug}.tsx). It follows the article's steps by the same
 * on-screen names, so a renamed or moved control fails here and points at the
 * article. With HELP_SCREENSHOTS=1 it also refreshes the article's pictures.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { UI } from '@/help/articles/${slug}.ui';
import { loginAsSeededOrganizer } from '../helpers/auth';

const SLUG = '${slug}';
const CAPTURE = process.env.HELP_SCREENSHOTS === '1';
const SHOT_DIR = \`public/help/\${SLUG}\`;

async function shot(page: Page, target: Locator, name: string): Promise<void> {
  if (!CAPTURE) return;
  // Fonts and the save indicator settle after the last action.
  await page.waitForTimeout(300);
  await target.screenshot({ path: \`\${SHOT_DIR}/\${name}.png\`, animations: 'disabled' });
}

test.describe(${quote(`help: ${title.toLowerCase()}`)}, () => {
  // Screenshots at 2x so text stays sharp; the article sizes them in CSS pixels.
  test.use({ deviceScaleFactor: 2 });

  test('the steps work as written', async ({ page, context, isMobile }) => {
    test.skip(isMobile, 'give the phone path its own test with a phone viewport');
    await loginAsSeededOrganizer(context);
    await page.goto('/app');
    await expect(page.getByRole('heading', { name: UI.yourSignups })).toBeVisible();
    await shot(page, page.locator('main'), 'start');
    // TODO: follow every step by the names in UI, and assert what the article says happens.
    throw new Error('TODO: write this walkthrough before the article ships');
  });
});
`,
);

// Register: HELP_ARTICLES entry, then the body and its UI list.
const articlesPath = 'src/help/articles.ts';
const articles = readFileSync(articlesPath, 'utf8');
const close = '] as const satisfies readonly HelpArticleMeta[];';
if (!articles.includes(close))
  throw new Error(`can't find the end of HELP_ARTICLES in ${articlesPath}`);
writes.set(
  articlesPath,
  articles.replace(
    close,
    `  {\n    slug: ${quote(slug)},\n    title: ${quote(title)},\n    summary: ${quote(summary)},\n  },\n${close}`,
  ),
);

const bodiesPath = 'src/help/bodies.tsx';
let bodies = readFileSync(bodiesPath, 'utf8');
const iface = 'export interface HelpBody';
const map = 'export const HELP_BODIES: Record<HelpSlug, HelpBody> = {';
if (!bodies.includes(iface) || !bodies.includes(map))
  throw new Error(`can't find where to register in ${bodiesPath}`);
bodies = bodies.replace(
  `\n\n${iface}`,
  `\nimport { ${component}, UI as ${uiAlias} } from './articles/${slug}';\n\n${iface}`,
);
const mapStart = bodies.indexOf(map);
const mapEnd = bodies.indexOf('\n};', mapStart);
bodies = `${bodies.slice(0, mapEnd)}\n  ${quote(slug)}: { Body: ${component}, ui: ${uiAlias} },${bodies.slice(mapEnd)}`;
writes.set(bodiesPath, bodies);

// The sitemap test lists every indexable address, help articles included.
const seoTestPath = 'src/lib/seo.test.ts';
const seoTest = readFileSync(seoTestPath, 'utf8');
const lastHelp = seoTest.lastIndexOf("'https://example.test/help/");
if (lastHelp === -1) throw new Error(`can't find the help addresses in ${seoTestPath}`);
const lineEnd = seoTest.indexOf('\n', lastHelp);
writes.set(
  seoTestPath,
  `${seoTest.slice(0, lineEnd)}\n      'https://example.test/help/${slug}',${seoTest.slice(lineEnd)}`,
);

for (const [f, contents] of writes) writeFileSync(f, contents);

execFileSync(
  'pnpm',
  ['exec', 'prettier', '--write', ...Object.values(files), articlesPath, bodiesPath, seoTestPath],
  {
    stdio: 'ignore',
  },
);

console.log(`Created ${Object.values(files).join(', ')}`);
console.log(`Registered in ${articlesPath}, ${bodiesPath} and the sitemap test (${seoTestPath}).`);
console.log(`Page: /help/${slug}. Fill in every TODO; \`pnpm test src/help\` fails until you do.`);
