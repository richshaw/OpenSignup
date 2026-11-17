import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CenteredPageFrame } from '@/components/centered-page-frame';
import { signInLocale } from '@/i18n/locale';
import { getServerTranslator } from '@/i18n/server';
import { getEnv } from '@/lib/env';
import { INSTANCE_NAME } from '@/lib/site-config';
import { SignInLink } from './sign-in-link';

export async function generateMetadata(): Promise<Metadata> {
  const t = getServerTranslator(signInLocale(), 'auth');
  return { title: t('tabTitle'), robots: { index: false } };
}
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
  const locale = signInLocale();
  const t = getServerTranslator(locale, 'auth');

  return (
    <CenteredPageFrame locale={locale}>
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t('heading', { instance: INSTANCE_NAME })}
        </h1>
        <p className="text-ink-muted">
          {email
            ? t.rich('confirm.bodyAs', { email, strong: (chunks) => <strong>{chunks}</strong> })
            : t('confirm.body')}
        </p>
      </div>
      <SignInLink
        href={next}
        text={{ signIn: t('confirm.signIn'), signingIn: t('confirm.signingIn') }}
      />
      <a href="/login" className="text-center text-sm text-ink-muted hover:underline">
        {t('confirm.differentEmail')}
      </a>
    </CenteredPageFrame>
  );
}
