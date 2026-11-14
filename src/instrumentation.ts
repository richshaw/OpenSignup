/**
 * Next calls `register` once, when a server process starts.
 *
 * It warns when `E2E_UNSHIPPED_LOCALES` is set: the e2e run's switch
 * (playwright.config.ts) that shows a signup in a language that hasn't shipped
 * (`signupLocale` in src/i18n/config.ts). It isn't a setting, so nothing else
 * would tell an operator who set it by mistake.
 */
export async function register(): Promise<void> {
  // Middleware runs on the edge runtime, which has no pino. Next replaces
  // NEXT_RUNTIME at build time, so the edge build drops this branch.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const listed = process.env.E2E_UNSHIPPED_LOCALES;
    if (listed) {
      const { log } = await import('@/lib/log');
      log.warn(
        { E2E_UNSHIPPED_LOCALES: listed },
        'E2E_UNSHIPPED_LOCALES is set, so a signup that stores a listed language shows in it though it has not shipped. It is for the e2e run only: unset it on a real instance.',
      );
    }
  }
}
