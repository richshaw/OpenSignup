import { redirect } from 'next/navigation';
import { safeCallbackUrl } from '@/auth/callback-url';
import { signIn } from '@/auth/config';
import { redeemLoginCode } from '@/auth/login-code';
import { getOrganizerSession } from '@/auth/session';
import { getEnabledOAuthProviders } from '@/auth/oauth-providers';
import { getCurrentRequestIp } from '@/auth/request-context';
import { SiteFooter } from '@/components/site-footer';
import { getDb } from '@/db/client';
import { ServiceException } from '@/lib/errors';
import { log } from '@/lib/log';
import { RateLimits, consumeRateLimit } from '@/lib/rate-limit';
import { EmailSchema } from '@/schemas/common';
import { LoginForm, type CodeActionResult, type LoginActionResult } from './login-form';
import { OAuthButtons } from './oauth-buttons';

export const metadata = { title: 'Sign in', robots: { index: false } };

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

  async function redeem(formData: FormData): Promise<CodeActionResult> {
    'use server';
    const email = EmailSchema.safeParse(String(formData.get('email') ?? ''));
    const code = String(formData.get('code') ?? '');
    if (!email.success) return { ok: false, message: 'Request a new link first.' };
    const db = getDb();
    try {
      // IP first so one client cannot burn a victim's per-email allowance.
      await consumeRateLimit(db, RateLimits.loginCodePerIp, (await getCurrentRequestIp()) ?? 'unknown');
      await consumeRateLimit(db, RateLimits.loginCodePerEmail, email.data);
    } catch (err) {
      if (err instanceof ServiceException && err.serviceError.code === 'rate_limited') {
        return { ok: false, message: 'Too many tries. Wait a few minutes, or click the link in the email.' };
      }
      throw err;
    }
    const result = await redeemLoginCode(db, { email: email.data, code });
    if (!result.ok) {
      return {
        ok: false,
        message:
          result.error.code === 'already_consumed'
            ? 'That code has expired. Request a new link.'
            : 'That code is not right. Check the email and try again.',
      };
    }
    // The browser must make a real top-level navigation to this URL: Auth.js
    // sets the session cookie on its 302, and a redirect() from inside a
    // server action is followed by the framework's own fetch, which drops
    // that cookie on the floor. Handing the URL back is what clicking the
    // emailed link does, to the browser that just proved it holds the code.
    return { ok: true, url: result.value };
  }

  return (
    <div className="flex min-h-[100svh] flex-col">
      <main className="container-tight flex flex-1 flex-col justify-center gap-8 py-16">
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
      <LoginForm action={handle} redeem={redeem} callbackUrl={callbackUrl} />
      </main>
      {/* Also gives this page outgoing links — a page that collects an email
          address should link to the privacy policy and terms. */}
      <SiteFooter />
    </div>
  );
}
