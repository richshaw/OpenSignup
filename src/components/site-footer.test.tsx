// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('@/lib/footer-links');
});

// Mocks the list rather than reading src/lib/footer-links.ts, which a
// deployment fills in its own copy: these tests must pass there too.
async function renderFooter(links: readonly { href: string; label: string }[]) {
  vi.doMock('@/lib/footer-links', () => ({ FOOTER_LINKS: links }));
  const { SiteFooter } = await import('./site-footer');
  render(<SiteFooter />);
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

  it('puts the instance’s own links before Help', async () => {
    const nav = await renderFooter([{ href: '/guides', label: 'Guides' }]);
    const links = nav.getAllByRole('link');
    expect(links.map((a) => a.textContent).slice(0, 2)).toEqual(['Guides', 'Help']);
    expect(links[0]?.getAttribute('href')).toBe('/guides');
  });
});
