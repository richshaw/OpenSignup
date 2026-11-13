import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Catalog } from './catalog-check';
import { findUsedKeys } from './used-keys';

/**
 * `findUsedKeys` on fixture code, typed against a fixture English catalog
 * that stands in for en.json, so these don't change when the real one does.
 */
const ROOT = path.resolve(import.meta.dirname, '../../..');
const fixture = (name: string) => path.join(ROOT, 'src/used-keys-fixture', name);

const ENGLISH = {
  common: { footer: { help: 'Help', terms: 'Terms', contact: 'Contact' } },
  participant: {
    status: { open: 'Open', closed: 'Closed', draft: 'Draft' },
    spots: '{count, plural, one {# spot} other {# spots}}',
    guide: 'Read <link>the guide</link>',
    welcome: 'Welcome',
    maybe: 'Maybe',
    unused: 'Nobody reads this',
  },
  organizer: { status: { open: 'Open', closed: 'Closed', draft: 'Draft' } },
} satisfies Catalog;

const FIXTURES = {
  [fixture('variable.ts')]: `
import { getServerTranslator } from '@/i18n/server';
export const help = () => getServerTranslator('en', 'common.footer')('help');
`,

  [fixture('helper.ts')]: `
import type { getTranslator, Namespace } from '@/i18n/translator';
type Translator<N extends Namespace> = ReturnType<typeof getTranslator<N>>;
export const terms = (t: Translator<'common.footer'>) => t('terms');
export const inProps = ({ t }: { t: Translator<'common'> }) => t('footer.contact');
`,

  [fixture('methods.ts')]: `
import { getServerTranslator } from '@/i18n/server';
const t = getServerTranslator('en', 'participant');
export const rich = () => t.rich('guide', { link: (chunks) => chunks });
export const markup = () => t.markup('guide', { link: (chunks) => chunks });
export const raw = () => t.raw('spots');
export const has = () => t.has('spots');
`,

  [fixture('table.ts')]: `
import { getServerTranslator } from '@/i18n/server';
const STATUS_KEY = { open: 'status.open', closed: 'status.closed' } as const;
export const status = (s: keyof typeof STATUS_KEY) =>
  getServerTranslator('en', 'participant')(STATUS_KEY[s]);
`,

  [fixture('optional.ts')]: `
import type { getTranslator } from '@/i18n/translator';
type Translator = ReturnType<typeof getTranslator<'participant'>>;
export const maybe = ({ t }: { t?: Translator }) => t?.('maybe');
`,

  [fixture('same-keys.ts')]: `
import { getServerTranslator } from '@/i18n/server';
export const open = () => getServerTranslator('en', 'participant.status')('open');
`,

  [fixture('client.tsx')]: `
'use client';
import { useTranslations } from 'next-intl';
export function Welcome() {
  const t = useTranslations();
  return t('participant.welcome');
}
`,

  [fixture('unresolved.ts')]: `
import type { getTranslator, Namespace } from '@/i18n/translator';
import { getServerTranslator } from '@/i18n/server';
declare const key: string;
export const anyKey = () => getServerTranslator('en', 'common.footer')(key as never);
export const generic = <N extends Namespace>(t: ReturnType<typeof getTranslator<N>>) =>
  t('help' as never);
`,

  [fixture('something.test.ts')]: `
import { getServerTranslator } from '@/i18n/server';
getServerTranslator('en', 'participant')('unused');
`,

  [fixture('testing/helper.ts')]: `
import { getServerTranslator } from '@/i18n/server';
export const helper = () => getServerTranslator('en', 'participant')('unused');
`,

  [path.join(ROOT, 'src/mcp/evals/used-keys-fixture.ts')]: `
import { getServerTranslator } from '@/i18n/server';
export const evaluate = () => getServerTranslator('en', 'participant')('unused');
`,
};

describe('findUsedKeys', () => {
  let found: ReturnType<typeof findUsedKeys>;

  beforeAll(() => {
    found = findUsedKeys(ROOT, ENGLISH, FIXTURES);
  }, 120_000);

  it('sees a key named on a translator in a variable', () => {
    expect(found.used).toContain('common.footer.help');
  });

  it('sees through a helper or a prop that takes a translator under a type of its own', () => {
    expect(found.used).toContain('common.footer.terms');
    expect(found.used).toContain('common.footer.contact');
  });

  it('sees t.rich, t.markup, t.raw and t.has', () => {
    expect(found.used).toContain('participant.guide');
    expect(found.used).toContain('participant.spots');
  });

  it('sees the keys a typed table can give, and no others', () => {
    expect(found.used).toContain('participant.status.open');
    expect(found.used).toContain('participant.status.closed');
    expect(found.used).not.toContain('participant.status.draft');
  });

  it('counts a use for every section with the same keys, since it cannot tell them apart', () => {
    // participant.status and organizer.status have the same keys.
    expect(found.used).toContain('organizer.status.open');
    expect(found.used).not.toContain('organizer.status.closed');
  });

  it('sees a translator with no namespace, from useTranslations in a client component', () => {
    expect(found.used).toContain('participant.welcome');
  });

  it('types translators against the English it is given, not src/messages/en.d.json.ts', () => {
    // As when a key has left en.json and the declaration on disk, where the
    // footer has more keys than this, hasn't been rewritten yet.
    const english = { common: { footer: { help: 'Help' } } };
    const code = { [fixture('variable.ts')]: FIXTURES[fixture('variable.ts')] ?? '' };
    expect(findUsedKeys(ROOT, english, code)).toEqual({
      used: new Set(['common.footer.help']),
      unresolved: [],
    });
  });

  it('sees an optional call, t?.(…)', () => {
    expect(found.used).toContain('participant.maybe');
  });

  it("doesn't count a use in a test, a test helper or an eval", () => {
    expect(found.used).not.toContain('participant.unused');
  });

  it("reports a key or a namespace it can't tell, rather than guessing", () => {
    expect(found.unresolved).toEqual([
      expect.stringMatching(/^src\/used-keys-fixture\/unresolved\.ts:5: .*can't tell which key/),
      expect.stringMatching(
        /^src\/used-keys-fixture\/unresolved\.ts:7: t: can't tell which namespace/,
      ),
    ]);
  });
});
