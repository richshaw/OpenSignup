import type { Metadata } from 'next';
import { safeCallbackUrl } from '@/auth/callback-url';
import { getMagicLinkMaxAgeMinutes } from '@/auth/magic-link-expiry';
import { CenteredPageFrame } from '@/components/centered-page-frame';
import { signInLocale } from '@/i18n/organizer';
import { getServerTranslator } from '@/i18n/server';
import { formatDuration } from '@/lib/format-duration';
import { SessionWatcher } from '../session-watcher';

export async function generateMetadata(): Promise<Metadata> {
  const t = getServerTranslator(signInLocale(), 'auth.check');
  return { title: t('tabTitle'), robots: { index: false } };
}

// Force dynamic so getMagicLinkMaxAgeMinutes() and signInLocale() (→ getEnv())
// run at request time, not during `next build` where server env is absent.
export const dynamic = 'force-dynamic';

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}) {
  const { callbackUrl } = await searchParams;
  const locale = signInLocale();
  const t = getServerTranslator(locale, 'auth.check');
  return (
    <CenteredPageFrame locale={locale}>
      <SessionWatcher callbackUrl={safeCallbackUrl(callbackUrl)} />
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t('heading')}</h1>
        <p className="text-ink-muted">
          {t('body', { duration: formatDuration(getMagicLinkMaxAgeMinutes(), locale) })}
        </p>
      </div>
    </CenteredPageFrame>
  );
}
