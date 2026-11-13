import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Catalog } from './catalog-check';
import { createAppProgram, findUsedKeys } from './used-keys';

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
    unused: 'Nobody reads this',
  },
  organizer: { status: { open: 'Open', closed: 'Closed', draft: 'Draft' } },
} satisfies Catalog;

const FIXTURES = {
  // What TypeScript reads for en.json's types (allowArbitraryExtensions).
  [path.join(ROOT, 'src/messages/en.d.json.ts')]:
    `declare const messages: ${JSON.stringify(ENGLISH)};\nexport default messages;\n`,

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
};

describe('findUsedKeys', () => {
  let program: ReturnType<typeof createAppProgram>;
  let found: ReturnType<typeof findUsedKeys>;

  beforeAll(() => {
    program = createAppProgram(ROOT, FIXTURES);
    found = findUsedKeys(program, ENGLISH, ROOT);
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

  it('still finds a namespace when en.json has gained a key the declaration lacks', () => {
    // The declaration is rewritten from en.json on the next dev or build.
    const gained = { ...ENGLISH, common: { footer: { ...ENGLISH.common.footer, added: 'Added' } } };
    const { used, unresolved } = findUsedKeys(program, gained, ROOT);
    expect(used).toContain('common.footer.help');
    expect(used).not.toContain('common.footer.added');
    expect(unresolved).toEqual(found.unresolved);
  });

  it("doesn't count a test's use", () => {
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
