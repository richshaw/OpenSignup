/**
 * Translates a message through the server translator and exits non-zero if it
 * doesn't come out in English, or if anything from Next was loaded on the way.
 *
 * Exists to be run under the *worker's* toolchain (`tsx --tsconfig
 * tsconfig.worker.json`): the reminder worker renders emails outside Next, so
 * the translator, its catalogs and `src/i18n/server.ts` must load there too.
 * See src/email/templates/worker-render.test.ts.
 */
import { getServerTranslator } from '@/i18n/server';

const text = getServerTranslator('en', 'common.footer')('help');
if (text !== 'Help') {
  throw new Error(`common.footer.help came out as ${JSON.stringify(text)}`);
}

// The worker imports src/i18n/server.ts, so nothing it loads may need Next.
const fromNext = Object.keys(require.cache).filter((path) =>
  /[\\/]node_modules[\\/]next[\\/]/.test(path),
);
if (fromNext.length > 0) {
  throw new Error(`loaded from Next: ${fromNext.join(', ')}`);
}

console.log(`ok translator ${text}`);
