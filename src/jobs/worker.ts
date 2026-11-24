import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { warnIfUnshippedLocalesShown } from '@/i18n/unshipped-warning';
import { log } from '@/lib/log';
import { BUILT_IN_JOBS } from './built-in';
import { getBoss } from './queue';
import { startJobs } from './registry';

async function main() {
  // The reminder and time-changed emails follow E2E_UNSHIPPED_LOCALES as the
  // web server's pages and confirmations do, so say so here as it does.
  warnIfUnshippedLocalesShown();
  const boss = await getBoss();

  const { queues } = await startJobs(boss, BUILT_IN_JOBS);

  log.info({ queues }, 'signup worker started');

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'stopping worker');
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  log.error({ err }, 'worker failed to start');
  process.exit(1);
});
