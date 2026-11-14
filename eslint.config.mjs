import { FlatCompat } from '@eslint/eslintrc';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

/**
 * The files and folders whose text has moved to the message catalogs. In
 * these, text people read must come from a translator, so JSX text and a
 * string on a prop like `aria-label` are lint errors (the last block of
 * `config`). When an area moves to the catalogs, add its file or folder here
 * in the same PR, as the path from the repo's root, written as it is on disk:
 * `src/app/s/[slug]` takes in everything under that folder, brackets and all.
 * Lint stops with an error if a path here doesn't exist.
 *
 * Text that reads the same in every language, like a name, can be let through
 * where it stands with an eslint-disable comment that says why.
 */
const TRANSLATED = [
  'src/components/site-footer.tsx',
  'src/components/banner.tsx',
  'src/components/ui/BottomSheet.tsx',
  // Everything a participant sees under a signup's address: its page, the
  // sign-up sheet, the pages for changing or cancelling a spot and for
  // turning reminders off, both not-found pages, and the copy helpers.
  'src/app/s/[slug]',
  // The emails a participant gets, the pieces they share, and any email
  // added here later, but the sign-in email (`NOT_YET_TRANSLATED`).
  'src/email/templates',
];

/**
 * Files inside a `TRANSLATED` folder whose text hasn't moved yet, left out of
 * the rules until it does, written as in `TRANSLATED`. The sign-in email is
 * organizer text, which moves to the catalogs after the participant's.
 */
const NOT_YET_TRANSLATED = ['src/email/templates/magic-link.tsx'];

/**
 * Glob patterns for `files` that match exactly `paths`, each a file or a
 * folder relative to `root` (the repo's root unless a test gives another): a
 * folder takes in everything under it, and the characters a glob reads
 * specially (`[slug]`, `(chrome)`, and the backslash it escapes them with) are
 * escaped, so they match only themselves.
 */
export function filesAt(paths, root = __dirname) {
  return paths.map((entry) => {
    const stats = statSync(path.join(root, entry), { throwIfNoEntry: false });
    if (!stats) throw new Error(`eslint.config.mjs lists ${entry}, which doesn't exist.`);
    const glob = entry.replace(/\/+$/, '').replace(/[\\*?[\]{}()!+@]/g, '\\$&');
    return stats.isDirectory() ? `${glob}/**` : glob;
  });
}

// OpenSignup's own rules, as a local plugin. To add one, put it in
// `opensignup.rules` and turn it on as `opensignup/<name>` in a block of
// `config` for the files it's meant for. src/i18n/no-catalogs-in-client.test.ts
// shows how to test one against this config.

const SRC = path.join(__dirname, 'src');

/** The message catalogs, one JSON file per language (`en.json`). */
const MESSAGES = path.join(SRC, 'messages');

/**
 * The translator lives here, and so does any other module that loads the
 * catalogs (put a new one here). A client file may import only what's in
 * `CLIENT_SAFE_I18N` from it, so a module added here later is kept out of the
 * browser without anyone listing it.
 */
const I18N = path.join(SRC, 'i18n');

/**
 * The modules in src/i18n/ a client file may import, as paths without their
 * extension. One goes on the list only if it loads no catalog, now or through
 * anything it imports.
 */
const CLIENT_SAFE_I18N = ['i18n/config'].map((module) => path.join(SRC, module));

/** What a client component does for its text instead. */
const CLIENT_TEXT_INSTEAD =
  "Translate in a server component and pass the text in as props, or call next-intl's useTranslations under <ClientMessages> (src/i18n/ClientMessages.tsx), which a server component gives the messages from messagesFor.";

/** What to do instead of importing next-intl's messages provider. */
const PROVIDER_INSTEAD =
  'Only src/i18n/ClientMessages.tsx may import the messages provider: wrap the client components in <ClientMessages>, with the messages from messagesFor, instead.';

/** Whether the file opens with a 'use client' directive, which is how Next decides. */
function isClientFile(program) {
  for (const statement of program.body) {
    if (statement.type !== 'ExpressionStatement' || typeof statement.directive !== 'string') {
      return false;
    }
    if (statement.directive === 'use client') return true;
  }
  return false;
}

/** The absolute path an import specifier names, or null for a package. */
function resolveSpecifier(specifier, filename) {
  if (specifier.startsWith('@/')) return path.resolve(SRC, specifier.slice(2));
  if (specifier.startsWith('.')) return path.resolve(path.dirname(filename), specifier);
  return null;
}

const isUnder = (target, dir) => target === dir || target.startsWith(dir + path.sep);

/** 'catalog' for a catalog, 'importer' for a module in src/i18n/ that isn't client-safe, else null. */
function catalogKind(target) {
  // `en.json`, but not `en.d.json`: that finds the declaration next-intl
  // writes beside the catalog (`en.d.json.ts`), which imports nothing.
  if (path.dirname(target) === MESSAGES && /^[^.]+\.json$/.test(path.basename(target))) {
    return 'catalog';
  }
  const modulePath = target.replace(/\.[cm]?[jt]sx?$/, '');
  return isUnder(modulePath, I18N) && !CLIENT_SAFE_I18N.includes(modulePath) ? 'importer' : null;
}

