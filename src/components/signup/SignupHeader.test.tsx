// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, within } from '@testing-library/react';
import type { SpotCounts } from '@/lib/spot-counts';
import type { SignupStatus } from '@/schemas/signups';
import { SignupHeader } from './SignupHeader';

const LINK = 'https://your-site.example/s/bake-sale-k3x';
const SPOTS: SpotCounts = { taken: 3, total: 21, open: 18, allSlotsOpen: true };

/**
 * Both headers, as the layout renders them (a draft has no counts). CSS
 * shows one or the other; here they're both in the page, phone first.
 */
function renderHeader(status: SignupStatus, spots: SpotCounts | null = SPOTS) {
  const { container } = render(
    <SignupHeader
      signupId="sig_1"
      title="Bake sale helpers"
      status={status}
      publicUrl={LINK}
      spots={status === 'draft' ? null : spots}
      closeQuestionAction={async () => ({ question: '' })}
      shareMessage={`Bake sale helpers\n${LINK}`}
      publishAction={async () => null}
      closeAction={async () => null}
    />,
  );
  const [phone, computer] = Array.from(container.querySelectorAll('header'));
  if (!phone || !computer) throw new Error('expected both headers');
  const bar = container.querySelector<HTMLElement>('[data-phone-bar]');
  return { computer: within(computer), phone: within(phone), bar };
}

/**
 * The buttons and links by the title on a computer, in order, by what a screen
 * reader reads: Publish and share holds its busy label too, hidden.
 */
function computerActions(computer: ReturnType<typeof within>) {
  return [...computer.queryAllByRole('button'), ...computer.queryAllByRole('link')]
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    .map((el) => {
      const read = el.cloneNode(true) as Element;
      read.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove());
      return el.getAttribute('aria-label') ?? read.textContent;
    });
}

beforeEach(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
});

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('SignupHeader on a computer', () => {
  it('shows a draft Preview and Publish and share, and the draft line instead of the link', () => {
    const { computer } = renderHeader('draft');
    expect(computerActions(computer)).toEqual(['Preview', 'Publish and share']);
    expect(computer.getByRole('link', { name: 'Preview' })).toHaveAttribute(
      'href',
      '/app/signups/sig_1/preview',
    );
    expect(
      computer.getByText('Only you can see this draft until you publish it.'),
    ).toBeInTheDocument();
    expect(computer.queryByText('Public link')).toBeNull();
    expect(computer.queryByText(/spots? taken/)).toBeNull();
  });

  it('shows an open signup Preview, Share and ⋯, and the link with the count beside it', () => {
    const { computer } = renderHeader('open');
    expect(computerActions(computer)).toEqual([
      'Copy public link',
      'Open public page',
      'Preview',
      'Share',
      'More actions',
    ]);
    expect(computer.getByText('3 of 21 spots taken')).toBeInTheDocument();
    expect(computer.queryByText(/Only you can see this draft/)).toBeNull();
  });

  it('counts only the spots taken when a slot has no limit', () => {
    const { computer } = renderHeader('open', {
      taken: 1,
      total: null,
      open: null,
      allSlotsOpen: true,
    });
    expect(computer.getByText('1 spot taken')).toBeInTheDocument();
  });

  it('shows a closed or archived signup only Preview, and says the count is final', () => {
    const closed = renderHeader('closed');
    expect(computerActions(closed.computer)).toEqual([
      'Copy public link',
      'Open public page',
      'Preview',
    ]);
    expect(closed.computer.getByText('Closed · 3 of 21 spots taken')).toBeInTheDocument();

    const archived = renderHeader('archived');
    expect(computerActions(archived.computer)).toEqual([
      'Copy public link',
      'Open public page',
      'Preview',
    ]);
    expect(archived.computer.getByText('Archived · 3 of 21 spots taken')).toBeInTheDocument();
  });
});

describe('SignupHeader on a phone', () => {
  it('puts a draft’s Publish and share in the bar, not the header', () => {
    const { phone, bar } = renderHeader('draft');
    expect(bar).not.toBeNull();
    expect(phone.queryByRole('button', { name: 'Publish and share' })).toBeNull();
    expect(within(bar!).getByRole('button', { name: 'Publish and share' })).toBeInTheDocument();
    expect(phone.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
    expect(
      phone.getByText('Only you can see this draft until you publish it.'),
    ).toBeInTheDocument();
  });

  it('puts an open signup’s count and Share in the bar, and the link in the header', () => {
    const { phone, bar } = renderHeader('open');
    expect(within(bar!).getByText('3 of 21 spots taken')).toBeInTheDocument();
    expect(within(bar!).getByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(phone.queryByRole('button', { name: 'Share' })).toBeNull();
    expect(phone.getByRole('button', { name: 'Copy public link' })).toBeInTheDocument();
    expect(phone.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  });

  it('has no bar and no ⋯ once the signup is closed', () => {
    const { phone, bar } = renderHeader('closed');
    expect(bar).toBeNull();
    expect(phone.queryByRole('button', { name: 'More actions' })).toBeNull();
    expect(phone.getByText('Closed · 3 of 21 spots taken')).toBeInTheDocument();
  });
});
