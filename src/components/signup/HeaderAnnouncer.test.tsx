// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { SignupStatus } from '@/schemas/signups';
import { HeaderAnnouncer, useAnnounce, useAnnouncedClose } from './HeaderAnnouncer';
import type { StatusAction } from './StatusActionForm';

const CLOSED = 'Closed. People can’t sign up now.';

/** Runs a close the way the header's Close signup does, through the hook. */
function CloseButton({ action }: { action: StatusAction }) {
  const close = useAnnouncedClose(action);
  return (
    <button type="button" onClick={() => void close()}>
      Close
    </button>
  );
}

function renderHeader(action: StatusAction) {
  const ui = (status: SignupStatus) => (
    <HeaderAnnouncer status={status}>
      <CloseButton action={action} />
    </HeaderAnnouncer>
  );
  const utils = render(ui('open'));
  return { ...utils, show: (status: SignupStatus) => utils.rerender(ui(status)) };
}

describe('HeaderAnnouncer', () => {
  it('says the signup closed when this page’s Close signup closed it', async () => {
    const { show } = renderHeader(async () => null);
    expect(screen.getByRole('status')).toHaveTextContent('');
    await act(async () => {
      screen.getByRole('button', { name: 'Close' }).click();
    });
    show('closed');
    expect(screen.getByRole('status')).toHaveTextContent(CLOSED);
  });

  it('says nothing when the signup was closed some other way', () => {
    const { show } = renderHeader(async () => null);
    show('closed');
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('says nothing after a refused close, when the signup closes later some other way', async () => {
    const { show } = renderHeader(async () => ({ error: 'You don’t have edit access.' }));
    await act(async () => {
      screen.getByRole('button', { name: 'Close' }).click();
    });
    show('closed');
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('says the same words again as a new node, so a screen reader reads them again', () => {
    function Say() {
      const say = useAnnounce();
      return (
        <button type="button" onClick={() => say('Saved.')}>
          Say
        </button>
      );
    }
    render(
      <HeaderAnnouncer status="draft">
        <Say />
      </HeaderAnnouncer>,
    );
    const region = screen.getByRole('status');
    act(() => screen.getByRole('button', { name: 'Say' }).click());
    const first = region.firstElementChild;
    expect(region).toHaveTextContent('Saved.');
    act(() => screen.getByRole('button', { name: 'Say' }).click());
    expect(region).toHaveTextContent('Saved.');
    expect(region.firstElementChild).not.toBe(first);
    expect(region.children).toHaveLength(1);
  });
});
