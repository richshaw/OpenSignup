import type { Metadata, Viewport } from 'next';
import type { CatalogLocale } from '@/i18n/config';
import { SHARE_IMAGES } from '@/lib/seo';
import { APP_ORIGIN, INSTANCE_NAME } from '@/lib/site-config';
import { inter } from './fonts';
import './globals.css';

// What the three root layouts share: `(site)/layout.tsx` (home, help, legal),
// `(organizer)/layout.tsx` (the organizer app, sign-in, OAuth consent) and
// `s/[slug]/layout.tsx` (a signup's pages), plus `global-not-found.tsx`. Each
// is a root layout so it can set `<html lang>` itself: a signup's pages in the
// signup's language, while help and legal stay static. One layout above every
// page couldn't see a signup's slug, and reading the request there would make
// every page dynamic. Moving between root layouts is a full page load.

// Kept under 160 characters so search engines don't truncate it, and over 110
// so crawlers (Ahrefs, Screaming Frog) don't flag it as too thin.
const DESCRIPTION =
  'Ad-free, open-source sign-up coordination for potlucks, volunteer shifts, snack rotations, and carpools. Share a link — participants need no account.';

/**
 * Every root layout exports this as its `metadata`.
 *
 * The share image is named here: Next attaches `src/app/opengraph-image.png`
 * and `twitter-image.png` to the `src/app` segment, and the `openGraph` and
 * `twitter` below, one segment down, replace that whole. A page that sets
 * neither inherits these, image included.
 */
export const rootMetadata: Metadata = {
  metadataBase: new URL(APP_ORIGIN),
  title: {
    default: INSTANCE_NAME,
    template: `%s · ${INSTANCE_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: INSTANCE_NAME,
  // No `url`: a page that sets no openGraph of its own then gives no og:url,
  // rather than the home page's. Public pages set theirs (`pageMetadata`).
  openGraph: {
    type: 'website',
    siteName: INSTANCE_NAME,
    locale: 'en_US',
    title: INSTANCE_NAME,
    description: DESCRIPTION,
    images: SHARE_IMAGES.openGraph,
  },
  twitter: {
    card: 'summary_large_image',
    title: INSTANCE_NAME,
    description: DESCRIPTION,
    images: SHARE_IMAGES.twitter,
  },
};

/** Every root layout exports this as its `viewport`. */
export const rootViewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0b1220',
};

/** The `<html>` and `<body>` every root layout renders, in the page's language. */
export function RootShell({ lang, children }: { lang: CatalogLocale; children: React.ReactNode }) {
  return (
    <html lang={lang} className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-surface text-ink antialiased">{children}</body>
    </html>
  );
}
