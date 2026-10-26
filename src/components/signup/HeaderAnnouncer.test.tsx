// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { SignupStatus } from '@/schemas/signups';
import { HeaderAnnouncer, useAnnounce, useAnnouncedStatusChange } from './HeaderAnnouncer';
import type { StatusAction, StatusChangeAction } from './StatusActionForm';

const CLOSED = 'Closed. People can’t sign up now.';
const REOPENED = 'Reopened. People can sign up again.';

/** Runs a status change the way the header's Close signup does, through the hook. */
function ChangeButton({ action, to }: { action: StatusChangeAction; to: SignupStatus }) {
  const change = useAnnouncedStatusChange(action, to);
  return (
    <button type="button" onClick={() => void change()}>
      Change
    </button>
  );
}

/**
 * The announcer at `status`, round both headers' titles and a button that
 * asks for `to`. CSS shows one header or the other; here the computer's is on
 * screen and the phone's isn't.
 */
function renderHeader(
  action: StatusChangeAction,
  status: SignupStatus = 'open',
  to: SignupStatus = 'closed',
) {
  const ui = (now: SignupStatus) => (
    <HeaderAnnouncer status={now}>
      <h1 tabIndex={-1} data-signup-title data-testid="phone-title">
        Bake sale helpers
      </h1>
      <h1 tabIndex={-1} data-signup-title data-testid="computer-title">
        Bake sale helpers
      </h1>
      <ChangeButton action={action} to={to} />
    </HeaderAnnouncer>
  );
  const utils = render(ui(status));
  const button = screen.getByRole('button', { name: 'Change' });
  return {
    ...utils,
    show: (now: SignupStatus) => utils.rerender(ui(now)),
    /** Presses the button with focus on it first, as a keyboard user would. */
    press: () =>
      act(async () => {
        button.focus();
        button.click();
      }),
    button,
  };
}

/** Waits out the tick the header waits before it moves focus. */
const tick = () => act(() => new Promise<void>((resolve) => setTimeout(resolve)));

beforeEach(() => {
  // jsdom lays nothing out: only the computer's title takes up room.
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
    const onScreen = this.getAttribute('data-testid') === 'computer-title';
    return (onScreen ? [{}] : []) as unknown as DOMRectList;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HeaderAnnouncer', () => {
  it('says the signup closed when this page’s Close signup closed it, and focuses the title on screen', async () => {
    const { show, press } = renderHeader(async () => null);
    expect(screen.getByRole('status')).toHaveTextContent('');
    await press();
    show('closed');
    expect(screen.getByRole('status')).toHaveTextContent(CLOSED);
    await tick();
    expect(screen.getByTestId('computer-title')).toHaveFocus();
  });

  it('says nothing and leaves focus alone when the signup was closed some other way', async () => {
    const { show, button } = renderHeader(async () => null);
    act(() => button.focus());
    show('closed');
    await tick();
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(button).toHaveFocus();
  });

  it('says nothing after a refused close, when the signup closes later some other way', async () => {
    const { show, press, button } = renderHeader(async () => ({
      error: 'You don’t have edit access.',
    }));
    await press();
    show('closed');
    await tick();
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(button).toHaveFocus();
  });

  it('says the signup reopened when this page’s Reopen signup reopened it, and focuses the title on screen', async () => {
    const { show, press } = renderHeader(async () => null, 'closed', 'open');
    await press();
    show('open');
    expect(screen.getByRole('status')).toHaveTextContent(REOPENED);
    await tick();
    expect(screen.getByTestId('computer-title')).toHaveFocus();
  });

  it('says nothing and leaves focus alone when the signup was reopened some other way', async () => {
    const { show, button } = renderHeader(async () => null, 'closed', 'open');
    act(() => button.focus());
    show('open');
    await tick();
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(button).toHaveFocus();
  });

  it('says nothing after a refused reopen, when the signup reopens later some other way', async () => {
    const { show, press, button } = renderHeader(
      async () => ({ error: 'You don’t have edit access.' }),
      'closed',
      'open',
    );
    await press();
    show('open');
    await tick();
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(button).toHaveFocus();
  });

  // The status it asked for, but from a status the header has no words for
  // a change from: it goes by both. The draft-to-open row is what keeps
  // reaching open from a draft from saying "Reopened".
  it.each<[string, SignupStatus]>([
    ['a draft opened through the hook', 'open'],
    ['a draft closed through the hook', 'closed'],
  ])(
    'says nothing and leaves focus alone after %s, a change it doesn’t announce',
    async (_, to) => {
      const { show, press, button } = renderHeader(async () => null, 'draft', to);
      await press();
      show(to);
      await tick();
      expect(screen.getByRole('status')).toHaveTextContent('');
      expect(button).toHaveFocus();
    },
  );

  it('says nothing when the status changes some other way after a change asked for here', async () => {
    // Close signup answered, but the draft was published elsewhere first.
    const { show, press, button } = renderHeader(async () => null, 'draft', 'closed');
    await press();
    show('open');
    await tick();
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(button).toHaveFocus();
    // That change used up the ask: a close that comes later, from elsewhere,
    // says nothing either.
    show('closed');
    await tick();
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(button).toHaveFocus();
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

describe('useAnnouncedStatusChange', () => {
  it('takes no action shaped like Publish, which it would break', () => {
    // Publish takes a form and answers { published: true } when it works. The
    // hook passes no form and counts any answer but null as a refusal, so the
    // type keeps Publish out rather than letting it through to fail quietly.
    const publishShaped: StatusAction = async () => ({ published: true });
    // @ts-expect-error: not an action the hook takes.
    const taken: Parameters<typeof useAnnouncedStatusChange>[0] = publishShaped;
    expect(taken).toBe(publishShaped);
  });
});
