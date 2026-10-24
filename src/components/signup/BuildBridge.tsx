'use client';

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

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
   * Has `focus` run when the editor a check's fix opened closes with Done;
   * the function it returns stops that. Publish and share sets it while it's
   * the one on screen.
   */
  onHandBack: (focus: () => void) => () => void;
}

interface Bridge extends HeaderBridge {
  /** The Build tab, as it mounts; the function it returns takes it off again. */
  register: (tab: BuildTab) => () => void;
  /** The Build tab: Done has closed the editor a check's fix opened. */
  handBack: () => void;
}

const NO_BUILD_TAB: Bridge = {
  register: () => () => {},
  flushPendingSaves: async () => true,
  openSlot: () => false,
  onHandBack: () => () => {},
  handBack: () => {},
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
 * again. A Build tab that goes away leaves its last saves behind: the edits
 * it sent as it went may still be on their way, so the next Publish waits
 * for those too. And once the organizer has fixed the slot, Done hands focus
 * back to Publish and share, through here.
 */
export function BuildBridge({ buildHref, children }: { buildHref: string; children: ReactNode }) {
  const tab = useRef<BuildTab | null>(null);
  const pending = useRef<[string | null, string | null] | null>(null);
  const leaving = useRef(SAVED);
  const focusPublish = useRef<(() => void) | null>(null);
  const router = useRouter();
  const bridge = useMemo<Bridge>(
    () => ({
      register: (next) => {
        tab.current = next;
        const request = pending.current;
        pending.current = null;
        if (request) next.openSlot(...request);
        return () => {
          if (tab.current === next) tab.current = null;
          const left = Promise.all([leaving.current, next.flushPendingSaves()]);
          leaving.current = left.then((saved) => saved.every(Boolean));
        };
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
      handBack: () => focusPublish.current?.(),
    }),
    [buildHref, router],
  );
  return <BridgeContext.Provider value={bridge}>{children}</BridgeContext.Provider>;
}

/** The header's way to the Build tab; does nothing outside a `BuildBridge`. */
export function useBuildBridge(): HeaderBridge {
  return useContext(BridgeContext);
}

/**
 * Makes `tab` the Build tab the header reaches, while the caller is mounted,
 * and returns what it calls when Done closes the editor a check's fix opened.
 */
export function useRegisterBuildTab(tab: BuildTab): () => void {
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
