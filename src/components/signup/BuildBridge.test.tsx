// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { BuildBridge, useBuildBridge, useRegisterBuildTab } from './BuildBridge';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

type Bridge = ReturnType<typeof useBuildBridge>;
type Tab = Parameters<typeof useRegisterBuildTab>[0];

function Header({ onReady }: { onReady: (bridge: Bridge) => void }) {
  onReady(useBuildBridge());
  return null;
}

// What the Build tab got back to hand the focus to Publish and share with.
let handBack: () => boolean = () => false;

function BuildTab(tab: Tab) {
  handBack = useRegisterBuildTab(tab);
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
    show(tab);
    expect(tab.openSlot).toHaveBeenCalledOnce();
    expect(tab.openSlot).toHaveBeenCalledWith(null, null);

    // Mounted again, as Back and then Forward would: no second slot.
    show(null);
    const again = idleTab();
    show(again);
    expect(again.openSlot).not.toHaveBeenCalled();
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

  it('waits for the Build tab showing and for one that left before it', async () => {
    const left: Tab = { flushPendingSaves: vi.fn(async () => true), openSlot: vi.fn(() => true) };
    const { bridge, show } = renderBridge(left);
    show(null);
    const here: Tab = { flushPendingSaves: vi.fn(async () => false), openSlot: vi.fn(() => true) };
    show(here);
    await expect(bridge().flushPendingSaves()).resolves.toBe(false);
    expect(here.flushPendingSaves).toHaveBeenCalled();
  });

  it('hands the focus back to the Publish and share that asked last, while it asks', () => {
    const { bridge } = renderBridge(idleTab());
    const desktop = vi.fn();
    const phone = vi.fn();
    const stopDesktop = bridge().onHandBack(desktop);
    expect(handBack()).toBe(true);
    expect(desktop).toHaveBeenCalledOnce();

    // The window narrows: the phone's takes over, and the computer's stops.
    const stopPhone = bridge().onHandBack(phone);
    stopDesktop();
    expect(handBack()).toBe(true);
    expect(phone).toHaveBeenCalledOnce();
    expect(desktop).toHaveBeenCalledOnce();

    // Published: no Publish and share, so nothing takes it, and it says so.
    stopPhone();
    expect(handBack()).toBe(false);
    expect(phone).toHaveBeenCalledOnce();
  });
});
