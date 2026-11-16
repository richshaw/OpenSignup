import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';

/**
 * The translators' types come from src/messages/en.d.json.ts, which next-intl's
 * plugin rewrites from en.json on every `pnpm dev` and `pnpm build`. CI runs
 * typecheck before it builds, so a stale copy would check every message
 * against the old English without anyone noticing.
 */
describe('src/messages/en.d.json.ts', () => {
  it('declares exactly what en.json holds', () => {
    const declaration = readFileSync(
      resolve(import.meta.dirname, '../messages/en.d.json.ts'),
      'utf8',
    );
    const declared = /declare const messages: ([\s\S]*);\s*export default messages;/.exec(
      declaration,
    )?.[1];
    expect(declared, 'no `declare const messages` in it').toBeDefined();
    expect(
      JSON.parse(declared ?? ''),
      'out of date with en.json: run pnpm dev or pnpm build to rewrite it, and commit it',
    ).toEqual(en);
  });
});
