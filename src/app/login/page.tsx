import { redirect } from 'next/navigation';
import { signIn } from '@/auth/config';
import { getOrganizerSession } from '@/auth/session';
import { getEnabledOAuthProviders } from '@/auth/oauth-providers';
import { log } from '@/lib/log';
import { EmailSchema } from '@/schemas/common';
import { LoginForm, type LoginActionResult } from './login-form';
import { OAuthButtons } from './oauth-buttons';

export const metadata = { title: 'Sign in' };

function safeCallbackUrl(raw: string | undefined): string {
  if (!raw) return '/app';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/app';
  return raw;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const session = await getOrganizerSession();
  const callbackUrl = safeCallbackUrl(params.callbackUrl);
  if (session) redirect(callbackUrl);

  const oauthProviders = getEnabledOAuthProviders();

  async function handle(formData: FormData): Promise<LoginActionResult> {
    'use server';
    const raw = String(formData.get('email') ?? '').trim();
    const parsed = EmailSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, reason: 'invalid_email' };
    const email = parsed.data;
    try {
      await signIn('nodemailer', { email, redirect: false, redirectTo: callbackUrl });
      return { ok: true, email };
    } catch (error) {
      log.error({ err: error }, 'login: signIn failed');
      return { ok: false, reason: 'send_failed' };
    }
  }

  return (
    <main className="container-tight flex min-h-[100svh] flex-col justify-center gap-8 py-16">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Sign in to OpenSignup</h1>
        <p className="text-ink-muted">
          {oauthProviders.length > 0
            ? 'Continue with a provider below, or get a magic link by email. No passwords.'
            : "Enter your email and we'll send you a magic link to sign in. No passwords."}
        </p>
      </div>
      {params.error ? (
        <p className="text-danger text-sm" role="alert">
          Something went wrong. Try again.
        </p>
      ) : null}
      <OAuthButtons providers={oauthProviders} callbackUrl={callbackUrl} />
      <LoginForm action={handle} />
    </main>
  );
}
