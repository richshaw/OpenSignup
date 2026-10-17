import type { Metadata } from 'next';
import { describe, expect, it } from 'vitest';
import { INDEXABLE_ROUTES } from '@/lib/seo';

// Each indexable route's metadata, as its page module exports it.
async function metadataFor(path: string): Promise<Metadata> {
  if (path === '') return (await import('./page')).metadata;
  if (path === '/help') return (await import('./(help)/help/page')).metadata;
  if (path.startsWith('/help/')) {
    const { generateMetadata } = await import('./(help)/help/[slug]/page');
    return generateMetadata({ params: Promise.resolve({ slug: path.slice('/help/'.length) }) });
  }
  if (path === '/privacy') return (await import('./(legal)/privacy/page')).metadata;
  if (path === '/terms') return (await import('./(legal)/terms/page')).metadata;
  if (path === '/cookies') return (await import('./(legal)/cookies/page')).metadata;
  throw new Error(`no page module mapped for ${path}; add it here`);
}

describe('link previews of indexable pages', () => {
  it.each(INDEXABLE_ROUTES.map((path) => [path || '/']))(
    '%s gives its own URL, title and description',
    async (route) => {
      const meta = await metadataFor(route === '/' ? '' : route);
      expect(meta.alternates?.canonical).toBe(route);
      expect(meta.openGraph?.url).toBe(route);

      const description = meta.description;
      expect(description).toBeTruthy();
      expect(meta.openGraph?.description).toBe(description);
      expect(meta.twitter?.description).toBe(description);

      const ogTitle = meta.openGraph?.title;
      expect(typeof ogTitle).toBe('string');
      expect(meta.twitter?.title).toBe(ogTitle);
      const title = meta.title;
      const shown = typeof title === 'string' ? title : (title as { absolute: string }).absolute;
      expect(ogTitle).toContain(shown);

      // The share image. Next adds the image files in src/app only to the home
      // page, which sits beside them, and to pages that set no openGraph, so
      // every other page has to name it.
      if (route !== '/') expect(meta.openGraph?.images).toBeTruthy();
    },
  );
});
