// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { CloseQuestionAction } from './CloseSignupConfirm';
import { MoreActionsMenu } from './MoreActionsMenu';
import type { StatusChangeAction } from './StatusActionForm';

const QUESTION = 'Nobody has signed up yet. People can’t sign up until you reopen it.';

/** Asking again is refused, so the page's question stays. */
const keepQuestion: CloseQuestionAction = async () => ({ error: 'Not asked in this test.' });

function renderMenu(
  closeAction: StatusChangeAction = vi.fn<StatusChangeAction>(async () => null),
  closeQuestionAction: CloseQuestionAction = keepQuestion,
) {
  render(
    <MoreActionsMenu
      closeQuestion={QUESTION}
      closeQuestionAction={closeQuestionAction}
      closeAction={closeAction}
    />,
  );
  return { closeAction, more: screen.getByRole('button', { name: 'More actions' }) };
}

/** The panel's Close signup: the menu item, then the red button that closes. */
const closeButton = () => screen.getByRole('button', { name: 'Close signup' });

describe('MoreActionsMenu', () => {
  it('opens a panel with Close signup, which closes nothing yet', () => {
    const { closeAction, more } = renderMenu();
    expect(more).toHaveAttribute('aria-haspopup', 'dialog');
    expect(more).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'More actions' })).toBeInTheDocument();
    expect(closeButton()).toHaveFocus();
    expect(closeAction).not.toHaveBeenCalled();
  });

  it('asks the question again as it opens, from the spots taken now', async () => {
    const fresh =
      '3 of 6 spots are still open. People can’t sign up until you reopen it. Everyone already signed up keeps their spot.';
    let answer: (result: { question: string }) => void = () => {};
    const closeQuestionAction = vi.fn<CloseQuestionAction>(
      () => new Promise((resolve) => (answer = resolve)),
    );
    const { more } = renderMenu(undefined, closeQuestionAction);
    fireEvent.click(more);
    expect(closeQuestionAction).toHaveBeenCalledTimes(1);
    fireEvent.click(closeButton());
    // The page's question until the answer comes.
    expect(screen.getByRole('group', { name: QUESTION })).toBeInTheDocument();
    await act(async () => answer({ question: fresh }));
    expect(screen.getByRole('group', { name: fresh })).toBeInTheDocument();
  });

  it('asks first, with focus on Not yet', () => {
    const { closeAction, more } = renderMenu();
    fireEvent.click(more);
    fireEvent.click(closeButton());

    expect(screen.getByRole('group', { name: QUESTION })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not yet' })).toHaveFocus();
    expect(closeAction).not.toHaveBeenCalled();
  });

  it('Not yet closes the panel, leaves the signup open and puts focus back on ⋯', () => {
    const { closeAction, more } = renderMenu();
    fireEvent.click(more);
    fireEvent.click(closeButton());
    fireEvent.click(screen.getByRole('button', { name: 'Not yet' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(more).toHaveFocus();
    expect(closeAction).not.toHaveBeenCalled();

    // It opens on the menu again, not on the question.
    fireEvent.click(more);
    expect(screen.queryByRole('group')).toBeNull();
    expect(closeButton()).toBeInTheDocument();
  });

  it('Escape closes it, from the menu or the question, and puts focus back on ⋯', () => {
    const { closeAction, more } = renderMenu();
    fireEvent.click(more);
    fireEvent.keyDown(closeButton(), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(more).toHaveFocus();

    fireEvent.click(more);
    fireEvent.click(closeButton());
    fireEvent.keyDown(screen.getByRole('button', { name: 'Not yet' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(more).toHaveFocus();
    expect(closeAction).not.toHaveBeenCalled();
  });

  it('a click outside closes it without taking focus back', () => {
    const { more } = renderMenu();
    fireEvent.click(more);
    expect(closeButton()).toHaveFocus();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(more).not.toHaveFocus();
  });

  it('closes when focus moves to something outside it, and leaves focus there', () => {
    render(
      <>
        <MoreActionsMenu
          closeQuestion={QUESTION}
          closeQuestionAction={keepQuestion}
          closeAction={async () => null}
        />
        <button type="button">Preview</button>
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const elsewhere = screen.getByRole('button', { name: 'Preview' });
    act(() => elsewhere.focus());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(elsewhere).toHaveFocus();
  });

  it('closes the signup only from the second Close signup', async () => {
    const { closeAction, more } = renderMenu();
    fireEvent.click(more);
    fireEvent.click(closeButton());
    expect(closeAction).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(closeButton());
    });
    await waitFor(() => expect(closeAction).toHaveBeenCalledTimes(1));
  });

  it('shows a refusal in the panel and keeps it open', async () => {
    const { more } = renderMenu(async () => ({ error: 'You don’t have edit access.' }));
    fireEvent.click(more);
    fireEvent.click(closeButton());
    await act(async () => {
      fireEvent.click(closeButton());
    });

    const panel = screen.getByRole('dialog', { name: 'More actions' });
    await waitFor(() => expect(panel).toHaveTextContent('You don’t have edit access.'));
    expect(screen.getByRole('button', { name: 'Not yet' })).toHaveFocus();
  });

  it('stays open while Close signup is in flight: Escape and a click outside wait', async () => {
    // A close that doesn't answer until the end of the test. React waits for
    // every action in flight before it finishes any, so one left hanging
    // would hold up the tests after this.
    let answer: (result: null) => void = () => {};
    renderMenu(() => new Promise((resolve) => (answer = resolve)));
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(closeButton());
    await act(async () => {
      fireEvent.click(closeButton());
    });
    await waitFor(() => expect(screen.getByRole('button', { name: /Closing/ })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Not yet' })).toBeDisabled();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'More actions' })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.getByRole('dialog', { name: 'More actions' })).toBeInTheDocument();
    await act(async () => answer(null));
  });

  it('starts clean when asked again: an earlier refusal doesn’t come back', async () => {
    const { more } = renderMenu(async () => ({ error: 'You don’t have edit access.' }));
    fireEvent.click(more);
    fireEvent.click(closeButton());
    await act(async () => {
      fireEvent.click(closeButton());
    });
    await waitFor(() =>
      expect(screen.getByRole('dialog')).toHaveTextContent('You don’t have edit access.'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Not yet' }));

    fireEvent.click(more);
    fireEvent.click(closeButton());
    expect(screen.getByRole('group', { name: QUESTION })).toBeInTheDocument();
    expect(screen.getByRole('dialog')).not.toHaveTextContent('You don’t have edit access.');
  });
});
