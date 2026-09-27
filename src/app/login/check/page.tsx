import { safeCallbackUrl } from '@/auth/callback-url';
import { getMagicLinkMaxAgeMinutes } from '@/auth/magic-link-expiry';
import { SiteFooter } from '@/components/site-footer';
import { formatDuration } from '@/lib/format-duration';
import { SessionWatcher } from '../session-watcher';

export const metadata = { title: 'Check your email', robots: { index: false } };

// Force dynamic so getMagicLinkMaxAgeMinutes() (→ getEnv()) runs at request
// time, not during `next build` where server env is absent.
export const dynamic = 'force-dynamic';

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  return (
    <div className="flex min-h-[100svh] flex-col">
      <SessionWatcher callbackUrl={safeCallbackUrl(callbackUrl)} />
      <main className="container-tight flex flex-1 flex-col justify-center gap-6 py-16">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">Check your email</h1>
          <p className="text-ink-muted">
            We sent a sign-in link to your inbox. Click it to continue. The link expires in{' '}
            {formatDuration(getMagicLinkMaxAgeMinutes())}. This page will move on by itself once
            you have signed in.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
