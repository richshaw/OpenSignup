// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SignupStatus } from '@/schemas/signups';
import { HeaderAnnouncer } from './HeaderAnnouncer';
import { ReopenButton, ReopenRefusal, ReopenScope, ReopenSheetItem } from './ReopenButton';
import type { StatusChangeAction } from './StatusActionForm';

const NO_ACCESS = 'You don’t have edit access.';

/** Reopen signup as a computer's header has it: its scope, the button, and the refusal's line. */
function Header({ action }: { action: StatusChangeAction }) {
  return (
    <ReopenScope reopenAction={action}>
      <ReopenButton />
      <ReopenRefusal />
    </ReopenScope>
  );
}

const reopenButton = () => screen.getByRole('button', { name: 'Reopen signup' });

/** Presses Reopen signup and lets its form action start. */
const press = (button: HTMLElement) =>
  act(async () => {
    fireEvent.click(button);
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Reopen signup in a computer’s header', () => {
  it('reopens the signup when pressed', async () => {
    const reopenAction = vi.fn<StatusChangeAction>(async () => null);
    render(<Header action={reopenAction} />);
    await press(reopenButton());
    await waitFor(() => expect(reopenAction).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says "Reopening…" and can’t be pressed again while it’s in flight', async () => {
    // A reopen that doesn't answer until the end of the test. React waits for
    // every action in flight before it finishes any, so one left hanging
    // would hold up the tests after this.
    let answer: (result: null) => void = () => {};
    const reopenAction = vi.fn<StatusChangeAction>(
      () => new Promise((resolve) => (answer = resolve)),
    );
    render(<Header action={reopenAction} />);
    await press(reopenButton());

    const busy = await screen.findByRole('button', { name: /Reopening…/ });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(busy);
    expect(reopenAction).toHaveBeenCalledTimes(1);
    await act(async () => answer(null));
  });

  it('shows a refusal after the button', async () => {
    const { container } = render(<Header action={async () => ({ error: NO_ACCESS })} />);
    await press(reopenButton());

    const refusal = await screen.findByRole('alert');
    expect(refusal).toHaveTextContent(NO_ACCESS);
    // After the button's form, not before or beside it.
    const form = container.querySelector('form');
    expect(form?.compareDocumentPosition(refusal)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(reopenButton()).toBeEnabled();
  });

  it('gives focus back to the button after a refusal', async () => {
    // A browser takes focus off a button while it's disabled and doesn't
    // give it back. jsdom keeps it there, so the test moves it elsewhere on
    // the page while the press is in flight.
    let answer: (result: { error: string }) => void = () => {};
    render(
      <>
        <Header action={() => new Promise((resolve) => (answer = resolve))} />
        <a href="#elsewhere">Elsewhere</a>
      </>,
    );
    reopenButton().focus();
    await press(reopenButton());
    const elsewhere = screen.getByRole('link', { name: 'Elsewhere' });
    elsewhere.focus();
    expect(elsewhere).toHaveFocus();

    await act(async () => answer({ error: NO_ACCESS }));
    expect(await screen.findByRole('alert')).toHaveTextContent(NO_ACCESS);
    expect(reopenButton()).toHaveFocus();
  });

  it('takes no focus as the page loads', () => {
    render(<Header action={async () => null} />);
    expect(reopenButton()).not.toHaveFocus();
  });

  it('hides an old refusal while a retry is in flight', async () => {
    let answer: (result: null) => void = () => {};
    const reopenAction = vi
      .fn<StatusChangeAction>()
      .mockResolvedValueOnce({ error: NO_ACCESS })
      .mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    render(<Header action={reopenAction} />);

    await press(reopenButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(NO_ACCESS);

    await press(reopenButton());
    await screen.findByRole('button', { name: /Reopening…/ });
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => answer(null));
  });

  it('asks the header to say it reopened, and nothing for a refusal', async () => {
    // jsdom lays nothing out: say the title takes up room, as on screen.
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
      return (this.hasAttribute('data-signup-title') ? [{}] : []) as unknown as DOMRectList;
    });
    const page = (status: SignupStatus, action: StatusChangeAction) => (
      <HeaderAnnouncer status={status}>
        <h1 tabIndex={-1} data-signup-title>
          Bake sale helpers
        </h1>
        {/* The header's Reopen signup shows only while it's closed. */}
        {status === 'closed' ? <Header action={action} /> : null}
      </HeaderAnnouncer>
    );

    const refused = render(page('closed', async () => ({ error: NO_ACCESS })));
    await press(reopenButton());
    await screen.findByRole('alert');
    refused.rerender(page('open', async () => null));
    expect(screen.getByRole('status')).toHaveTextContent('');
    refused.unmount();

    const { rerender } = render(page('closed', async () => null));
    await press(reopenButton());
    rerender(page('open', async () => null));
    expect(screen.getByRole('status')).toHaveTextContent('Reopened. People can sign up again.');
    await act(() => new Promise<void>((resolve) => setTimeout(resolve)));
    expect(screen.getByRole('heading', { name: 'Bake sale helpers' })).toHaveFocus();
  });
});

describe('Reopen signup in a phone’s More actions sheet', () => {
  it('reopens when pressed, and after a refusal says why under it and gives it focus back', async () => {
    let answer: (result: { error: string }) => void = () => {};
    const reopenAction = vi.fn<StatusChangeAction>(
      () => new Promise((resolve) => (answer = resolve)),
    );
    const { container } = render(
      <>
        <ReopenSheetItem reopenAction={reopenAction} />
        <a href="#elsewhere">Elsewhere</a>
      </>,
    );
    await press(reopenButton());
    await waitFor(() => expect(reopenAction).toHaveBeenCalledTimes(1));
    screen.getByRole('link', { name: 'Elsewhere' }).focus();

    await act(async () => answer({ error: NO_ACCESS }));
    const refusal = await screen.findByRole('alert');
    expect(refusal).toHaveTextContent(NO_ACCESS);
    const form = container.querySelector('form');
    expect(form?.compareDocumentPosition(refusal)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(reopenButton()).toHaveFocus();
  });
});
