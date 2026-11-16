/**
 * Next calls `register` once, when a server process starts.
 *
 * It warns when `E2E_UNSHIPPED_LOCALES` is set (`warnIfUnshippedLocalesShown`),
 * as the reminder worker does when it starts.
 */
export async function register(): Promise<void> {
  // Middleware runs on the edge runtime, which has no pino. Next replaces
  // NEXT_RUNTIME at build time, so the edge build drops this branch.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { warnIfUnshippedLocalesShown } = await import('@/i18n/unshipped-warning');
    warnIfUnshippedLocalesShown();
  }
}
