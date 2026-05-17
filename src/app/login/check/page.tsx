import { MAGIC_LINK_MAX_AGE_MINUTES } from '@/auth/magic-link-expiry';
import { formatDuration } from '@/lib/format-duration';

export const metadata = { title: 'Check your email' };

export default function CheckEmailPage() {
  return (
    <main className="container-tight flex min-h-[100svh] flex-col justify-center gap-6 py-16">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Check your email</h1>
        <p className="text-ink-muted">
          We sent a sign-in link to your inbox. Click it to continue. The link expires in{' '}
          {formatDuration(MAGIC_LINK_MAX_AGE_MINUTES)}.
        </p>
      </div>
    </main>
  );
}
