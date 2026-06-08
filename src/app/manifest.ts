import type { MetadataRoute } from 'next';
import { INSTANCE_NAME } from '@/lib/site-config';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: INSTANCE_NAME,
    short_name: INSTANCE_NAME,
    description: 'Ad-free, open-source sign-up coordination — no accounts for participants.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    // Matches the viewport `themeColor` in src/app/layout.tsx.
    theme_color: '#0b1220',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
