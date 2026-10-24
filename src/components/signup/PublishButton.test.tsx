// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { publishCheckCopy, publishCheckTarget, type PublishCheck } from '@/lib/publish-check';
import { BuildBridge, useRegisterBuildTab } from './BuildBridge';
import { HeaderAnnouncer } from './HeaderAnnouncer';
import { PublishButton, PublishRefusal } from './PublishButton';
import { ShareButton } from './ShareButton';
import { ShareScope } from './ShareScope';
import type { StatusAction } from './StatusActionForm';

vi.mock('@/components/share/ShareQrCode', () => ({ ShareQrCode: () => null }));
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/app/signups/sig_1/build',
}));
const loads = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/components/share/load-share-panel', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/share/load-share-panel')>();
  return {
    loadSharePanel: () => {
      loads.count += 1;
      return real.loadSharePanel();
    },
  };
});

const LINK = 'https://your-site.example/s/bake-sale-k3x';
const LATER = 'People will see that, and a published signup can’t go back to being a draft.';

const EMPTY: PublishCheck = { kind: 'all_blank', slotId: 'slot_a', slotCount: 1 };
const TBD: PublishCheck = {
  kind: 'placeholder',
  slotIds: ['slot_b'],
  words: ['TBD'],
  fieldRef: 'what',
  slotLabel: 'Sat, Nov 14',
};

/** What the action answers for `check`, with the words the server puts with it. */
const answer = (check: PublishCheck) => ({
  check,
  copy: publishCheckCopy(check),
  target: publishCheckTarget(check),
});

/** A window this wide; jsdom has no matchMedia of its own. */
function windowWidth(width: number) {
  window.matchMedia = (query: string) =>
    ({
      matches: width >= Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
}

/** Stands in for the Build tab, as BuildWysiwyg registers itself. */
function FakeBuildTab(props: Parameters<typeof useRegisterBuildTab>[0]) {
  useRegisterBuildTab(props);
  return null;
}

/**
 * The header's Publish and share, on a computer and a phone, as SignupHeader
 * lays them out, with the Share button that takes its place once published
 * (here from the start, to show the panel Publish opens). `page` is the tab.
 */
function Header({
  action,
  buildTab,
  page,
}: {
  action: StatusAction;
  buildTab?: Parameters<typeof FakeBuildTab>[0];
  page?: ReactNode;
}) {
  return (
    <BuildBridge buildHref="/app/signups/sig_1/build">
      <HeaderAnnouncer status="draft">
        <ShareScope
          publishAction={action}
          signupId="sig_1"
          title="Bake sale helpers"
          url={LINK}
          message=""
        >
          <div data-testid="desktop">
            <PublishButton variant="desktop" />
            <ShareButton variant="desktop" />
            <PublishRefusal />
          </div>
          <div data-testid="phone">
            <PublishButton variant="phone" />
          </div>
        </ShareScope>
      </HeaderAnnouncer>
      {buildTab ? <FakeBuildTab {...buildTab} /> : null}
      {page}
    </BuildBridge>
  );
}

/** A Build tab whose fix opens a field and focuses it once rendered, as BuildWysiwyg does. */
function FieldTab() {
  const [opened, setOpened] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  useRegisterBuildTab({
    flushPendingSaves: async () => true,
    openSlot: () => {
      setOpened((n) => n + 1);
      return true;
    },
  });
  useEffect(() => {
    if (opened) field.current?.focus();
  }, [opened]);
  return <input ref={field} aria-label="What value" />;
}

const publishIn = (where: 'desktop' | 'phone') =>
  within(screen.getByTestId(where)).getByRole('button', { name: 'Publish and share' });
const checking = () => screen.queryAllByRole('button', { name: 'Checking…' });

/**
 * A Header on fake timers whose Build tab's saves answer only when `save` is
 * called: true, or false for a save that failed.
 */
function slowSaves(action: StatusAction) {
  vi.useFakeTimers();
  let settle: (saved: boolean) => void = () => {};
  render(
    <Header
      action={action}
      buildTab={{
        flushPendingSaves: () => new Promise<boolean>((resolve) => (settle = resolve)),
        openSlot: () => true,
      }}
    />,
  );
  return {
    wait: (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms)),
    save: (saved = true) => act(async () => settle(saved)),
  };
}

async function press(button: HTMLElement) {
  await act(async () => {
    fireEvent.click(button);
  });
}

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(window, 'matchMedia');
  router.push.mockClear();
});

