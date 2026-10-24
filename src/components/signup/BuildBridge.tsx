'use client';

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/** What the Build tab lets the header do while it's showing. */
interface BuildTab {
  /**
   * Sends every edit still waiting to save, and resolves once none is
   * waiting or in flight, to whether they all saved.
   */
  flushPendingSaves: () => Promise<boolean>;
  /**
   * Opens a slot's editor, with focus in `fieldRef` (the first field when
   * null), and says whether it could: not a slot it hasn't loaded. A null
   * slot adds one and opens that.
   */
  openSlot: (slotId: string | null, fieldRef: string | null) => boolean;
}

/** What the header reaches the Build tab with. */
interface HeaderBridge extends BuildTab {
  /**
   * Has `focus` run when the editor a check's fix opened closes with Done or
   * Enter; the function it returns stops that. Publish and share sets it
   * while it's the one on screen.
   */
  onHandBack: (focus: () => void) => () => void;
}

interface Bridge extends HeaderBridge {
  /** The Build tab, as it mounts; the function it returns takes it off again. */
  register: (tab: BuildTab) => () => void;
  /**
   * The Build tab: the editor a check's fix opened is closing. Says whether
   * Publish and share took the focus: not once the signup is published.
   */
  handBack: () => boolean;
  /** Forgets a slot a fix asked Build to open: the organizer went elsewhere. */
  dropPending: () => void;
}

const NO_BUILD_TAB: Bridge = {
  register: () => () => {},
  dropPending: () => {},
  flushPendingSaves: async () => true,
  openSlot: () => false,
  onHandBack: () => () => {},
  handBack: () => false,
};

const BridgeContext = createContext<Bridge>(NO_BUILD_TAB);

const SAVED = Promise.resolve(true);

/**
 * Lets the signup header reach the Build tab, from whichever tab is showing.
 * Publish first saves what the organizer has typed in Build, so the check
 * and the publish see it, and a check's fix opens the slot it's about.
 *
 * On another tab the fix goes to Build and leaves the slot to open here,
 * which the Build tab takes once, as it mounts. It's never in the address,
 * so going Back and Forward, or a bookmark, can't open it, or add a slot,
 * again. Until Build takes it, it's dropped, so a later visit to Build
 * doesn't add an empty slot, when the organizer does anything else first:
 * the path settles on a page that isn't Build; they choose a tab that isn't
 * Build with a plain primary click, the one they're on included (`TabsNav`
 * calls `dropPending`; a Ctrl, Cmd, Shift or Alt click, or a middle click,
 * doesn't navigate this window and keeps it); they go Back or Forward; or
 * they submit a form, such as Settings' Save, which comes back to the same
 * page. A Build tab that goes
 * away leaves its last saves behind: the edits it sent as it went may still
 * be on their way, so the next Publish waits for those too. Whether they
 * saved counts only until a Build tab shows again, whose own saves are then
 * what matter. And once the organizer has fixed the slot, Done hands focus
 * back to Publish and share, through here.
 */
export function BuildBridge({ buildHref, children }: { buildHref: string; children: ReactNode }) {
  const tab = useRef<BuildTab | null>(null);
  const pending = useRef<[string | null, string | null] | null>(null);
  const leaving = useRef(SAVED);
  const focusPublish = useRef<(() => void) | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (pathname !== buildHref) pending.current = null;
  }, [pathname, buildHref]);
  useEffect(() => {
    const drop = () => {
      pending.current = null;
    };
    window.addEventListener('popstate', drop);
    document.addEventListener('submit', drop, true);
    return () => {
      window.removeEventListener('popstate', drop);
      document.removeEventListener('submit', drop, true);
    };
  }, []);
  const bridge = useMemo<Bridge>(
    () => ({
      register: (next) => {
        tab.current = next;
        leaving.current = leaving.current.then(() => true);
        const request = pending.current;
        pending.current = null;
        if (request) next.openSlot(...request);
        return () => {
          if (tab.current === next) tab.current = null;
          const left = Promise.all([leaving.current, next.flushPendingSaves()]);
          leaving.current = left.then((saved) => saved.every(Boolean));
        };
      },
      dropPending: () => {
        pending.current = null;
      },
      flushPendingSaves: async () => {
        const left = leaving.current;
        const saved = await Promise.all([left, tab.current?.flushPendingSaves() ?? true]);
        if (leaving.current === left) leaving.current = SAVED;
        return saved.every(Boolean);
      },
      openSlot: (slotId, fieldRef) => {
        if (tab.current) return tab.current.openSlot(slotId, fieldRef);
        pending.current = [slotId, fieldRef];
        router.push(buildHref);
        return true;
      },
      onHandBack: (focus) => {
        focusPublish.current = focus;
        return () => {
          if (focusPublish.current === focus) focusPublish.current = null;
        };
      },
      handBack: () => {
        const focus = focusPublish.current;
        focus?.();
        return focus !== null;
      },
    }),
    [buildHref, router],
  );
  return <BridgeContext.Provider value={bridge}>{children}</BridgeContext.Provider>;
}

/** The header's way to the Build tab; does nothing outside a `BuildBridge`. */
export function useBuildBridge(): HeaderBridge {
  return useContext(BridgeContext);
}

/** Forgets a pending fix, for a tab the organizer chooses that isn't Build. */
export function useDropPendingFix(): () => void {
  return useContext(BridgeContext).dropPending;
}

/**
 * Makes `tab` the Build tab the header reaches, while the caller is mounted,
 * and returns what it calls when the editor a check's fix opened closes, which
 * says whether Publish and share took the focus.
 */
export function useRegisterBuildTab(tab: BuildTab): () => boolean {
  const { register, handBack } = useContext(BridgeContext);
  const latest = useRef(tab);
  useEffect(() => {
    latest.current = tab;
  });
  useEffect(
    () =>
      register({
        flushPendingSaves: () => latest.current.flushPendingSaves(),
        openSlot: (slotId, fieldRef) => latest.current.openSlot(slotId, fieldRef),
      }),
    [register],
  );
  return handBack;
}