/**
 * The same for an import whose path is built at runtime, like
 * `@/messages/${locale}.json`: the bundler takes in every file under the
 * folder its fixed part names.
 */
function catalogKindUnder(dir) {
  if (isUnder(MESSAGES, dir)) return 'catalog';
  return isUnder(I18N, dir) || isUnder(dir, I18N) ? 'importer' : null;
}

/**
 * The fixed start of an import's path, and whether that's the whole path.
 * A template (`@/messages/${locale}.json`) or a `+` chain whose leftmost
 * operand is a string (`'@/messages/' + locale + '.json'`) has the rest added
 * at runtime. Null when the path doesn't start with a string.
 */
function pathStart(source) {
  if (source.type === 'Literal' && typeof source.value === 'string') {
    return { head: source.value, whole: true };
  }
  if (source.type === 'TemplateLiteral') {
    return { head: source.quasis[0]?.value.cooked ?? '', whole: source.expressions.length === 0 };
  }
  if (source.type === 'BinaryExpression' && source.operator === '+') {
    const start = pathStart(source.left);
    return start && { head: start.head, whole: false };
  }
  return null;
}

const isTypeOnly = (node, kind) =>
  node[kind] === 'type' ||
  (node.specifiers.length > 0 && node.specifiers.every((specifier) => specifier[kind] === 'type'));

const noCatalogsInClient = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Keep the message catalogs, and the translators that import them, out of 'use client' files.",
    },
    schema: [],
    messages: {
      catalog: `A 'use client' file can't import {{source}}: a message catalog holds the text of every page, and all of it would go into the browser's JavaScript. ${CLIENT_TEXT_INSTEAD}`,
      importer: `A 'use client' file can't import {{source}}: src/i18n/ is server code that loads every language's message catalog, and all of them would go into the browser's JavaScript. ${CLIENT_TEXT_INSTEAD} Or, if {{source}} loads no catalog, now or through its imports, list it in CLIENT_SAFE_I18N in eslint.config.mjs.`,
    },
  },
  create(context) {
    // Client files live all over src/, so the directive decides, not the path.
    if (!isClientFile(context.sourceCode.ast)) return {};

    function check(source) {
      const start = pathStart(source);
      if (!start) return;
      const { head, whole } = start;
      let kind = null;
      if (whole) {
        const target = resolveSpecifier(head, context.filename);
        kind = target && catalogKind(target);
      } else {
        const dir = resolveSpecifier(head.slice(0, head.lastIndexOf('/') + 1), context.filename);
        kind = dir && catalogKindUnder(dir);
      }
      if (kind) {
        context.report({
          node: source,
          messageId: kind,
          data: { source: context.sourceCode.getText(source) },
        });
      }
    }

    // Type-only imports and exports are compiled away, so they bring in nothing.
    return {
      ImportDeclaration(node) {
        if (!isTypeOnly(node, 'importKind')) check(node.source);
      },
      ExportNamedDeclaration(node) {
        if (node.source && !isTypeOnly(node, 'exportKind')) check(node.source);
      },
      ExportAllDeclaration(node) {
        if (node.exportKind !== 'type') check(node.source);
      },
      ImportExpression(node) {
        check(node.source);
      },
      'CallExpression[callee.type="Identifier"][callee.name="require"]'(node) {
        if (node.arguments[0]) check(node.arguments[0]);
      },
    };
  },
};

/**
 * Props whose value people read, or hear from a screen reader: the ones HTML
 * has, and the ones shared components take their text through (Banner's
 * `body`, BottomSheet's `eyebrow` and `description`, the signup page's state
 * message's `detail`, the sign-up dialog's `actionName`, `slotName` and
 * `slotContext`, the unsubscribe page's `error`, the email layout's `preview`,
 * the line an inbox shows after the subject). Any prop whose name ends in
 * `Label` or `Title` counts too (`closeLabel`, `dismissLabel`, `ariaLabel`,
 * the sign-up dialog's `slotTitle`): that's how a component takes the name of
 * a control it draws, or of the thing it shows. So does one of these keys in
 * an object passed as a prop, like the state message's `action={{ label, href }}`.
 */
const TEXT_PROPS = new Set([
  'aria-label',
  'aria-description',
  'title',
  'placeholder',
  'alt',
  'label',
  'body',
  'eyebrow',
  'description',
  'detail',
  'actionName',
  'slotName',
  'slotContext',
  'error',
  'preview',
]);

const isTextProp = (name) =>
  TEXT_PROPS.has(name) || name.endsWith('Label') || name.endsWith('Title');

/** A property's name, when it's written out (`label:` or `'label':`). */
function propertyName(property) {
  if (property.type !== 'Property' || property.computed) return null;
  if (property.key.type === 'Identifier') return property.key.name;
  return typeof property.key.value === 'string' ? property.key.value : null;
}