describe('Publish and share', () => {
  beforeEach(() => windowWidth(1280));

  it('saves what the Build tab has pending, then publishes', async () => {
    let saved: (value: boolean) => void = () => {};
    const flushPendingSaves = vi.fn(() => new Promise<boolean>((resolve) => (saved = resolve)));
    const publish = vi.fn<StatusAction>(async () => ({ published: true }));
    render(<Header action={publish} buildTab={{ flushPendingSaves, openSlot: () => true }} />);
    const before = loads.count;

    await press(publishIn('desktop'));
    // The share panel's code starts loading at once; Publish waits for the saves.
    expect(loads.count).toBe(before + 1);
    expect(flushPendingSaves).toHaveBeenCalledOnce();
    expect(publish).not.toHaveBeenCalled();
    // Busy at once, so a second press does nothing, though it doesn't look it yet.
    const busy = publishIn('desktop');
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    await press(busy);
    expect(flushPendingSaves).toHaveBeenCalledOnce();

    await act(async () => saved(true));
    expect(publish).toHaveBeenCalledOnce();
    expect(publish.mock.calls[0]?.[0]?.get('acknowledge')).toBeNull();
    expect(await screen.findByRole('dialog', { name: 'Now send people the link' })).toBeVisible();
  });

  it('says Checking…, on both buttons, only once the answer is slow, until the panel opens', async () => {
    const { wait, save } = slowSaves(async () => answer(EMPTY));
    await press(publishIn('desktop'));
    await wait(299);
    expect(checking()).toHaveLength(0);
    await wait(1);
    expect(checking()).toHaveLength(2);
    for (const button of checking()) expect(button).toHaveAttribute('aria-busy', 'true');

    // The check answers at 350 ms, and its panel takes over from the spinner.
    await wait(50);
    await save();
    expect(screen.getByRole('dialog', { name: 'Nothing to sign up for yet' })).toBeInTheDocument();
    expect(checking()).toHaveLength(0);
    // Closing the panel doesn't bring it back.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Fill it in' }), { key: 'Escape' });
    await wait(1_000);
    expect(checking()).toHaveLength(0);
  });

  it('stops saying Checking… as a save’s refusal shows', async () => {
    const { wait, save } = slowSaves(async () => answer(EMPTY));
    await press(publishIn('desktop'));
    await wait(350);
    expect(checking()).toHaveLength(2);
    await save(false);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A change didn’t save. Fix it, then publish.',
    );
    expect(checking()).toHaveLength(0);
  });

  it('keeps Checking… 400 ms at least when nothing else on screen changes', async () => {
    const { wait, save } = slowSaves(async () => null);
    await press(publishIn('desktop'));
    await wait(350);
    await save();
    // Shown at 300, so kept until 700, though it isn't busy now.
    expect(checking()).toHaveLength(2);
    expect(checking()[0]).toHaveAttribute('aria-busy', 'false');
    await wait(349);
    expect(checking()).toHaveLength(2);
    await wait(1);
    expect(checking()).toHaveLength(0);
  });

  it('waits its 300 ms again for a press just after an answer', async () => {
    const { wait, save } = slowSaves(async () => answer(EMPTY));
    await press(publishIn('desktop'));
    await wait(350);
    await save();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Fill it in' }), { key: 'Escape' });
    await wait(50);
    await press(publishIn('desktop'));
    await wait(299);
    expect(checking()).toHaveLength(0);
    await wait(1);
    expect(checking()).toHaveLength(2);
  });

  it('shows no spinner for a check that answers at once', async () => {
    vi.useFakeTimers();
    render(<Header action={async () => answer(EMPTY)} />);
    await press(publishIn('desktop'));
    expect(screen.getByRole('dialog', { name: 'Nothing to sign up for yet' })).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(checking()).toHaveLength(0);
  });

  it('publishes straight away off the Build tab, with nothing to save', async () => {
    const publish = vi.fn<StatusAction>(async () => null);
    render(<Header action={publish} />);
    await press(publishIn('desktop'));
    expect(publish).toHaveBeenCalledOnce();
  });
});

