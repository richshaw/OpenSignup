import type { Metadata, Viewport } from 'next';
import { APP_ORIGIN, INSTANCE_NAME } from '@/lib/site-config';
import { inter } from './fonts';
import './globals.css';

const DESCRIPTION =
  'Ad-free, open-source sign-up coordination. Organize potlucks, volunteer shifts, snack rotations, and carpools — share a link and let people commit to slots, no accounts required.';

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
