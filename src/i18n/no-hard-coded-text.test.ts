import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * The rules against hard-coded text: `react/jsx-no-literals` for JSX text and
 * `opensignup/no-literal-text-props`, the local rule in eslint.config.mjs, for
 * the props people read. Both are on only where the text has moved to the
 * catalogs (`TRANSLATED` there). Run through the repo's own config, so these
 * also prove the rules are on for the files listed and off elsewhere.
 */
const ROOT = resolve(import.meta.dirname, '../..');
const RULES = ['react/jsx-no-literals', 'opensignup/no-literal-text-props'];
const eslint = new ESLint({ cwd: ROOT });

/** The first file whose text moved to the catalogs, so the rules are on for it. */
const TRANSLATED_FILE = 'src/components/site-footer.tsx';
/** A file the rules are off for. */
const OTHER_FILE = 'src/components/example.tsx';

async function lint(jsx: string, filePath = TRANSLATED_FILE): Promise<string[]> {
  const code = `import { useTranslations } from 'next-intl';
export function Example({ name, open, label }: { name: string; open: boolean; label?: string }) {
  const t = useTranslations('common.footer');
  return (<>${jsx}</>);
}
`;
  const [result] = await eslint.lintText(code, { filePath });
  // A fixture that doesn't parse would pass every rule without being looked at.
  const fatal = result?.messages.find((message) => message.fatal);
  if (fatal) throw new Error(`fixture doesn't parse: ${fatal.message}`);
  return (result?.messages ?? [])
    .filter((message) => message.ruleId !== null && RULES.includes(message.ruleId))
    .map((message) => `${message.ruleId}: ${message.message}`);
}

/**
 * `filesAt` from eslint.config.mjs, which turns `TRANSLATED` into the config's
 * `files`. Imported at runtime because TypeScript has no types for the .mjs.
 */
async function loadFilesAt(): Promise<(paths: string[], root?: string) => string[]> {
  const config = (await import(pathToFileURL(resolve(ROOT, 'eslint.config.mjs')).href)) as {
    filesAt: (paths: string[], root?: string) => string[];
  };
  return config.filesAt;
}

/** Whether ESLint, run from `cwd`, puts `file` under a block whose `files` are `files`. */
async function matches(cwd: string, files: string[], file: string): Promise<boolean> {
  const matcher = new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: [{ files: ['**/*.tsx'] }, { files, rules: { 'no-console': 'error' } }],
  });
  return Boolean((await matcher.calculateConfigForFile(file))?.rules?.['no-console']);
}

/** The props `opensignup/no-literal-text-props` reads as text. */
const TEXT_PROPS = ['aria-label', 'aria-description', 'title', 'placeholder', 'alt', 'label'];

/** Hard-coded text, as JSX children. */
const JSX_TEXT = [
  ['text', '<p>Sign up</p>'],
  ['text next to a value', '<p>{name} signed up</p>'],
  ['a string in braces', "<p>{'Sign up'}</p>"],
  ['a template', '<p>{`${name} signed up`}</p>'],
] as const;

/** Hard-coded text on a prop people read, written each way it can be. */
const PROP_TEXT = [
  ['a string', '<button aria-label="Close" />', 1],
  ['a string in braces', "<button aria-label={'Close'} />", 1],
  ['a template', '<button aria-label={`Close ${name}`} />', 1],
  ['a string added to a value', "<button aria-label={'Close ' + name} />", 1],
  ['either branch of a condition', "<button aria-label={open ? 'Close' : 'Open'} />", 2],
  ['a fallback', "<button aria-label={label ?? 'Options'} />", 1],
] as const;

/** What a translated file may have. */
const ALLOWED = [
  ['a translated child', "<p>{t('help')}</p>"],
  ['a translated prop', "<nav aria-label={t('label')} />"],
  ['a value from a prop', '<button aria-label={label} title={name} />'],
  ['a class name', '<p className="flex gap-2 text-sm" />'],
  ['a link', '<a href="/help" />'],
  [
    'strings on props nobody reads',
    '<input type="email" name="email" id="email" data-testid="email" />',
  ],
  // `alt=""` marks an image screen readers should skip.
  ['an empty alt', '<img alt="" src="/logo.png" />'],
  ['a prop without letters', '<span title={`${name} · ${label}`} />'],
  [
    'a string that only picks a branch',
    "<button aria-label={label === 'x' ? t('help') : t('label')} />",
  ],
  ['whitespace between elements', "<p>\n  {t('help')}\n  {t('label')}\n</p>"],
] as const;

beforeAll(async () => {
  // The first run loads every plugin the config names.
  await lint('');
}, 60_000);

describe('hard-coded text in translated files', () => {
  it.each(JSX_TEXT)('fails JSX with %s', async (_, jsx) => {
    const problems = await lint(jsx);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^react\/jsx-no-literals: /);
  });

  it.each(PROP_TEXT)('fails a text prop with %s', async (_, jsx, count) => {
    const problems = await lint(jsx);
    expect(problems).toHaveLength(count);
    for (const problem of problems) expect(problem).toMatch(/^opensignup\/no-literal-text-props: /);
  });

  it.each(TEXT_PROPS)('fails %s with a string', async (prop) => {
    expect(await lint(`<Example ${prop}="Your name" name="" open />`)).toEqual([
      `opensignup/no-literal-text-props: ${prop} is text people read or hear, so it comes from the message catalog: pass t('…'), not a string.`,
    ]);
  });

  it.each(ALLOWED)('passes %s', async (_, jsx) => {
    expect(await lint(jsx)).toEqual([]);
  });
});

describe('where the rules apply', () => {
  const failing = [...JSX_TEXT, ...PROP_TEXT.map(([name, jsx]) => [name, jsx] as const)];
  it.each(failing)('passes %s in a file not yet translated', async (_, jsx) => {
    expect(await lint(jsx, OTHER_FILE)).toEqual([]);
  });

  it('matches a listed folder with brackets or parentheses in its name, and nothing else', async () => {
    const filesAt = await loadFilesAt();
    const files = filesAt(['src/app/s/[slug]', 'src/app/app/(chrome)/']);
    // A glob would read `[slug]` as one of the letters s, l, u and g.
    const isOn = (file: string) => matches(ROOT, files, file);
    expect(await isOn('src/app/s/[slug]/page.tsx')).toBe(true);
    expect(await isOn('src/app/s/[slug]/c/[id]/page.tsx')).toBe(true);
    expect(await isOn('src/app/app/(chrome)/settings/page.tsx')).toBe(true);
    expect(await isOn('src/app/s/s/page.tsx')).toBe(false);
    expect(await isOn('src/app/app/c/settings/page.tsx')).toBe(false);
  });

  // Windows can't put a backslash in a folder's name.
  it.skipIf(process.platform === 'win32')(
    'matches a listed folder with a backslash in its name, and nothing else',
    async () => {
      const filesAt = await loadFilesAt();
      const root = mkdtempSync(join(tmpdir(), 'files-at-'));
      try {
        mkdirSync(join(root, 'a\\b'));
        const files = filesAt(['a\\b'], root);
        // A glob reads a lone backslash as escaping the next letter, so `a\b` would be `ab`.
        expect(await matches(root, files, 'a\\b/page.tsx')).toBe(true);
        expect(await matches(root, files, 'ab/page.tsx')).toBe(false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it('stops at a listed path that does not exist', async () => {
    const filesAt = await loadFilesAt();
    expect(() => filesAt(['src/app/nowhere'])).toThrow(
      "eslint.config.mjs lists src/app/nowhere, which doesn't exist.",
    );
  });
});
