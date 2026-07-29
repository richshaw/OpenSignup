import type { Metadata, Viewport } from 'next';
import { APP_ORIGIN, INSTANCE_NAME } from '@/lib/site-config';
import { inter } from './fonts';
import './globals.css';

// Kept under 160 characters so search engines don't truncate it, and over 110
// so crawlers (Ahrefs, Screaming Frog) don't flag it as too thin.
const DESCRIPTION =
  'Ad-free, open-source sign-up coordination for potlucks, volunteer shifts, snack rotations, and carpools. Share a link — participants need no account.';

export const metadata: Metadata = {
  metadataBase: new URL(APP_ORIGIN),
  title: {
    default: INSTANCE_NAME,
    template: `%s · ${INSTANCE_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: INSTANCE_NAME,
  openGraph: {
    type: 'website',
    siteName: INSTANCE_NAME,
    locale: 'en_US',
    url: '/',
    title: INSTANCE_NAME,
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: INSTANCE_NAME,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0b1220',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-surface text-ink antialiased">{children}</body>
    </html>
  );
}
