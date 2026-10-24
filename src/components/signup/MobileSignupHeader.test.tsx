// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { SignupStatus } from '@/schemas/signups';
import { HeaderAnnouncer } from './HeaderAnnouncer';
import { MobileSignupHeader } from './MobileSignupHeader';
import { ShareScope } from './ShareScope';
import type { StatusAction } from './StatusActionForm';

vi.mock('@/components/share/ShareQrCode', () => ({ ShareQrCode: () => null }));

const LINK = 'https://your-site.example/s/bake-sale-k3x';
const QUESTION =
  'Nobody has signed up yet. People can’t sign up after this, and you can’t reopen it.';

/** The phone's header as SignupHeader puts it together, at `status`. */
function Phone({ status, action }: { status: SignupStatus; action: StatusAction }) {
  return (
    <HeaderAnnouncer status={status}>
      <ShareScope
        publishAction={action}
        title="Bake sale helpers"
        url={LINK}
        message={`Bake sale helpers\n${LINK}`}
      >
        <MobileSignupHeader
          title="Bake sale helpers"
          status={status}
          publicUrl={LINK}
          closeQuestion={QUESTION}
          closeQuestionAction={async () => ({ question: QUESTION })}
          closeAction={async () => null}
        />
      </ShareScope>
    </HeaderAnnouncer>
  );
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

describe('MobileSignupHeader', () => {
  it('a draft has no Share; an open signup has it under the link', () => {
    const { rerender } = render(<Phone status="draft" action={async () => null} />);
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
    rerender(<Phone status="open" action={async () => null} />);
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });

  it('after Publish, swaps the More actions sheet for the share sheet and says it published', async () => {
    const publish = vi.fn<StatusAction>(async () => ({ published: true }));
    const { rerender } = render(<Phone status="draft" action={publish} />);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const more = screen.getByRole('dialog', { name: 'Bake sale helpers' });
    await act(async () => {
      fireEvent.click(within(more).getByRole('button', { name: 'Publish signup' }));
    });
    expect(publish).toHaveBeenCalledOnce();

    // The layout re-renders with the signup open.
    rerender(<Phone status="open" action={publish} />);
    expect(screen.queryByRole('dialog', { name: 'Bake sale helpers' })).toBeNull();
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

    // Closing it puts focus on Share: Publish, and the sheet it was in, are gone.
    fireEvent.keyDown(sheet, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Share' })).toHaveFocus());
  });
});
