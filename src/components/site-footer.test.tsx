// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { CatalogLocale } from '@/i18n/config';
import { INSTANCE_NAME } from '@/lib/site-config';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('@/lib/footer-links');
  vi.doUnmock('@/i18n/server');
  vi.unstubAllEnvs();
});

// Mocks the list rather than reading src/lib/footer-links.ts, which a
// deployment fills in its own copy: these tests must pass there too.
async function renderFooter(links: readonly { href: string; label: string }[]) {
  vi.doMock('@/lib/footer-links', () => ({ FOOTER_LINKS: links }));
  const { SiteFooter } = await import('./site-footer');
  render(<SiteFooter locale="en" />);
  return within(screen.getByRole('navigation', { name: 'Footer' }));
}

describe('SiteFooter', () => {
  it('starts at Help when the instance adds no links', async () => {
    const nav = await renderFooter([]);
    expect(nav.getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Help',
      'Privacy',
      'Terms',
      'Cookies',
      'Source',
      'Contact',
    ]);
  });

  it('is in the language it’s given', async () => {
    // Only English has a catalog today, so a stand-in translator says which
    // language each message was asked for in.
    vi.doMock('@/i18n/server', () => ({
      getServerTranslator: (locale: string, namespace: string) => (key: string) =>
        `${namespace}.${key} in ${locale}`,
    }));
    vi.doMock('@/lib/footer-links', () => ({ FOOTER_LINKS: [] }));
    const { SiteFooter } = await import('./site-footer');
    render(<SiteFooter locale={'sv' as CatalogLocale} />);
    const nav = within(screen.getByRole('navigation', { name: 'common.footer.label in sv' }));
    expect(nav.getAllByRole('link').map((a) => a.textContent)).toEqual([
      'common.footer.help in sv',
      'common.footer.privacy in sv',
      'common.footer.terms in sv',
      'common.footer.cookies in sv',
      'common.footer.source in sv',
      'common.footer.contact in sv',
    ]);
    expect(screen.getByRole('contentinfo').querySelector('span')?.textContent).toBe(
      'common.footer.license in sv',
    );
  });

  it('puts the instance’s own links before Help', async () => {
    const nav = await renderFooter([{ href: '/guides', label: 'Guides' }]);
    const links = nav.getAllByRole('link');
    expect(links.map((a) => a.textContent).slice(0, 2)).toEqual(['Guides', 'Help']);
    expect(links[0]?.getAttribute('href')).toBe('/guides');
  });

  it.each([
    ['empty', ''],
    ['the literal undefined', 'undefined'],
    ['not a hash', '0.1.0'],
  ])('shows no version when the commit is %s', async (_name, sha) => {
    vi.stubEnv('NEXT_PUBLIC_COMMIT_SHA', sha);
    await renderFooter([]);
    expect(screen.getByRole('contentinfo').querySelector('span')?.textContent).toBe(
      `${INSTANCE_NAME} · AGPL-3.0`,
    );
  });

  it('shows the build’s short commit before the instance name', async () => {
    vi.stubEnv('NEXT_PUBLIC_COMMIT_SHA', '1d4ff3a9c0b2e8f7a6d5c4b3a2918070f6e5d4c3');
    await renderFooter([]);
    expect(screen.getByRole('contentinfo').querySelector('span')?.textContent).toBe(
      `1d4ff3a · ${INSTANCE_NAME} · AGPL-3.0`,
    );
  });
});