describe('Publish and share, when a save goes wrong', () => {
  beforeEach(() => windowWidth(1280));

  it('doesn’t publish past a change that didn’t save, and says so where refusals go', async () => {
    const publish = vi.fn<StatusAction>(async () => ({ published: true }));
    render(
      <Header
        action={publish}
        buildTab={{ flushPendingSaves: async () => false, openSlot: () => true }}
      />,
    );
    await press(publishIn('desktop'));
    expect(publish).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A change didn’t save. Fix it, then publish.',
    );
    expect(publishIn('desktop')).not.toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('goes on after a while when a save never answers, and the check reads what’s stored', async () => {
    vi.useFakeTimers();
    const publish = vi.fn<StatusAction>(async () => null);
    render(
      <Header
        action={publish}
        buildTab={{ flushPendingSaves: () => new Promise<boolean>(() => {}), openSlot: () => true }}
      />,
    );
    await press(publishIn('desktop'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000);
    });
    expect(publish).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(publish).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('the check on a computer', () => {
  beforeEach(() => windowWidth(1280));

  it('opens by the button, named by its title and described by its text, focus on the fix', async () => {
    render(<Header action={async () => answer(EMPTY)} />);
    const publish = publishIn('desktop');
    expect(publish).toHaveAttribute('aria-haspopup', 'dialog');
    await press(publish);

    const panel = screen.getByRole('dialog', { name: 'Nothing to sign up for yet' });
    expect(within(screen.getByTestId('desktop')).getByRole('dialog')).toBe(panel);
    expect(panel).toHaveAccessibleDescription(
      'The slot is empty. Say what people sign up for, then publish.',
    );
    expect(publish).toHaveAttribute('aria-expanded', 'true');
    // The other choice, then the fix, as the mock-up has them.
    expect(
      within(panel)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Not now', 'Fill it in']);
    expect(within(panel).getByRole('button', { name: 'Fill it in' })).toHaveFocus();
    // One panel: the phone's sheet stays shut. The live region says nothing.
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('closes on Escape and Not now, putting focus back on Publish and share', async () => {
    render(<Header action={async () => answer(EMPTY)} />);
    const publish = publishIn('desktop');
    await press(publish);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Fill it in' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(publish).toHaveFocus();
    expect(publish).toHaveAttribute('aria-expanded', 'false');

    await press(publish);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(publish).toHaveFocus();
  });

  it('closes when Publish and share is pressed again, without publishing', async () => {
    const publish = vi.fn<StatusAction>(async () => answer(TBD));
    render(<Header action={publish} />);
    await press(publishIn('desktop'));
    expect(screen.getByRole('dialog', { name: 'Before people see it' })).toBeInTheDocument();
    await press(publishIn('desktop'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(publish).toHaveBeenCalledOnce();
  });

  it('warns about a placeholder, and Publish anyway publishes past it', async () => {
    const publish = vi.fn<StatusAction>(async (form) =>
      form?.get('acknowledge') === 'placeholder' ? { published: true } : answer(TBD),
    );
    render(<Header action={publish} />);
    await press(publishIn('desktop'));
    const panel = screen.getByRole('dialog', { name: 'Before people see it' });
    expect(panel).toHaveAccessibleDescription(`Sat, Nov 14 still says “TBD”. ${LATER}`);
    expect(within(panel).getByRole('button', { name: 'Name it first' })).toHaveFocus();

    await press(within(panel).getByRole('button', { name: 'Publish anyway' }));
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[1]?.[0]?.get('acknowledge')).toBe('placeholder');
    expect(await screen.findByRole('dialog', { name: 'Now send people the link' })).toBeVisible();
  });

  it('offers only Not now when there are no fields, with the focus on it', async () => {
    render(<Header action={async () => answer({ kind: 'no_fields' })} />);
    await press(publishIn('desktop'));
    const panel = screen.getByRole('dialog', { name: 'Nothing to sign up for yet' });
    expect(
      within(panel)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Not now']);
    expect(within(panel).getByRole('button', { name: 'Not now' })).toHaveFocus();
  });

  it.each<[string, PublishCheck, string | null, string | null]>([
    ['an empty slot opens it, focus in its first field', EMPTY, 'slot_a', null],
    ['a placeholder opens its slot, focus in its field', TBD, 'slot_b', 'what'],
    ['no slots adds one and opens it', { kind: 'no_slots' }, null, null],
  ])('the fix for %s on the Build tab', async (_name, check, slotId, fieldRef) => {
    const openSlot = vi.fn(() => true);
    render(
      <Header
        action={async () => answer(check)}
        buildTab={{ flushPendingSaves: async () => true, openSlot }}
      />,
    );
    await press(publishIn('desktop'));
    fireEvent.click(screen.getByRole('button', { name: publishCheckCopy(check).fix ?? '' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(openSlot).toHaveBeenCalledWith(slotId, fieldRef);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('the fix on another tab goes to Build, with nothing in the address', async () => {
    render(<Header action={async () => answer(TBD)} />);
    await press(publishIn('desktop'));
    fireEvent.click(screen.getByRole('button', { name: 'Name it first' }));
    expect(router.push).toHaveBeenCalledWith('/app/signups/sig_1/build');
  });
});

describe('the check on a phone', () => {
  beforeEach(() => windowWidth(390));

  it('opens a sheet over the bar, the fix first, and ✕ puts focus back on Publish and share', async () => {
    render(<Header action={async () => answer(TBD)} />);
    const publish = publishIn('phone');
    await press(publish);

    const sheet = await screen.findByRole('dialog', { name: 'Before people see it' });
    expect(sheet).toHaveAccessibleDescription(`Sat, Nov 14 still says “TBD”. ${LATER}`);
    expect(
      within(sheet)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label') ?? b.textContent),
    ).toEqual(['Close', 'Name it first', 'Publish anyway']);
    await waitFor(() =>
      expect(within(sheet).getByRole('button', { name: 'Name it first' })).toHaveFocus(),
    );

    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(publish).toHaveFocus());
  });

  it('gives focus back to Publish and share when the slot isn’t one this page has', async () => {
    render(
      <Header
        action={async () => answer(TBD)}
        buildTab={{ flushPendingSaves: async () => true, openSlot: () => false }}
      />,
    );
    const publish = publishIn('phone');
    await press(publish);
    const sheet = await screen.findByRole('dialog', { name: 'Before people see it' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Name it first' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(publish).toHaveFocus());
  });

  it('leaves focus where the fix put it', async () => {
    render(<Header action={async () => answer(EMPTY)} page={<FieldTab />} />);
    await press(publishIn('phone'));
    const sheet = await screen.findByRole('dialog', { name: 'Nothing to sign up for yet' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Fill it in' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // A tick for Radix, which hands focus back a moment after the sheet closes.
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(screen.getByRole('textbox', { name: 'What value' })).toHaveFocus();
  });
});
