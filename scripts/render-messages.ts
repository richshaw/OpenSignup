/**
 * Translates messages through the server translator and exits non-zero if they
 * don't come out in English, or if anything from Next was loaded on the way.
 *
 * Exists to be run under the *worker's* toolchain (`tsx --tsconfig
 * tsconfig.worker.json`): the reminder worker renders emails outside Next, so
 * the translator, its catalogs and `src/i18n/server.ts` must load there too.
 * The worker reads the raw JSON and formats it with use-intl's full formatter,
 * unlike the web build, which precompiles the catalogs, so one message here
 * has an argument. See src/email/templates/worker-render.test.ts.
 */
import { getServerTranslator } from '@/i18n/server';

const t = getServerTranslator('en', 'common.footer');
const texts = [
  ['common.footer.help', t('help'), 'Help'],
  ['common.footer.license', t('license', { instance: 'Example' }), 'Example · AGPL-3.0'],
] as const;
for (const [key, text, expected] of texts) {
  if (text !== expected) throw new Error(`${key} came out as ${JSON.stringify(text)}`);
}

// The worker imports src/i18n/server.ts, so nothing it loads may need Next.
const fromNext = Object.keys(require.cache).filter((path) =>
  /[\\/]node_modules[\\/]next[\\/]/.test(path),
);
if (fromNext.length > 0) {
  throw new Error(`loaded from Next: ${fromNext.join(', ')}`);
}

console.log(`ok translator ${texts.map(([, text]) => text).join(' | ')}`);
