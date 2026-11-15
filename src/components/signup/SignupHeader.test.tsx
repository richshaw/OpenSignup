// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, within } from '@testing-library/react';
import { CATALOG_LOCALES, type CatalogLocale } from '@/i18n/config';
import { getTestServerTranslator } from '@/i18n/testing/translator';
import type { SpotCounts } from '@/lib/spot-counts';
import type { SignupStatus } from '@/schemas/signups';
import { signupHeaderText } from './header-text';
import { SignupHeader } from './SignupHeader';
import type { StatusChangeAction } from './StatusActionForm';

// English from the catalog; any other language answers with the key it was
// asked for and the language (`getTestServerTranslator`).
vi.mock('@/i18n/server', async () => ({
  getServerTranslator: (await import('@/i18n/testing/translator')).getTestServerTranslator,
}));

const LINK = 'https://your-site.example/s/bake-sale-k3x';
const SPOTS: SpotCounts = { taken: 3, total: 21, open: 18, allSlotsOpen: true };

/**
 * Both headers, as the layout renders them (a draft has no counts), without
 * the layout's `HeaderAnnouncer` around them, which nothing here reads. CSS
 * shows one or the other; here they're both in the page, phone first.
 */
function renderHeader(
  status: SignupStatus,
  spots: SpotCounts | null = SPOTS,
  reopenAction: StatusChangeAction = async () => null,
  locale: CatalogLocale = 'en',
) {
  const { container } = render(
    <SignupHeader
      locale={locale}
      text={signupHeaderText(getTestServerTranslator(locale, 'organizer.signup'))}
      signupId="sig_1"
      title="Bake sale helpers"
      status={status}
      publicUrl={LINK}
      spots={status === 'draft' ? null : spots}
      closeQuestionAction={async () => ({ question: '' })}
      shareMessage={`Bake sale helpers\n${LINK}`}
      publishAction={async () => null}
      closeAction={async () => null}
      reopenAction={reopenAction}
    />,
  );
  const [phone, computer] = Array.from(container.querySelectorAll('header'));
  if (!phone || !computer) throw new Error('expected both headers');
  const bar = container.querySelector<HTMLElement>('[data-phone-bar]');
  return { computer: within(computer), phone: within(phone), bar, computerHeader: computer };
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

  it('shows a closed signup Preview and Reopen signup, and an archived one only Preview', () => {
    const closed = renderHeader('closed');
    expect(computerActions(closed.computer)).toEqual([
      'Copy public link',
      'Open public page',
      'Preview',
      'Reopen signup',
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
  it('says why Reopen signup was refused on a line under the header, not by the buttons', async () => {
    const { computer, computerHeader } = renderHeader('closed', SPOTS, async () => ({
      error: 'You don’t have edit access.',
    }));
    const reopen = computer.getByRole('button', { name: 'Reopen signup' });
    await act(async () => {
      fireEvent.click(reopen);
    });
    const refusal = await computer.findByRole('alert');
    expect(refusal).toHaveTextContent('You don’t have edit access.');
    // The row with the title and the buttons is the header's first child;
    // the refusal comes after it, so Preview stays beside Reopen signup.
    const row = computerHeader.firstElementChild;
    expect(row?.contains(reopen)).toBe(true);
    expect(row?.contains(refusal)).toBe(false);
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

  it('has no bar once the signup is closed, and keeps ⋯ for Reopen signup', () => {
    const { phone, bar } = renderHeader('closed');
    expect(bar).toBeNull();
    expect(phone.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
    expect(phone.queryByRole('button', { name: 'Reopen signup' })).toBeNull();
    expect(phone.getByText('Closed · 3 of 21 spots taken')).toBeInTheDocument();
  });

  it('has no bar and no ⋯ once the signup is archived', () => {
    const { phone, bar } = renderHeader('archived');
    expect(bar).toBeNull();
    expect(phone.queryByRole('button', { name: 'More actions' })).toBeNull();
  });
});

describe('SignupHeader’s status', () => {
  it.each(['draft', 'open', 'closed', 'archived'] as const)(
    'says %s on both headers, in the catalog’s words',
    (status) => {
      const { computer, phone } = renderHeader(status);
      expect(computer.getByText(status, { exact: true })).toBeInTheDocument();
      expect(phone.getByText(status, { exact: true })).toBeInTheDocument();
    },
  );
});

describe.each(CATALOG_LOCALES.filter((locale) => locale !== 'en'))(
  'SignupHeader in %s',
  (locale) => {
    const words = (key: string) => `organizer.${key} in ${locale}`;

    it('takes a draft’s words from the catalog in that language', () => {
      const { computer, phone, bar } = renderHeader('draft', null, undefined, locale);
      expect(computer.getByText(words('status.draft'))).toBeInTheDocument();
      expect(computer.getByText(words('signup.draftLine'))).toBeInTheDocument();
      expect(computer.getByRole('link', { name: words('signup.preview') })).toBeInTheDocument();
      expect(
        computer.getByRole('button', { name: words('signup.publish.label') }),
      ).toBeInTheDocument();
      expect(phone.getByText(words('signup.draftLine'))).toBeInTheDocument();
      expect(phone.getByRole('button', { name: words('signup.moreActions') })).toBeInTheDocument();
      expect(
        within(bar!).getByRole('button', { name: words('signup.publish.label') }),
      ).toBeInTheDocument();
    });

    it('takes an open or closed signup’s words from the catalog in that language', () => {
      const open = renderHeader('open', SPOTS, undefined, locale);
      expect(open.computer.getByText(words('status.open'))).toBeInTheDocument();
      expect(open.computer.getByText(words('signup.spots.line'))).toBeInTheDocument();
      expect(
        open.computer.getByRole('button', { name: words('signup.moreActions') }),
      ).toBeInTheDocument();

      const closed = renderHeader('closed', SPOTS, undefined, locale);
      expect(
        closed.computer.getByRole('button', { name: words('signup.reopen.action') }),
      ).toBeInTheDocument();
    });

    it('takes Share’s and the public link’s words from the catalog in that language', () => {
      const { computer, phone, bar } = renderHeader('open', SPOTS, undefined, locale);
      for (const header of [computer, phone]) {
        expect(header.getByText(words('share.chip.label'))).toBeInTheDocument();
        expect(header.getByRole('button', { name: words('share.chip.copy') })).toHaveAttribute(
          'title',
          words('share.chip.copyTip'),
        );
        expect(header.getByRole('link', { name: words('share.chip.open') })).toHaveAttribute(
          'title',
          words('share.chip.openTip'),
        );
      }
      expect(computer.getByRole('button', { name: words('share.button') })).toBeInTheDocument();
      expect(within(bar!).getByRole('button', { name: words('share.button') })).toBeInTheDocument();
    });
  },
);
