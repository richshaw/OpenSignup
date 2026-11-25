// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { signupHeaderText } from './header-text';
import { TabsNav } from './TabsNav';

/** The tabs' names in English, as the layout passes them. */
const LABELS = signupHeaderText(getTestTranslator('organizer.signup')).tabs;

/** Two slots, as the layout passes them. */
const SLOTS = { count: 2, spoken: '2 slots' };

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
    return TAB_LEFT[this.textContent?.replace(/\d.*$/, '') ?? ''] ?? 0;
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
    render(<TabsNav signupId="sig_1" counts={{ slots: SLOTS, responses: 0 }} labels={LABELS} />);
    expect(scrollIntoView).not.toHaveBeenCalled();
    // @ts-expect-error -- jsdom has none; put back as it was.
    delete Element.prototype.scrollIntoView;
  });

  it('centres the current tab in the strip', () => {
    nav.pathname = '/app/signups/sig_1/responses';
    layOut();
    render(<TabsNav signupId="sig_1" counts={{ slots: SLOTS, responses: 0 }} labels={LABELS} />);
    // Responses starts 120px into the strip; centring it in 300px leaves 90px
    // either side.
    expect(screen.getByRole('tablist').scrollLeft).toBe(136 - 16 - (300 - 120) / 2);
  });

  it('scrolls again when the tab changes', () => {
    layOut();
    const { rerender } = render(
      <TabsNav signupId="sig_1" counts={{ slots: SLOTS, responses: 0 }} labels={LABELS} />,
    );
    nav.pathname = '/app/signups/sig_1/settings';
    rerender(<TabsNav signupId="sig_1" counts={{ slots: SLOTS, responses: 0 }} labels={LABELS} />);
    expect(screen.getByRole('tablist').scrollLeft).toBe(256 - 16 - (300 - 120) / 2);
  });

  it('names the strip and each tab with the words it is given', () => {
    render(<TabsNav signupId="sig_1" counts={{ slots: SLOTS, responses: 0 }} labels={LABELS} />);
    const strip = screen.getByRole('tablist', { name: 'Signup sections' });
    expect(strip).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Build22 slots',
      'Responses0',
      'Settings',
    ]);
  });

  it("says what Build's number counts, in place of the bare number", () => {
    render(<TabsNav signupId="sig_1" counts={{ slots: SLOTS, responses: 0 }} labels={LABELS} />);
    const build = screen.getByRole('tab', { name: /^Build/ });
    // jsdom lays nothing out; a browser puts a space before the hidden words.
    expect(build).toHaveAccessibleName(/^Build ?2 slots$/);
    // Responses keeps its plain number: "Responses, 2" says what it counts.
    expect(screen.getByRole('tab', { name: /^Responses/ })).toHaveAccessibleName(/^Responses ?0$/);
  });

  it('shows the words of another language when given them', () => {
    const labels = signupHeaderText(getStandInTranslator('sv', 'organizer.signup')).tabs;
    render(<TabsNav signupId="sig_1" counts={{ slots: SLOTS, responses: 0 }} labels={labels} />);
    expect(
      screen.getByRole('tablist', { name: 'organizer.signup.tabs.label in sv' }),
    ).toBeVisible();
    expect(
      screen.getByRole('tab', { name: /organizer\.signup\.tabs\.settings in sv/ }),
    ).toBeVisible();
  });
});
