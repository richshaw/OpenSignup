import { FlatCompat } from '@eslint/eslintrc';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

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
];

export default config;
