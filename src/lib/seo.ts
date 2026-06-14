/**
 * Pure SEO helpers, kept out of the route files so the logic is unit-testable
 * (the `app/robots.ts` / `app/sitemap.ts` route files are thin wrappers that
 * pass `APP_ORIGIN` in). No `process.env` reads here — origin is a parameter.
 */
import type { MetadataRoute } from 'next';

/**
 * Public, indexable routes that belong in `sitemap.xml`. `''` is the landing
 * page. Authed (`/app`), API (`/api`) and private participant (`/s/*`) routes
 * are deliberately excluded — `/s/*` carries a `noindex` meta tag instead.
 */
export const INDEXABLE_ROUTES = ['', '/privacy', '/terms', '/cookies'] as const;

export function buildSitemap(
  origin: string,
  lastModified: Date = new Date(),
): MetadataRoute.Sitemap {
  return INDEXABLE_ROUTES.map((path) => ({
    url: `${origin}${path || '/'}`,
    lastModified,
    changeFrequency: 'monthly',
    priority: path === '' ? 1 : 0.5,
  }));
}

export function buildRobots(origin: string): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // `/app$` matches the exact authed landing (`/app`), which `/app/` alone
      // does not cover; `/app/` covers the authed subtree; `/api/` covers JSON
      // endpoints. The exact match is anchored with `$` so a bare `/app` prefix
      // doesn't also block `/apple-icon.png`. Private participant pages (`/s/*`)
      // are intentionally NOT disallowed: they rely on a `noindex` meta tag,
      // which a crawler can only honor if it's allowed to fetch the page.
      disallow: ['/app$', '/app/', '/api/'],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}

type JsonLd = Record<string, unknown>;

/**
 * Structured data for the landing page: a `WebSite` node plus a free,
 * web-based `SoftwareApplication` node, combined in an `@graph`.
 */
export function buildLandingJsonLd(origin: string, name: string, description: string): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        name,
        url: origin,
        description,
      },
      {
        '@type': 'SoftwareApplication',
        name,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url: origin,
        description,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      },
    ],
  };
}

/**
 * Serialize JSON-LD for injection via `dangerouslySetInnerHTML`. Escapes each
 * `<` to its `<` unicode escape so a literal `</script>` in any string
 * field cannot break out of the surrounding `<script>` tag.
 */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
