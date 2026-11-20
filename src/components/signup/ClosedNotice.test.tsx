// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { getTestTranslator } from '@/i18n/testing/translator';
import type { SignupStatus } from '@/schemas/signups';
import { ClosedNotice } from './ClosedNotice';
import { signupHeaderText } from './header-text';
import { HeaderAnnouncer, useAnnouncedStatusChange } from './HeaderAnnouncer';

const BODY = 'People can’t sign up now. Everyone already signed up keeps their spot.';

/** The header's words in English, as the layout passes them. */
const TEXT = signupHeaderText(getTestTranslator('organizer.signup'));

/** A button that changes the status to `to` the way Close or Reopen signup does. */
function ChangeButton({ to }: { to: SignupStatus }) {
  const change = useAnnouncedStatusChange(async () => null, to);
  return (
    <button type="button" onClick={() => void change()}>
      {to === 'closed' ? 'Close signup' : 'Reopen signup'}
    </button>
  );
}

/** The layout's announcer at `status`, with the title, the box and both buttons. */
function page(status: SignupStatus) {
  return (
    <HeaderAnnouncer status={status} announcements={TEXT.announcements}>
      <h1 tabIndex={-1} data-signup-title>
        Bake sale helpers
      </h1>
      <ChangeButton to="closed" />
      <ChangeButton to="open" />
      <ClosedNotice
        status={status}
        text={TEXT.closedNotice}
        help="/help/close-or-reopen-a-signup"
      />
    </HeaderAnnouncer>
  );
}

const box = () => screen.queryByText('Signup closed');

/** Presses a button and lets its action answer. */
const press = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });

beforeEach(() => {
  // jsdom lays nothing out: say the title takes up room, as on screen.
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
    return (this.hasAttribute('data-signup-title') ? [{}] : []) as unknown as DOMRectList;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ClosedNotice', () => {
  it('shows once Close signup on this page has closed the signup', async () => {
    const { rerender } = render(page('open'));
    expect(box()).toBeNull();
    await press('Close signup');
    rerender(page('closed'));
    expect(box()).toBeInTheDocument();
    expect(screen.getByText(BODY)).toBeInTheDocument();
    // Not a live region: the header's says it closed.
    expect(box()?.closest('[role="status"]')).toBeNull();
  });

  it('links to the help page on closing and reopening, in the same tab', async () => {
    const { rerender } = render(page('open'));
    await press('Close signup');
    rerender(page('closed'));
    const link = screen.getByRole('link', { name: 'How closing and reopening work' });
    expect(link).toHaveAttribute('href', '/help/close-or-reopen-a-signup');
    expect(link).not.toHaveAttribute('target');
  });

  it('goes for good with its ✕, which gives focus to the title', async () => {
    const { rerender } = render(page('open'));
    await press('Close signup');
    rerender(page('closed'));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(box()).toBeNull();
    expect(screen.getByRole('heading', { name: 'Bake sale helpers' })).toHaveFocus();
    rerender(page('closed'));
    expect(box()).toBeNull();
  });

  it('shows nothing for a signup that’s closed when the page loads', () => {
    render(page('closed'));
    expect(box()).toBeNull();
  });

  it('shows nothing for a signup closed some other way', () => {
    const { rerender } = render(page('open'));
    rerender(page('closed'));
    expect(box()).toBeNull();
  });

  it('shows nothing when, after a close here, it’s reopened and closed some other way', async () => {
    const { rerender } = render(page('open'));
    await press('Close signup');
    rerender(page('closed'));
    rerender(page('open'));
    expect(box()).toBeNull();
    rerender(page('closed'));
    expect(box()).toBeNull();
  });

  it('goes once the signup is reopened, and shows again on the next close from here', async () => {
    const { rerender } = render(page('open'));
    await press('Close signup');
    rerender(page('closed'));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    await press('Reopen signup');
    rerender(page('open'));
    expect(box()).toBeNull();

    await press('Close signup');
    rerender(page('closed'));
    expect(box()).toBeInTheDocument();
  });
});
