// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MoreActionsMenu } from './MoreActionsMenu';
import { StatusActionScope, type StatusAction } from './StatusActionForm';

const QUESTION =
  'Nobody has signed up yet. People can’t sign up after this, and you can’t reopen it.';

function renderMenu(closeAction: StatusAction = vi.fn<StatusAction>(async () => null)) {
  render(
    <StatusActionScope action={closeAction}>
      <MoreActionsMenu closeQuestion={QUESTION} />
    </StatusActionScope>,
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
      <StatusActionScope action={async () => null}>
        <MoreActionsMenu closeQuestion={QUESTION} />
        <button type="button">Preview</button>
      </StatusActionScope>,
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
});
