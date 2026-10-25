// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { SignupStatus } from '@/schemas/signups';
import { HeaderAnnouncer } from './HeaderAnnouncer';
import { PhonePreviewItem, PhoneStanding } from './HeaderParts';
import { MobileSignupHeader } from './MobileSignupHeader';
import { ShareScope } from './ShareScope';
import type { StatusAction, StatusChangeAction } from './StatusActionForm';

vi.mock('@/components/share/ShareQrCode', () => ({ ShareQrCode: () => null }));

const LINK = 'https://your-site.example/s/bake-sale-k3x';
const PREVIEW = '/app/signups/sig_1/preview';
const QUESTION = 'Nobody has signed up yet. People can’t sign up until you reopen it.';

/**
 * The phone's header as SignupHeader puts it together, at `status`, its parts
 * included, in the HeaderAnnouncer the layout puts round it.
 */
function Phone({
  status,
  action,
  reopen = async () => null,
}: {
  status: SignupStatus;
  action: StatusAction;
  reopen?: StatusChangeAction;
}) {
  const spotsTaken = status === 'draft' ? null : '0 of 4 spots taken';
  return (
    <HeaderAnnouncer status={status}>
      <ShareScope
        publishAction={action}
        signupId="sig_1"
        title="Bake sale helpers"
        url={LINK}
        message={`Bake sale helpers\n${LINK}`}
      >
        <MobileSignupHeader
          title="Bake sale helpers"
          status={status}
          standing={
            <PhoneStanding
              signupId="sig_1"
              status={status}
              publicUrl={LINK}
              spotsTaken={spotsTaken}
            />
          }
          previewItem={<PhonePreviewItem href={PREVIEW} />}
          spotsTaken={spotsTaken}
          closeQuestion={QUESTION}
          closeQuestionAction={async () => ({ question: QUESTION })}
          closeAction={async () => null}
          reopenAction={reopen}
        />
      </ShareScope>
    </HeaderAnnouncer>
  );
}

/** The bar fixed to the bottom of the screen, if there is one. */
const bar = () => document.querySelector<HTMLElement>('[data-phone-bar]');
const inBar = () => within(bar() ?? document.createElement('div'));

/** Opens More actions and returns its sheet, named by the signup's title. */
function openMore() {
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  return screen.getByRole('dialog', { name: 'Bake sale helpers' });
}

