// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { BuildBridge, useBuildBridge, useRegisterBuildTab } from './BuildBridge';
import { TabsNav } from './TabsNav';

const router = vi.hoisted(() => ({ push: vi.fn() }));
// Where the organizer is: another tab until a test says otherwise.
const nav = vi.hoisted(() => ({ pathname: '/app/signups/sig_1/responses' }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => nav.pathname }));

const BUILD = '/app/signups/sig_1/build';

// TabsNav scrolls its tab into view, which jsdom can't.
Element.prototype.scrollIntoView = () => {};

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
      <TabsNav signupId="sig_1" counts={{ build: 2, responses: 0 }} />
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

  describe('a fix still on its way to Build', () => {
    // A tab's own onClick runs; jsdom just doesn't follow the link.
    const stay = (e: Event) => e.preventDefault();
    beforeEach(() => document.addEventListener('click', stay));
    afterEach(() => document.removeEventListener('click', stay));

    // The organizer pressed Add a slot on Settings, and Build hasn't come yet.
    function pressedOnSettings() {
      nav.pathname = '/app/signups/sig_1/settings';
      const view = renderBridge(null);
      view.bridge().openSlot(null, null);
      return view;
    }

    /** Build arrives, and whether it was asked to open a slot. */
    function buildArrives(show: (tab: Tab | null) => void) {
      nav.pathname = BUILD;
      const tab = idleTab();
      show(tab);
      return tab.openSlot;
    }

    it('is kept through a re-render on the same page', () => {
      const { show } = pressedOnSettings();
      show(null);
      expect(buildArrives(show)).toHaveBeenCalledWith(null, null);
    });

    it('is kept when the organizer chooses Build themselves', () => {
      const { show } = pressedOnSettings();
      fireEvent.click(screen.getByRole('tab', { name: /Build/ }));
      expect(buildArrives(show)).toHaveBeenCalledOnce();
    });

    it('is dropped when the organizer chooses the tab they’re on, so the path never changes', () => {
      const { show } = pressedOnSettings();
      fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
      show(null);
      expect(buildArrives(show)).not.toHaveBeenCalled();
    });

    it.each<[string, (tab: HTMLElement) => void]>([
      ['a Ctrl-click', (tab) => fireEvent.click(tab, { ctrlKey: true })],
      ['a Cmd-click', (tab) => fireEvent.click(tab, { metaKey: true })],
      ['a Shift-click', (tab) => fireEvent.click(tab, { shiftKey: true })],
      ['an Alt-click', (tab) => fireEvent.click(tab, { altKey: true })],
      // Browsers send a middle click as auxclick, never as click.
      [
        'a middle click',
        (tab) => fireEvent(tab, new MouseEvent('auxclick', { bubbles: true, button: 1 })),
      ],
    ])('is kept through %s on another tab, which doesn’t navigate this window', (_name, press) => {
      const { show } = pressedOnSettings();
      press(screen.getByRole('tab', { name: /Responses/ }));
      expect(buildArrives(show)).toHaveBeenCalledOnce();
    });

    it('is dropped when the organizer chooses another tab', () => {
      const { show } = pressedOnSettings();
      fireEvent.click(screen.getByRole('tab', { name: /Responses/ }));
      expect(buildArrives(show)).not.toHaveBeenCalled();
    });

    it('is dropped on Back or Forward', () => {
      const { show } = pressedOnSettings();
      act(() => {
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      expect(buildArrives(show)).not.toHaveBeenCalled();
    });

    it('is dropped when a form is sent, such as Settings’ Save', () => {
      const { show } = pressedOnSettings();
      const form = document.createElement('form');
      document.body.append(form);
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.remove();
      expect(buildArrives(show)).not.toHaveBeenCalled();
    });
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
