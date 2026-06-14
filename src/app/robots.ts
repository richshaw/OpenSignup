import type { MetadataRoute } from 'next';
import { buildRobots } from '@/lib/seo';
import { APP_ORIGIN } from '@/lib/site-config';

export default function robots(): MetadataRoute.Robots {
  return buildRobots(APP_ORIGIN);
}
