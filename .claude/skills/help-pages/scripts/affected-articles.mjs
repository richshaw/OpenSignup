#!/usr/bin/env node
// Which help articles might a code change affect?
//
//   node .claude/skills/help-pages/scripts/affected-articles.mjs [base-ref]
//
// Compares base-ref (default: where this branch left origin/main) with the
// working tree, uncommitted changes included, and for each article reports:
//   - on-screen names from its .ui.ts list that a changed line removed or
//     rewrote (a renamed or deleted button, label or message),
//   - modules it imports facts from (constants, site config) that changed,
//   - direct edits to the article, its name list or its walkthrough.
// Then it lists changed screen files no article matched, which is where a
// new or reshaped task hides. It's a starting point, not a verdict: read the
// articles it names, and the diff, before deciding.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const git = (...args) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 256 << 20,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const fail = (message) => {
  console.error(message);
  process.exit(1);
};
process.chdir(git('rev-parse', '--show-toplevel').trim());

function resolveBase(arg) {
  if (arg) {
    try {
      git('rev-parse', '--verify', `${arg}^{commit}`);
      return arg;
    } catch {
      fail(`"${arg}" isn't a commit git knows. Pass a branch, tag or commit, such as HEAD~1.`);
    }
  }
  for (const ref of ['origin/main', 'main']) {
    try {
      return git('merge-base', 'HEAD', ref).trim();
    } catch {
      // Not fetched here (a single-branch or shallow clone); try the next.
    }
  }
  fail(
    'Found neither origin/main nor main to compare with. Run `git fetch origin main`,' +
      ' or pass a base: affected-articles.mjs <base-ref>',
  );
}

const base = resolveBase(process.argv[2]);
const HELP_DIRS = ['src/help/', 'tests/e2e/help/', 'public/help/', 'docs/writing-help.md'];
const isHelpFile = (f) => HELP_DIRS.some((d) => f.startsWith(d));
// Pages and components organizers see. API routes and route handlers aren't screens.
const isScreenFile = (f) =>
  /^src\/(app|components)\//.test(f) &&
  !/^src\/app\/(api|\.well-known)\//.test(f) &&
  !/\/route\.tsx?$/.test(f) &&
  /\.tsx?$/.test(f) &&
  !/\.test\.tsx?$/.test(f) &&
  !isHelpFile(f);

const changed = new Set(git('diff', '--name-only', base).split('\n').filter(Boolean));
for (const f of git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)) {
  changed.add(f);
}

// Removed and added lines per file, outside the help code itself. A deleted
// file's diff ends its header with "+++ /dev/null", so it is filed under its
// old name: deleting a component removes every name it showed.
const lines = new Map(); // file -> { removed: string[], added: string[] }
let file = null;
let oldFile = null;
let inHeader = false;
for (const l of git('diff', '--unified=0', '--no-color', base).split('\n')) {
  if (l.startsWith('diff --git ')) {
    inHeader = true;
    file = null;
    continue;
  }
  if (inHeader) {
    if (l.startsWith('--- ')) oldFile = l.slice(4).replace(/^a\//, '');
    if (l.startsWith('+++ ')) {
      inHeader = false;
      const name = l.slice(4) === '/dev/null' ? oldFile : l.slice(4).replace(/^b\//, '');
      file = name && name !== '/dev/null' && !isHelpFile(name) ? name : null;
      if (file && !lines.has(file)) lines.set(file, { removed: [], added: [] });
    }
    continue;
  }
  if (!file) continue;
  if (l.startsWith('-')) lines.get(file).removed.push(l.slice(1));
  else if (l.startsWith('+')) lines.get(file).added.push(l.slice(1));
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A name counts only where it reads as UI text: a string literal, JSX text,
// or a line of its own. Bare-word matches ("Date", "Done") would be noise.
function mentions(line, name) {
  const n = escape(name);
  return new RegExp(
    `(['"\`])${n}\\1|>\\s*${n}\\s*<|^\\s*${n}\\s*$|>\\s*${n}\\s*$|^\\s*${n}\\s*<`,
  ).test(line);
}

function uiNames(uiFile) {
  const src = readFileSync(uiFile, 'utf8');
  return [...src.matchAll(/^\s*[\w$]+:\s*(['"])(.+?)\1,?\s*$/gm)].map((m) => m[2]);
}

function importedModules(articleFile) {
  const src = readFileSync(articleFile, 'utf8');
  return [...src.matchAll(/from\s+'@\/([^']+)'/g)].flatMap(([, mod]) =>
    ['.ts', '.tsx', '/index.ts', '/index.tsx']
      .map((ext) => `src/${mod}${ext}`)
      .filter((p) => existsSync(p)),
  );
}

const articleDir = 'src/help/articles';
const slugs = readdirSync(articleDir)
  .filter((f) => f.endsWith('.ui.ts'))
  .map((f) => f.slice(0, -'.ui.ts'.length));

const matchedScreenFiles = new Set();
const report = [];
for (const slug of slugs) {
  const reasons = [];
  const own = [
    `${articleDir}/${slug}.tsx`,
    `${articleDir}/${slug}.ui.ts`,
    `tests/e2e/help/${slug}.spec.ts`,
  ].filter((f) => changed.has(f));
  if (own.length) reasons.push(`edited directly: ${own.join(', ')}`);

  for (const name of uiNames(`${articleDir}/${slug}.ui.ts`)) {
    for (const [f, { removed, added }] of lines) {
      const gone = removed.filter((l) => mentions(l, name)).length;
      if (!gone) continue;
      const kept = added.filter((l) => mentions(l, name)).length;
      matchedScreenFiles.add(f);
      reasons.push(
        kept >= gone
          ? `"${name}": a line using it changed in ${f} (probably still there; check the screen)`
          : `"${name}": removed or renamed in ${f}`,
      );
    }
  }

  for (const mod of importedModules(`${articleDir}/${slug}.tsx`)) {
    if (changed.has(mod)) reasons.push(`imports facts from ${mod}, which changed`);
  }

  if (reasons.length) report.push({ slug, reasons });
}

console.log(
  `Compared ${base.slice(0, 12)} with the working tree: ${changed.size} changed file(s).\n`,
);
if (!report.length) {
  console.log('No help article names or facts are touched by this change.');
} else {
  for (const { slug, reasons } of report) {
    console.log(`${slug}  (src/help/articles/${slug}.tsx)`);
    for (const r of [...new Set(reasons)]) console.log(`  - ${r}`);
    console.log('');
  }
}

const unmatched = [...changed].filter((f) => isScreenFile(f) && !matchedScreenFiles.has(f));
if (unmatched.length) {
  console.log('Screen files that changed without touching any article name:');
  for (const f of unmatched) console.log(`  ${f}`);
  console.log(
    '\nIf one changes how an organizer does a task a help page covers, check that page by hand.' +
      '\nIf it adds a new task organizers need to learn, it may need a new page.',
  );
}
console.log(`\nArticles: ${slugs.join(', ')}`);
