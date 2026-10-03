/**
 * Checks each page's first-load JavaScript against budgets.json.
 *
 * Run after `pnpm build`. A page's size is the gzipped JavaScript a browser
 * downloads on a first visit: the page's own chunks, those of every layout
 * above it, and those of any parallel-route slot rendered beside it (such as
 * @crumbs). Next's build table counts the page's chunks only, so it reads a
 * little lower. A route listed in budgets.json is held to its own number;
 * every other page to "*". Over budget fails; well under prints a note to
 * lower the budget, so a saving stays saved.
 *
 * In CI it also writes the table, and on a pull request what the change adds
 * and removes, to the job summary.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const LOWER_NOTE_KB = 2;

const manifestPath = '.next/app-build-manifest.json';
if (!existsSync(manifestPath)) {
  console.error(`${manifestPath} not found. Run pnpm build first.`);
  process.exit(1);
}
const entries = JSON.parse(readFileSync(manifestPath, 'utf8')).pages;
const budgets = JSON.parse(readFileSync('budgets.json', 'utf8')).firstLoadJsKb;

// A manifest entry is a folder path plus /page or /layout. Route groups like
// (chrome) decide which layouts wrap a page, so ancestry is matched on the
// folder path; neither they nor slots like @crumbs appear in the URL.
const dirOf = (entry) => entry.slice(0, entry.lastIndexOf('/'));
const urlOf = (dir) => dir.replace(/\/[(@][^/]*/g, '') || '/';

const gzipped = new Map();
function gzippedSize(file) {
  if (!gzipped.has(file)) gzipped.set(file, gzipSync(readFileSync(`.next/${file}`)).length);
  return gzipped.get(file);
}

const layouts = Object.keys(entries)
  .filter((e) => e.endsWith('/layout'))
  .map((e) => ({ dir: dirOf(e), files: entries[e] }));
const pages = Object.keys(entries).filter((e) => e.endsWith('/page'));
const slots = pages.filter((e) => e.includes('/@'));

const rows = pages
  .filter((e) => !e.includes('/@'))
  .map((e) => {
    const dir = dirOf(e);
    const route = urlOf(dir);
    const files = new Set(entries[e]);
    const add = (list) => list.forEach((f) => files.add(f));
    for (const layout of layouts) {
      if (dir === layout.dir || dir.startsWith(`${layout.dir}/`)) add(layout.files);
    }
    for (const slot of slots) {
      if (urlOf(dirOf(slot)) === route) add(entries[slot]);
    }
    const bytes = [...files]
      .filter((f) => f.endsWith('.js'))
      .reduce((sum, f) => sum + gzippedSize(f), 0);
    const named = route in budgets;
    return { route, kb: bytes / 1000, budget: named ? budgets[route] : budgets['*'], named };
  })
  .sort((a, b) => b.kb - a.kb);

for (const route of Object.keys(budgets)) {
  if (route !== '*' && !rows.some((r) => r.route === route)) {
    console.error(`budgets.json lists ${route}, but the build has no such page.`);
    process.exit(1);
  }
}

const over = rows.filter((r) => r.kb > r.budget);
const largestOther = rows.find((r) => !r.named);
// The largest unnamed page stands for the "*" budget.
const roomy = rows.filter(
  (r) => (r.named || r === largestOther) && r.budget - r.kb > LOWER_NOTE_KB,
);
const shown = rows.filter((r) => r.named || r.kb > r.budget || r === largestOther);

const fmt = (kb) => `${kb.toFixed(1)} kB`;
const table = [
  '| Page | First-load JS (gzip) | Budget |',
  '| --- | --- | --- |',
  ...shown.map(
    (r) =>
      `| \`${r.route}\` | ${fmt(r.kb)} | ${r.budget} kB${r.named ? '' : ' (any other page)'}${r.kb > r.budget ? ' ❌' : ''} |`,
  ),
];

console.log(table.join('\n'));
for (const r of over) {
  console.error(
    `${r.route} loads ${fmt(r.kb)} of JavaScript, over its ${r.budget} kB budget. ` +
      'Make it smaller, or raise the budget in budgets.json and say why in the PR.',
  );
}
for (const r of roomy) {
  const what = r.named ? `${r.route} loads` : 'The largest page without its own budget loads';
  const which = r.named ? 'its' : 'the "*"';
  console.log(
    `${what} ${fmt(r.kb)}, well under ${which} ${r.budget} kB budget. ` +
      `Lower it to ${Math.ceil(r.kb) + 1} in budgets.json so it stays there.`,
  );
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const summary = ['### Page weight', '', ...table, ''];
  if (process.env.GITHUB_BASE_REF) summary.push(...changeCost());
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary.join('\n')}\n`);
}

process.exit(over.length > 0 ? 1 : 0);

/**
 * What a pull request adds and takes away. CI checks out the merge commit,
 * whose first parent is the base branch, so HEAD^1..HEAD is exactly the change.
 */
function changeCost() {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const lines = git('diff', '--shortstat', 'HEAD^1', 'HEAD', '--', '.', ':!pnpm-lock.yaml');
  const deps = (pkg) => Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const before = deps(JSON.parse(git('show', 'HEAD^1:package.json')));
  const after = deps(JSON.parse(readFileSync('package.json', 'utf8')));
  const added = after.filter((d) => !before.includes(d));
  const removed = before.filter((d) => !after.includes(d));
  const list = (names) => (names.length > 0 ? names.map((n) => `\`${n}\``).join(', ') : 'none');
  return [
    '### Cost of this change',
    '',
    `- Lines (lockfile aside): ${lines || 'no change'}`,
    `- Dependencies added: ${list(added)}`,
    `- Dependencies removed: ${list(removed)}`,
    '',
  ];
}
