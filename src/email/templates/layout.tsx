import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';
import type { ReactNode } from 'react';
import type { CatalogLocale } from '@/i18n/config';
import { getServerTranslator } from '@/i18n/server';

/**
 * Every email's frame. `locale` is the email's language, which its `<html
 * lang>` declares: a participant email's is its signup's (`emailLocale`), and
 * the sign-in email's is English until organizer text moves to the catalogs.
 */
export function EmailLayout({
  locale,
  preview,
  children,
}: {
  locale: CatalogLocale;
  preview: string;
  children: ReactNode;
}) {
  return (
    <Html lang={locale}>
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind>
        <Body className="bg-[#f7f8fa] font-sans text-[#0b1220]">
          <Container className="mx-auto my-10 max-w-[520px] rounded-xl bg-white p-8 shadow-sm">
            <Section className="pb-4">
              {/* eslint-disable-next-line react/jsx-no-literals -- the product's name, the same in every language */}
              <Text className="m-0 text-lg font-semibold">OpenSignup</Text>
            </Section>
            <Hr className="border-[#eef1f5]" />
            <Section className="py-4">{children}</Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

/** The email's one heading. */
export function EmailHeading({ children }: { children: ReactNode }) {
  return (
    <Heading as="h1" className="m-0 text-xl font-semibold">
      {children}
    </Heading>
  );
}

/** The paragraph straight under the heading. */
export function EmailIntro({ children }: { children: ReactNode }) {
  return <Text className="mt-2 text-[#5b6474]">{children}</Text>;
}

/** The email's call to action. */
export function EmailButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button
      href={href}
      className="mt-6 inline-block rounded-lg bg-[#1f6feb] px-5 py-3 text-sm font-medium text-white no-underline"
    >
      {children}
    </Button>
  );
}

/**
 * The participant emails' call to action: their own link to view, change or
 * cancel their spot.
 */
export function ManageButton({ locale, href }: { locale: CatalogLocale; href: string }) {
  const t = getServerTranslator(locale, 'email.common');
  return <EmailButton href={href}>{t('manage')}</EmailButton>;
}

/** What a message's `<b>` tag renders as, for `t.rich`. */
export function strong(chunks: ReactNode) {
  return <strong>{chunks}</strong>;
}

/** The participant's own notes on their sign-up, or nothing when they left none. */
export function NotesText({
  locale,
  notes,
}: {
  locale: CatalogLocale;
  notes?: string | null | undefined;
}) {
  if (!notes) return null;
  const t = getServerTranslator(locale, 'email.common');
  return (
    <Text className="mt-4 rounded-lg bg-[#f7f8fa] p-3 text-[#0b1220]">
      {t.rich('notes', { notes, b: strong })}
    </Text>
  );
}

/**
 * The opt-out line at the foot of the reminder and slot-change emails: a
 * sentence, then the link, whose label is `children`.
 *
 * Nothing may follow the link in the sentence. react-email renders a <Link>
 * in plaintext as "label\nURL", so trailing punctuation lands hard against the
 * bare URL and clients that autolink plaintext commonly swallow it into the
 * href — which would break the one link that must never break. So the
 * sentence and the label are separate messages, and the link comes last
 * here, in every language: no translation can put words after it.
 */
export function UnsubscribeFooter({
  locale,
  href,
  children,
}: {
  locale: CatalogLocale;
  href: string;
  children: ReactNode;
}) {
  const t = getServerTranslator(locale, 'email.common');
  return (
    <Text className="mt-4 text-xs text-[#8a93a4]">
      {t('stillConfirmed')}{' '}
      <Link href={href} className="text-[#8a93a4] underline">
        {children}
      </Link>
    </Text>
  );
}
