import { describe, expect, it } from 'vitest';
import {
  buildLandingJsonLd,
  buildRobots,
  buildSitemap,
  INDEXABLE_ROUTES,
  serializeJsonLd,
} from './seo';

const ORIGIN = 'https://example.test';

describe('buildSitemap', () => {
  it('emits one absolute entry per indexable route', () => {
    const urls = buildSitemap(ORIGIN).map((e) => e.url);
    expect(urls).toEqual([
      'https://example.test/',
      'https://example.test/privacy',
      'https://example.test/terms',
      'https://example.test/cookies',
    ]);
    expect(urls.length).toBe(INDEXABLE_ROUTES.length);
  });

  it('excludes private and authed routes', () => {
    const urls = buildSitemap(ORIGIN).map((e) => e.url);
    expect(urls.some((u) => u.includes('/s/'))).toBe(false);
    expect(urls.some((u) => u.includes('/app'))).toBe(false);
    expect(urls.some((u) => u.includes('/login'))).toBe(false);
  });

  it('gives the landing page top priority', () => {
    const home = buildSitemap(ORIGIN)[0];
    expect(home?.url).toBe('https://example.test/');
    expect(home?.priority).toBe(1);
  });
});

describe('buildRobots', () => {
  it('points at the sitemap on the same origin', () => {
    expect(buildRobots(ORIGIN).sitemap).toBe('https://example.test/sitemap.xml');
  });

  it('disallows the /app prefix (covers exact + subtree) and the API', () => {
    const { rules } = buildRobots(ORIGIN);
    const rule = Array.isArray(rules) ? rules[0] : rules;
    expect(rule?.disallow).toEqual(['/app', '/api/']);
  });

  it('does not disallow /s/ and carves /apple-icon.png out of the /app prefix via Allow', () => {
    const { rules } = buildRobots(ORIGIN);
    const rule = Array.isArray(rules) ? rules[0] : rules;
    const disallow = (rule?.disallow ?? []) as string[];
    const allow = (rule?.allow ?? []) as string | string[];
    const allowList = Array.isArray(allow) ? allow : [allow];

    expect(disallow.some((r) => r.startsWith('/s'))).toBe(false);
    // `/apple-icon.png` is `/app`-prefixed and would be blocked without an
    // explicit longest-match Allow override.
    expect(disallow).toContain('/app');
    expect(allowList).toContain('/apple-icon.png');
  });
});

describe('buildLandingJsonLd', () => {
  const graphOf = (): Array<Record<string, unknown>> =>
    buildLandingJsonLd(ORIGIN, 'Acme Signups', 'Coordinate anything.')['@graph'] as Array<
      Record<string, unknown>
    >;

  it('describes the WebSite and the Organization that publishes it', () => {
    const graph = graphOf();
    expect(graph.map((node) => node['@type'])).toEqual(['WebSite', 'Organization']);

    const site = graph.find((node) => node['@type'] === 'WebSite');
    const org = graph.find((node) => node['@type'] === 'Organization');
    expect(site?.name).toBe('Acme Signups');
    // The publisher reference must resolve to the Organization node in-graph.
    expect(site?.publisher).toEqual({ '@id': org?.['@id'] });
    expect(org?.['@id']).toBe(`${ORIGIN}/#organization`);
  });

  it('emits no SoftwareApplication, which Google would reject without a rating', () => {
    // Google's software-app rich result requires aggregateRating or review; we
    // have neither, so the type must stay out of the graph entirely.
    expect(graphOf().map((node) => node['@type'])).not.toContain('SoftwareApplication');
  });
});

describe('serializeJsonLd', () => {
  it('escapes < so a </script> payload cannot break out of the tag', () => {
    const out = serializeJsonLd({ name: '</script><script>alert(1)' });
    expect(out).not.toContain('</script>');
    expect(out).toContain('\\u003c/script');
  });
});
