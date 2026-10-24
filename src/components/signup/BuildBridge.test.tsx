// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { BuildBridge, useBuildBridge, useRegisterBuildTab } from './BuildBridge';

const router = vi.hoisted(() => ({ push: vi.fn() }));
// Where the organizer is: another tab until a test says otherwise.
const nav = vi.hoisted(() => ({ pathname: '/app/signups/sig_1/responses' }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => nav.pathname }));

const BUILD = '/app/signups/sig_1/build';

type Bridge = ReturnType<typeof useBuildBridge>;
type Tab = Parameters<typeof useRegisterBuildTab>[0];

function Header({ onReady }: { onReady: (bridge: Bridge) => void }) {
  onReady(useBuildBridge());
  return null;
}

function BuildTab(tab: Tab) {
  useRegisterBuildTab(tab);
  return null;
}

/** The layout's bridge, the header asking through it, and `tab` while it shows. */
function renderBridge(tab: Tab | null) {
  let bridge: Bridge | null = null;
  const tree = (shown: Tab | null) => (
    <BuildBridge buildHref="/app/signups/sig_1/build">
      <Header onReady={(b) => (bridge = b)} />
      {shown ? <BuildTab {...shown} /> : null}
    </BuildBridge>
  );
  const view = render(tree(tab));
  return {
    bridge: () => {
      if (!bridge) throw new Error('no bridge');
      return bridge;
    },
    show: (shown: Tab | null) => view.rerender(tree(shown)),
  };
}

const idleTab = (): Tab => ({
  flushPendingSaves: vi.fn(async () => true),
  openSlot: vi.fn(() => true),
});

afterEach(() => {
  router.push.mockClear();
  nav.pathname = '/app/signups/sig_1/responses';
});

describe('BuildBridge', () => {
  it('asks the Build tab while it shows, and passes on whether it could open the slot', () => {
    const tab = { ...idleTab(), openSlot: vi.fn(() => false) };
    const { bridge } = renderBridge(tab);
    expect(bridge().openSlot('slot_a', 'what')).toBe(false);
    expect(tab.openSlot).toHaveBeenCalledWith('slot_a', 'what');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('from another tab goes to Build, which takes the request once as it mounts', () => {
    const { bridge, show } = renderBridge(null);
    expect(bridge().openSlot(null, null)).toBe(true);
    expect(router.push).toHaveBeenCalledWith('/app/signups/sig_1/build');

    const tab = idleTab();
    nav.pathname = BUILD;
    show(tab);
    expect(tab.openSlot).toHaveBeenCalledOnce();
    expect(tab.openSlot).toHaveBeenCalledWith(null, null);

    // Mounted again, as Back and then Forward would: no second slot.
    show(null);
    const again = idleTab();
    show(again);
    expect(again.openSlot).not.toHaveBeenCalled();
  });

  it('drops the request when the organizer ends up on another tab instead', () => {
    const { bridge, show } = renderBridge(null);
    bridge().openSlot(null, null);
    // They went to Settings rather than waiting for Build.
    nav.pathname = '/app/signups/sig_1/settings';
    show(null);
    // A later visit to Build adds nothing.
    nav.pathname = BUILD;
    const tab = idleTab();
    show(tab);
    expect(tab.openSlot).not.toHaveBeenCalled();
  });

  it('saves nothing and says so off the Build tab', async () => {
    const { bridge } = renderBridge(null);
    await expect(bridge().flushPendingSaves()).resolves.toBe(true);
  });

  it('waits for the saves a Build tab left behind, and says whether they saved', async () => {
    let finish: (saved: boolean) => void = () => {};
    const tab: Tab = {
      flushPendingSaves: vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve))),
      openSlot: vi.fn(() => true),
    };
    const { bridge, show } = renderBridge(tab);
    // The organizer goes to another tab: Build sends its pending edits as it goes.
    show(null);
    expect(tab.flushPendingSaves).toHaveBeenCalledOnce();

    let saved: boolean | null = null;
    const flushed = bridge()
      .flushPendingSaves()
      .then((value) => (saved = value));
    await act(async () => {});
    expect(saved).toBeNull();
    await act(async () => {
      finish(false);
      await flushed;
    });
    expect(saved).toBe(false);

    // That answer is used once; the next Publish starts clean.
    await expect(bridge().flushPendingSaves()).resolves.toBe(true);
  });

  it('stops counting a departed tab’s failed save once a Build tab shows again, but still waits for it', async () => {
    let finish: (saved: boolean) => void = () => {};
    const left: Tab = {
      flushPendingSaves: vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve))),
      openSlot: vi.fn(() => true),
    };
    const { bridge, show } = renderBridge(left);
    show(null);
    show(idleTab());
    let saved: boolean | null = null;
    const flushed = bridge()
      .flushPendingSaves()
      .then((value) => (saved = value));
    await act(async () => {});
    expect(saved).toBeNull();
    await act(async () => {
      finish(false);
      await flushed;
    });
    expect(saved).toBe(true);
  });

  it('waits for the Build tab showing and for one that left before it', async () => {
    const left: Tab = { flushPendingSaves: vi.fn(async () => true), openSlot: vi.fn(() => true) };
    const { bridge, show } = renderBridge(left);
    show(null);
    const here: Tab = { flushPendingSaves: vi.fn(async () => false), openSlot: vi.fn(() => true) };
    show(here);
    await expect(bridge().flushPendingSaves()).resolves.toBe(false);
    expect(here.flushPendingSaves).toHaveBeenCalled();
  });
});
