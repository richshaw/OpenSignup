/**
 * The warning a process logs when it starts with `E2E_UNSHIPPED_LOCALES` set:
 * the e2e run's switch (playwright.config.ts) that shows a signup in a
 * language that hasn't shipped (`signupLocale` in ./config.ts). It isn't a
 * setting, so nothing else would tell an operator who set it by mistake.
 *
 * Both processes that follow it log it: the web server, which shows the
 * signup's pages and sends its confirmations (src/instrumentation.ts), and the
 * reminder worker, which sends its reminders and time-changed emails
 * (src/jobs/worker.ts). Nothing from Next comes in here, so the worker can
 * import it.
 */
import { log } from '@/lib/log';

export function warnIfUnshippedLocalesShown(): void {
  const listed = process.env.E2E_UNSHIPPED_LOCALES;
  if (!listed) return;
  log.warn(
    { E2E_UNSHIPPED_LOCALES: listed },
    'E2E_UNSHIPPED_LOCALES is set, so a signup that stores a listed language shows in it, and its emails go out in it, though it has not shipped. It is for the e2e run only: unset it on a real instance.',
  );
}
