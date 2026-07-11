import { redirect } from 'next/navigation';
import { getEnv } from '@/lib/env';

export const metadata = { title: 'Sign in', robots: { index: false } };
export const dynamic = 'force-dynamic';

function isValidCallbackNext(next: string, authUrl: string): boolean {
  try {
    const u = new URL(next);
    const base = new URL(authUrl);
    return u.origin === base.origin && u.pathname === '/api/auth/callback/nodemailer';
  } catch {
    return false;
  }
}

export default async function ConfirmLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  if (!next || !isValidCallbackNext(next, getEnv().AUTH_URL)) {
    redirect('/login?error=Configuration');
  }

  const email = new URL(next).searchParams.get('email') ?? '';

  return (
    <main className="container-tight flex min-h-[100svh] flex-col justify-center gap-6 py-16">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Sign in to OpenSignup</h1>
        <p className="text-ink-muted">
          {email ? (
            <>
              Click the button below to sign in as <strong>{email}</strong>.
            </>
          ) : (
            'Click the button below to sign in.'
          )}
        </p>
      </div>
      <a
        href={next}
        className="w-full rounded-lg bg-[#1f6feb] px-5 py-3 text-center font-medium text-white no-underline transition-colors hover:bg-[#1658c4]"
      >
        Sign in →
      </a>
      <a href="/login" className="text-center text-sm text-ink-muted hover:underline">
        Use a different email
      </a>
    </main>
  );
}
