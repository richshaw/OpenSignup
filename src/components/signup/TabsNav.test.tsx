// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TabsNav } from './TabsNav';

const nav = vi.hoisted(() => ({ pathname: '/app/signups/sig_1/build' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

// jsdom lays nothing out, so each test gives the strip and its tabs the sizes
// a phone would: a 300px strip whose tabs are 120px wide, side by side.
const STRIP = { offsetLeft: 16, clientWidth: 300 };
const TAB_WIDTH = 120;
const TAB_LEFT: Record<string, number> = { Build: 16, Responses: 136, Settings: 256 };

function layOut() {
  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.getAttribute('role') === 'tablist') return STRIP.offsetLeft;
    return TAB_LEFT[this.textContent?.replace(/\d+$/, '') ?? ''] ?? 0;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(TAB_WIDTH);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(STRIP.clientWidth);
}

afterEach(() => {
  vi.restoreAllMocks();
  nav.pathname = '/app/signups/sig_1/build';
});

describe('TabsNav', () => {
  it('scrolls the strip, not the page, so the first Tab still starts at the top', () => {
    // A scrollIntoView moves where the browser's next Tab starts from, so the
    // first Tab after the page loads would skip the whole header.
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    layOut();
    render(<TabsNav signupId="sig_1" counts={{ build: 2, responses: 0 }} />);
    expect(scrollIntoView).not.toHaveBeenCalled();
    // @ts-expect-error -- jsdom has none; put back as it was.
    delete Element.prototype.scrollIntoView;
  });

  it('centres the current tab in the strip', () => {
    nav.pathname = '/app/signups/sig_1/responses';
    layOut();
    render(<TabsNav signupId="sig_1" counts={{ build: 2, responses: 0 }} />);
    // Responses starts 120px into the strip; centring it in 300px leaves 90px
    // either side.
    expect(screen.getByRole('tablist').scrollLeft).toBe(136 - 16 - (300 - 120) / 2);
  });

  it('scrolls again when the tab changes', () => {
    layOut();
    const { rerender } = render(<TabsNav signupId="sig_1" counts={{ build: 2, responses: 0 }} />);
    nav.pathname = '/app/signups/sig_1/settings';
    rerender(<TabsNav signupId="sig_1" counts={{ build: 2, responses: 0 }} />);
    expect(screen.getByRole('tablist').scrollLeft).toBe(256 - 16 - (300 - 120) / 2);
  });
});
