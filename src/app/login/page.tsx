import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { safeCallbackUrl } from '@/auth/callback-url';
import { signIn } from '@/auth/config';
import { redeemLoginCode } from '@/auth/login-code';
import { getOrganizerSession } from '@/auth/session';
import { getEnabledOAuthProviders } from '@/auth/oauth-providers';
import { getCurrentRequestIp } from '@/auth/request-context';
import { CenteredPageFrame } from '@/components/centered-page-frame';
import { FormError } from '@/components/ui/form-error';
import { getDb } from '@/db/client';
import { signInLocale } from '@/i18n/locale';
import { getServerTranslator } from '@/i18n/server';
import { RateLimits, chargeRateLimit, ipSubject } from '@/lib/rate-limit';
import { EmailSchema } from '@/schemas/common';
import { codeRefusal } from './code-refusal';
import { LoginForm, type CodeActionResult, type LoginActionResult } from './login-form';
import { loginFormText } from './login-text';
import { OAuthButtons } from './oauth-buttons';
import { requestMagicLink } from './request-magic-link';

export async function generateMetadata(): Promise<Metadata> {
  const t = getServerTranslator(signInLocale(), 'auth');
  return { title: t('tabTitle'), robots: { index: false } };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string | string[] }>;
}) {
  const params = await searchParams;
  const session = await getOrganizerSession();
  const callbackUrl = safeCallbackUrl(params.callbackUrl);
  if (session) redirect(callbackUrl);

  const oauthProviders = getEnabledOAuthProviders();
  const locale = signInLocale();
  const t = getServerTranslator(locale, 'auth');

  async function handle(formData: FormData): Promise<LoginActionResult> {
    'use server';
    const raw = String(formData.get('email') ?? '').trim();
    const parsed = EmailSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, reason: 'invalid_email' };
    return requestMagicLink(signIn, { email: parsed.data, callbackUrl });
  }

  async function redeem(formData: FormData): Promise<CodeActionResult> {
    'use server';
    const email = EmailSchema.safeParse(String(formData.get('email') ?? ''));
    const code = String(formData.get('code') ?? '');
    if (!email.success) return { ok: false, reason: 'no_email' };
    const db = getDb();
    // IP first so one client cannot burn a victim's per-email allowance.
    if (
      (await chargeRateLimit(
        db,
        RateLimits.loginCodePerIp,
        ipSubject(await getCurrentRequestIp()),
      )) !== null ||
      (await chargeRateLimit(db, RateLimits.loginCodePerEmail, email.data)) !== null
    ) {
      return { ok: false, reason: 'rate_limited' };
    }
    const result = await redeemLoginCode(db, { email: email.data, code });
    if (!result.ok) return { ok: false, reason: codeRefusal(result.error) };
    // The browser must make a real top-level navigation to this URL: Auth.js
    // sets the session cookie on its 302, and a redirect() from inside a
    // server action is followed by the framework's own fetch, which drops
    // that cookie on the floor. Handing the URL back is what clicking the
    // emailed link does, to the browser that just proved it holds the code.
    return { ok: true, url: result.value };
  }

  return (
    <CenteredPageFrame gap="gap-8" locale={locale}>
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t('heading')}</h1>
        <p className="text-ink-muted">
          {oauthProviders.length > 0 ? t('login.introWithProviders') : t('login.intro')}
        </p>
      </div>
      {params.error ? (
        <FormError>
          {params.error === 'Verification' ? t('login.linkInvalid') : t('login.failed')}
        </FormError>
      ) : null}
      <OAuthButtons providers={oauthProviders} callbackUrl={callbackUrl} t={t} />
      <LoginForm
        action={handle}
        redeem={redeem}
        callbackUrl={callbackUrl}
        text={loginFormText(t)}
      />
    </CenteredPageFrame>
  );
}