/** Whether a string has a letter in it: `alt=""` (an image to skip) and a lone `·` don't. */
const hasLetters = (text) => /\p{L}/u.test(text);

/** The string literals with letters in them that an attribute's value can be. */
function literalsIn(node) {
  switch (node?.type) {
    case 'Literal':
      return typeof node.value === 'string' && hasLetters(node.value) ? [node] : [];
    case 'TemplateLiteral':
      return node.quasis.some((quasi) => hasLetters(quasi.value.cooked ?? '')) ? [node] : [];
    case 'JSXExpressionContainer':
      return literalsIn(node.expression);
    case 'ConditionalExpression':
      return [...literalsIn(node.consequent), ...literalsIn(node.alternate)];
    case 'LogicalExpression':
      return [...literalsIn(node.left), ...literalsIn(node.right)];
    case 'BinaryExpression':
      return node.operator === '+' ? [...literalsIn(node.left), ...literalsIn(node.right)] : [];
    default:
      return [];
  }
}

/**
 * The literals in an object passed as a prop, under its text keys
 * (`action={{ label: '…', href }}`), each with the key's name as
 * `action.label`.
 */
function literalsInObject(value, attribute) {
  const object = value?.type === 'JSXExpressionContainer' ? value.expression : null;
  if (object?.type !== 'ObjectExpression') return [];
  return object.properties.flatMap((property) => {
    const key = propertyName(property);
    if (key === null || !isTextProp(key)) return [];
    return literalsIn(property.value).map((literal) => ({ literal, prop: `${attribute}.${key}` }));
  });
}

const noLiteralTextProps = {
  meta: {
    type: 'suggestion',
    docs: {
      description: `Keep hard-coded text off the props people read: ${[...TEXT_PROPS].join(', ')}, and any whose name ends in Label or Title.`,
    },
    schema: [],
    messages: {
      literal:
        "{{prop}} is text people read or hear, so it comes from the message catalog: pass t('…'), not a string.",
    },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier') return;
        const attribute = node.name.name;
        const found = isTextProp(attribute)
          ? literalsIn(node.value).map((literal) => ({ literal, prop: attribute }))
          : literalsInObject(node.value, attribute);
        for (const { literal, prop } of found) {
          context.report({ node: literal, messageId: 'literal', data: { prop } });
        }
      },
    };
  },
};

const opensignup = {
  meta: { name: 'opensignup' },
  rules: {
    'no-catalogs-in-client': noCatalogsInClient,
    'no-literal-text-props': noLiteralTextProps,
  },
};

const config = [
  {
    ignores: ['.next', 'node_modules', 'dist', 'src/db/migrations', 'playwright-report', '.claude'],
  },
  ...compat.extends('next/core-web-vitals'),
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser: tsparser },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // `@/schemas/slot-fields` builds zod schemas at the top level, so a value
    // import from it puts all of zod in the browser bundle. Components take
    // the helpers from the zod-free `@/schemas/slot-field-basics` instead.
    files: ['src/components/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/schemas/slot-fields',
              message:
                'Import values from @/schemas/slot-field-basics; slot-fields pulls zod into the browser. Type-only imports are fine.',
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
  // The local plugin, for every file, so any block can turn its rules on.
  { plugins: { opensignup } },
  {
    // Each catalog carries a whole language, and the translator every
    // language, so a client file that imports one ships it to every browser.
    // The rule reads each file's directive, so it looks at every TS file.
    files: ['**/*.{ts,tsx}'],
    rules: { 'opensignup/no-catalogs-in-client': 'error' },
  },
  {
    // next-intl's provider, imported anywhere but ClientMessages, can end up
    // in a server component, where `next-intl` gives the server's provider.
    // That one fills every prop it isn't given from the request config, which
    // reads the request's headers, so a page built once at build time would be
    // rendered for every request. ClientMessages is a client component, so it
    // gets the client's provider, which takes only the props it's given.
    files: ['**/*.{ts,tsx}'],
    ignores: ['src/i18n/ClientMessages.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'next-intl', importNames: ['NextIntlClientProvider', 'IntlProvider'] },
            { name: 'use-intl', importNames: ['IntlProvider'] },
            { name: 'use-intl/react', importNames: ['IntlProvider'] },
          ].map((entry) => ({ ...entry, message: PROVIDER_INSTEAD })),
        },
      ],
    },
  },
  {
    // Where text has moved to the catalogs (`TRANSLATED`), no hard-coded text:
    // not in JSX, and not on the props people read. `noAttributeStrings` would
    // also flag every className and href, so the props have a rule of their own.
    // Tests are left out: their English fixtures are what they check.
    files: filesAt(TRANSLATED),
    ignores: ['**/*.test.{ts,tsx}', ...filesAt(NOT_YET_TRANSLATED)],
    rules: {
      'react/jsx-no-literals': ['error', { noStrings: true, ignoreProps: true }],
      'opensignup/no-literal-text-props': 'error',
    },
  },
];

export default config;
