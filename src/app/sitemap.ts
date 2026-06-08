import type { MetadataRoute } from 'next';
import { buildSitemap } from '@/lib/seo';
import { APP_ORIGIN } from '@/lib/site-config';

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(APP_ORIGIN);
}
