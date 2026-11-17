import { Text } from '@react-email/components';
import type { CatalogLocale } from '@/i18n/config';
import { getServerTranslator } from '@/i18n/server';
import { formatDuration } from '@/lib/format-duration';
import { EmailButton, EmailHeading, EmailIntro, EmailLayout, strong } from './layout';

export interface MagicLinkEmailProps {
  /**
   * The email's language: the language stored on the account at its address,
   * else the instance's (`signInEmailLocale` in src/auth/sign-in-email-locale.ts).
   */
  locale: CatalogLocale;
  url: string;
  email: string;
  expiresInMinutes: number;
  /** Six-digit code that can be typed into the window that requested the link. */
  code: string;
  codeExpiresInMinutes: number;
}

/**
 * The sign-in email. Its subject is `signInSubject` in ../subjects.ts; its
 * preview names the address too, so it's a message of its own.
 */
export function MagicLinkEmail({
  locale,
  url,
  email,
  expiresInMinutes,
  codeExpiresInMinutes,
  code,
}: MagicLinkEmailProps) {
  const t = getServerTranslator(locale, 'auth.email');
  return (
    <EmailLayout locale={locale} preview={t('preview', { email })}>
      <EmailHeading>{t('heading')}</EmailHeading>
      <EmailIntro>
        {t.rich('intro', {
          email,
          duration: formatDuration(expiresInMinutes, locale),
          b: strong,
        })}
      </EmailIntro>
      <EmailButton href={url}>{t('signIn')}</EmailButton>
      <Text className="mt-6 text-[#5b6474]">
        {t('code', { duration: formatDuration(codeExpiresInMinutes, locale) })}
      </Text>
      <Text className="m-0 font-mono text-2xl font-semibold tracking-[0.3em] text-[#0b1220]">
        {code}
      </Text>
      <Text className="mt-6 break-all text-xs text-[#8a93a4]">
        {t('copyUrl')} <br />
        {url}
      </Text>
    </EmailLayout>
  );
}
