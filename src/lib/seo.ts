/**
 * Pure SEO helpers, kept out of the route files so the logic is unit-testable
 * (the `app/robots.ts` / `app/sitemap.ts` route files are thin wrappers that
 * pass `APP_ORIGIN` in). No `process.env` reads here — origin is a parameter.
 */
import type { Metadata, MetadataRoute } from 'next';
import { HELP_ARTICLES } from '@/help/articles';

/**
 * Public, indexable routes that belong in `sitemap.xml`. `''` is the landing
 * page. Authed (`/app`), API (`/api`) and private participant (`/s/*`) routes
 * are deliberately excluded — `/s/*` carries a `noindex` meta tag instead.
 */
export const INDEXABLE_ROUTES: readonly string[] = [
  '',
  '/privacy',
  '/terms',
  '/cookies',
  '/help',
  ...HELP_ARTICLES.map((a) => `/help/${a.slug}`),
];

// The root share image files (`src/app/opengraph-image.png`, the same picture
// as `twitter-image.png`, made by `scripts/generate-og-image.mjs`) and their
// `.alt.txt`. `seo.test.ts` checks these against the files.
export const SHARE_IMAGE = {
  width: 1200,
  height: 630,
  type: 'image/png',
  alt: 'OpenSignup — sign-up sheets, redone. Ad-free, with no accounts for participants.',
} as const;

/**
 * Metadata for a public page: its title, description and canonical URL, with
 * `openGraph` and `twitter` objects that say the same. Next merges metadata
 * shallowly, so a page that sets neither inherits the root layout's whole,
 * home page's URL, title and description included, and every link preview of
 * it reads as the home page. Re-states type, siteName, locale and card for the
 * same reason, and the share image: Next adds the root `opengraph-image.png`
 * and `twitter-image.png` only to pages that leave `openGraph` and `twitter`
 * unset, so a page that sets them names the image itself.
 */
export function pageMetadata(page: {
  path: string;
  title: string;
  description: string;
  siteName: string;
}): Metadata {
  // The same text the root layout's title template puts in <title>.
  const fullTitle = `${page.title} · ${page.siteName}`;
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: page.path },
    openGraph: {
      type: 'website',
      siteName: page.siteName,
      locale: 'en_US',
      url: page.path,
      title: fullTitle,
      description: page.description,
      images: [{ url: '/opengraph-image.png', ...SHARE_IMAGE }],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: page.description,
      images: [{ url: '/twitter-image.png', ...SHARE_IMAGE }],
    },
  };
}

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
      // `/apple-icon.png` is listed explicitly so it isn't swept up by the
      // `/app` prefix below. Longest-match wins for every major crawler that
      // implements `Allow` (Google, Bing, etc.) — and unlike `$`, this is in
      // the original RFC 9309 robots spec, so strict implementations honor it
      // too. `/` is kept for clarity (it's also the default).
      allow: ['/', '/apple-icon.png'],
      // Plain `/app` prefix covers both the exact authed landing (`/app`) and
      // the authed subtree (`/app/...`) for *every* crawler, including those
      // that don't understand the `$` end-of-URL extension. `/api/` covers
      // JSON endpoints. Private participant pages (`/s/*`) are intentionally
      // NOT disallowed: they rely on a `noindex` meta tag, which a crawler
      // can only honor if it's allowed to fetch the page.
      disallow: ['/app', '/api/'],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}

type JsonLd = Record<string, unknown>;

/**
 * Structured data for the landing page: a `WebSite` node plus the `Organization`
 * that publishes it, combined in an `@graph`.
 *
 * Deliberately NOT a `SoftwareApplication`. Google's software-app rich result
 * requires `aggregateRating` or `review` in addition to `name` and `offers`, and
 * emitting the type without one is a hard validation error in the Rich Results
 * Test (Ahrefs reports it as "structured data has Google rich results
 * validation error"). We have no review data and won't invent any, so we
 * describe the site and its publisher instead — both are rating-free types.
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
        publisher: { '@id': `${origin}/#organization` },
      },
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name,
        url: origin,
        description,
      },
    ],
  };
}

/**
 * Serialize JSON-LD for injection via `dangerouslySetInnerHTML`. Escapes each
 * `<` to its `\u003c` unicode escape so a literal `</script>` in any string
 * field cannot break out of the surrounding `<script>` tag.
 */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
