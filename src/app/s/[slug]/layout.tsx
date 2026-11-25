import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { SiteFooter } from '@/components/site-footer';
import { openGraphLocale } from '@/i18n/config';
import { isEmbedPath, SIGNUP_PATH_HEADER } from '@/lib/signup-path';
import { RootShell, rootMetadata, rootViewport } from '../../root-shell';
import { signupLocaleForSlug } from './signup-locale';

export const viewport = rootViewport;

type LayoutParams = { params: Promise<{ slug: string }> };

/**
 * `rootMetadata`, with link previews told the signup's language (og:locale).
 * Next replaces a parent's `openGraph` rather than merging it, so the signup
 * page names its own; this is what the pages that set none get: the edit and
 * unsubscribe pages, and a draft's, an archived signup's and a not-found page.
 */
export async function generateMetadata({ params }: LayoutParams): Promise<Metadata> {
  const locale = await signupLocaleForSlug((await params).slug);
  return {
    ...rootMetadata,
    openGraph: { ...rootMetadata.openGraph, locale: openGraphLocale(locale) },
  };
}

/**
 * The root layout for a signup's pages: the signup itself, an edit link and
 * unsubscribe. Its `<html lang>` and footer are in the signup's language
 * (`signupLocaleForSlug`), read through the same cached row as the signup
 * page, so on that page it costs no statement; an unknown or deleted slug has
 * no row and gets the instance's language for participants. Each page still
 * marks its own `<main>` with the language, because a client-side navigation
 * renders a page without its layout.
 *
 * A signup's embed (`/s/[slug]/embed`), shown inside another website's page,
 * gets no footer. A root layout can't be swapped out by a nested one, so it
 * asks the path the middleware copies into a header.
 */
export default async function ParticipantLayout({
  children,
  params,
}: LayoutParams & { children: React.ReactNode }) {
  const [locale, requestHeaders] = await Promise.all([
    signupLocaleForSlug((await params).slug),
    headers(),
  ]);
  const embed = isEmbedPath(requestHeaders.get(SIGNUP_PATH_HEADER));
  return (
    <RootShell lang={locale}>
      <div className="flex min-h-[100svh] flex-col bg-surface text-ink">
        <div className="flex-1">{children}</div>
        {embed ? null : <SiteFooter locale={locale} />}
      </div>
    </RootShell>
  );
}