beforeEach(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
});

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('MobileSignupHeader: the More actions sheet', () => {
  it('holds only Preview for a draft, opening the preview in a new tab', () => {
    render(<Phone status="draft" action={async () => null} />);
    const sheet = openMore();
    const preview = within(sheet).getByRole('link', { name: 'Preview' });
    expect(preview).toHaveAttribute('href', PREVIEW);
    expect(preview).toHaveAttribute('target', '_blank');
    expect(within(sheet).queryByRole('button', { name: /Publish/ })).toBeNull();
    expect(within(sheet).queryByRole('button', { name: 'Close signup' })).toBeNull();
  });

  it('holds Preview, then Close signup, for an open signup', () => {
    render(<Phone status="open" action={async () => null} />);
    const sheet = openMore();
    const items = [
      ...within(sheet).queryAllByRole('link'),
      ...within(sheet).queryAllByRole('button'),
    ]
      .filter((el) => el.getAttribute('aria-label') !== 'Close')
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      .map((el) => el.textContent);
    expect(items).toEqual(['Preview', 'Close signup']);
  });

  it('closes as Preview opens its tab', async () => {
    render(<Phone status="draft" action={async () => null} />);
    const sheet = openMore();
    fireEvent.click(within(sheet).getByRole('link', { name: 'Preview' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('stays shut when a signup closed from it is reopened', async () => {
    // Close signup in the sheet closes the sheet by changing the status. A
    // Reopen, from the sheet or anywhere else, changes it back, and the sheet
    // mustn't come back with it.
    const { rerender } = render(<Phone status="open" action={async () => null} />);
    openMore();
    rerender(<Phone status="closed" action={async () => null} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    rerender(<Phone status="open" action={async () => null} />);
    expect(screen.getByRole('button', { name: 'More actions' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens on the menu again, not Close’s question, after Close from it and a reopen', async () => {
    const { rerender } = render(<Phone status="open" action={async () => null} />);
    let sheet = openMore();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close signup' }));
    // Close's question, then its red Close signup, which closes the signup.
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Close signup' }));
    });
    rerender(<Phone status="closed" action={async () => null} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    rerender(<Phone status="open" action={async () => null} />);

    sheet = openMore();
    expect(within(sheet).getByRole('link', { name: 'Preview' })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Close signup' })).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Not yet' })).toBeNull();
  });

  it('holds Preview, then Reopen signup, for a closed signup', () => {
    render(<Phone status="closed" action={async () => null} />);
    const sheet = openMore();
    const items = [
      ...within(sheet).queryAllByRole('link'),
      ...within(sheet).queryAllByRole('button'),
    ]
      .filter((el) => el.getAttribute('aria-label') !== 'Close')
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      .map((el) => el.textContent);
    expect(items).toEqual(['Preview', 'Reopen signup']);
  });

  it('reopens from Reopen signup, and shuts as the signup opens', async () => {
    const reopen = vi.fn<StatusChangeAction>(async () => null);
    const { rerender } = render(
      <Phone status="closed" action={async () => null} reopen={reopen} />,
    );
    const sheet = openMore();
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Reopen signup' }));
    });
    await waitFor(() => expect(reopen).toHaveBeenCalledTimes(1));
    rerender(<Phone status="open" action={async () => null} reopen={reopen} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: 'More actions' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('opens on Reopen signup, not Close’s question, on a signup closed from it', async () => {
    const { rerender } = render(<Phone status="open" action={async () => null} />);
    const open = openMore();
    fireEvent.click(within(open).getByRole('button', { name: 'Close signup' }));
    await act(async () => {
      fireEvent.click(within(open).getByRole('button', { name: 'Close signup' }));
    });
    rerender(<Phone status="closed" action={async () => null} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const closed = openMore();
    expect(within(closed).getByRole('button', { name: 'Reopen signup' })).toBeInTheDocument();
    expect(within(closed).queryByRole('button', { name: 'Not yet' })).toBeNull();
    expect(within(closed).queryByRole('button', { name: 'Close signup' })).toBeNull();
  });

  it('isn’t there for an archived signup', () => {
    render(<Phone status="archived" action={async () => null} />);
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
  });
});

describe('MobileSignupHeader: the bar at the bottom', () => {
  it('fills with Publish and share for a draft, under a line that says only you can see it', () => {
    render(<Phone status="draft" action={async () => null} />);
    expect(inBar().getByRole('button', { name: 'Publish and share' })).toBeInTheDocument();
    expect(inBar().queryByRole('button', { name: 'Share' })).toBeNull();
    expect(
      screen.getByText('Only you can see this draft until you publish it.'),
    ).toBeInTheDocument();
    // A draft's link only says it isn't ready, so there's none to copy.
    expect(screen.queryByText('Public link')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy public link' })).toBeNull();
  });

  it('has the count and Share for an open signup, and the link stays at the top', () => {
    render(<Phone status="open" action={async () => null} />);
    expect(inBar().getByText('0 of 4 spots taken')).toBeInTheDocument();
    expect(inBar().getByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(inBar().queryByRole('button', { name: 'Publish and share' })).toBeNull();
    // Once: in the bar, not under the link as well.
    expect(screen.getAllByText('0 of 4 spots taken')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Copy public link' })).toBeInTheDocument();
    expect(screen.queryByText(/Only you can see this draft/)).toBeNull();
  });

  it('isn’t there once the signup is closed or archived; the count goes under the link', () => {
    const { rerender } = render(<Phone status="closed" action={async () => null} />);
    expect(bar()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
    expect(screen.getByText('0 of 4 spots taken')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy public link' })).toBeInTheDocument();
    rerender(<Phone status="archived" action={async () => null} />);
    expect(bar()).toBeNull();
  });

  it('says why Publish was refused just above the button, not in a sheet', async () => {
    render(
      <Phone status="draft" action={async () => ({ error: 'You don’t have edit access.' })} />,
    );
    const publish = inBar().getByRole('button', { name: 'Publish and share' });
    await act(async () => {
      fireEvent.click(publish);
    });
    const refusal = inBar().getByRole('alert');
    expect(refusal).toHaveTextContent('You don’t have edit access.');
    expect(refusal.compareDocumentPosition(publish) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('after Publish, opens the share sheet, says it published, and hands focus to Share', async () => {
    const publish = vi.fn<StatusAction>(async () => ({ published: true }));
    const { rerender } = render(<Phone status="draft" action={publish} />);
    await act(async () => {
      fireEvent.click(inBar().getByRole('button', { name: 'Publish and share' }));
    });
    expect(publish).toHaveBeenCalledOnce();

    // The layout re-renders with the signup open (in an act that waits, so
    // the panel's code, loading as it mounts, is in when the act ends).
    await act(async () => {
      rerender(<Phone status="open" action={publish} />);
    });
    const sheet = await screen.findByRole('dialog', { name: 'Now send people the link' });
    expect(sheet).toHaveAccessibleDescription('Published');
    await waitFor(() =>
      expect(within(sheet).getByRole('button', { name: 'Copy link' })).toHaveFocus(),
    );
    // The header's live region says it too, though the sheet, being modal,
    // hides it from screen readers while open: there the sheet's own name and
    // its "Published" description say it as it opens.
    expect(screen.getByRole('status', { hidden: true })).toHaveTextContent(
      'Published. Anyone with the link can sign up now.',
    );

    // Closing it puts focus on the bar's Share, where Publish and share was.
    fireEvent.keyDown(sheet, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(inBar().getByRole('button', { name: 'Share' })).toHaveFocus());
  });

  it('tells the page how tall the bar is, and forgets it once the bar has gone', () => {
    // jsdom has no ResizeObserver and lays nothing out: a stand-in that
    // reports once as it starts observing, and a bar 121px tall, as one with
    // a two-line refusal is.
    const observed: Element[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly report: () => void) {}
        observe(el: Element) {
          observed.push(el);
          this.report();
        }
        disconnect() {}
      },
    );
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(121);
    const root = document.documentElement.style;
    try {
      const { rerender } = render(<Phone status="draft" action={async () => null} />);
      expect(observed).toEqual([bar()]);
      expect(root.getPropertyValue('--phone-bar-h')).toBe('121px');
      rerender(<Phone status="closed" action={async () => null} />);
      expect(root.getPropertyValue('--phone-bar-h')).toBe('');
    } finally {
      height.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('a signup published some other way opens nothing and says nothing', async () => {
    const publish = vi.fn<StatusAction>(async () => ({ published: true }));
    const { rerender } = render(<Phone status="draft" action={publish} />);
    // Another tab, or an AI assistant, published it; the page re-renders open.
    await act(async () => {
      rerender(<Phone status="open" action={publish} />);
    });
    expect(publish).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});
