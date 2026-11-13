import { FlatCompat } from '@eslint/eslintrc';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

// OpenSignup's own rules, as a local plugin. To add one, put it in
// `opensignup.rules` and turn it on as `opensignup/<name>` in a block of
// `config` for the files it's meant for. src/i18n/no-catalogs-in-client.test.ts
// shows how to test one against this config.

const SRC = path.join(__dirname, 'src');

/** The message catalogs, one JSON file per language (`en.json`). */
const MESSAGES = path.join(SRC, 'messages');

/** Modules that load every catalog, as paths without their extension. */
const CATALOG_IMPORTERS = ['i18n/translator', 'i18n/server', 'i18n/testing/translator'].map(
  (module) => path.join(SRC, module),
);

/** What a client component does for its text instead. */
const CLIENT_TEXT_INSTEAD =
  'Translate in a server component and pass the text in as props. (A messages provider for client components comes with #629.)';

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

/** 'catalog' or 'importer' when `target` is one, else null. */
function catalogKind(target) {
  // `en.json`, but not `en.d.json`: that finds the declaration next-intl
  // writes beside the catalog (`en.d.json.ts`), which imports nothing.
  if (path.dirname(target) === MESSAGES && /^[^.]+\.json$/.test(path.basename(target))) {
    return 'catalog';
  }
  return CATALOG_IMPORTERS.includes(target.replace(/\.[cm]?[jt]sx?$/, '')) ? 'importer' : null;
}

/**
 * The same for an import whose path is built at runtime, like
 * `@/messages/${locale}.json`: the bundler takes in every file under the
 * folder its fixed part names.
 */
function catalogKindUnder(dir) {
  if (isUnder(MESSAGES, dir)) return 'catalog';
  return CATALOG_IMPORTERS.some((module) => isUnder(module, dir)) ? 'importer' : null;
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
      importer: `A 'use client' file can't import {{source}}: it loads every language's message catalog, and all of them would go into the browser's JavaScript. ${CLIENT_TEXT_INSTEAD}`,
    },
  },
  create(context) {
    // Client files live all over src/, so the directive decides, not the path.
    if (!isClientFile(context.sourceCode.ast)) return {};

    function check(source) {
      let kind = null;
      if (source.type === 'Literal' && typeof source.value === 'string') {
        const target = resolveSpecifier(source.value, context.filename);
        kind = target && catalogKind(target);
      } else if (source.type === 'TemplateLiteral') {
        const head = source.quasis[0]?.value.cooked ?? '';
        if (source.expressions.length === 0) {
          const target = resolveSpecifier(head, context.filename);
          kind = target && catalogKind(target);
        } else {
          const dir = resolveSpecifier(head.slice(0, head.lastIndexOf('/') + 1), context.filename);
          kind = dir && catalogKindUnder(dir);
        }
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

const opensignup = {
  meta: { name: 'opensignup' },
  rules: {
    'no-catalogs-in-client': noCatalogsInClient,
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
];

export default config;
