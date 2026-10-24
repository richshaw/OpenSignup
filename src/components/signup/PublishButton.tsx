'use client';

import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Send } from 'lucide-react';
import { loadSharePanel } from '@/components/share/load-share-panel';
import { Spinner } from '@/components/ui/spinner';
import { useDelayedFlag } from '@/hooks/useDelayedFlag';
import type { PublishCheckAnswer } from '@/lib/publish-check';
import { useBuildBridge } from './BuildBridge';
import { BAR_BUTTON, HEADER_BUTTON, PRIMARY } from './header-buttons';
import { PublishCheckPanel } from './PublishCheckPanel';
import { useShare } from './ShareScope';
import {
  StatusActionRefusal,
  useStatusActionDispatch,
  useStatusActionPending,
  useStatusActionState,
} from './StatusActionForm';

/** How long Publish waits for the Build tab's saves before it goes on. */
const SAVE_WAIT_MS = 10_000;

interface Publish {
  /** Saving the Build tab's edits, then publishing: a second press does nothing. */
  busy: boolean;
  /**
   * Whether the button shows it's busy: only once it has been for 300 ms, and
   * then for 400 ms at least, so a check that answers at once flashes no
   * spinner, and one just slower doesn't flicker.
   */
  showBusy: boolean;
  /** One of the Build tab's saves failed, so Publish stopped there. */
  unsaved: boolean;
  /** What Publish's check found, while its panel is open. */
  check: PublishCheckAnswer | null;
  /** `anyway`: the organizer chose Publish anyway, past a warning. */
  publish: (anyway?: boolean) => void;
  closeCheck: () => void;
  /** Opens the slot the check is about, on the Build tab; false when it can't. */
  fix: () => boolean;
}

// Always provided: ShareScope puts PublishState round both headers.
const PublishContext = createContext<Publish>(null as unknown as Publish);

/**
 * Publish and share, for both headers, inside `ShareScope`'s action scope.
 * Pressing it starts loading the share panel, waits for the Build tab's
 * edits to save, then runs Publish, whose check reads the signup as stored.
 * A save that failed stops it there, with a line saying so, so the share
 * panel never covers the save's error. A save that never answers holds it up
 * for `SAVE_WAIT_MS` at most; then it goes on, and the check reads what's
 * stored. A check Publish answers with opens its panel, by the button that
 * was pressed; the header's live region says nothing, since the panel's name
 * and text say it as it opens.
 */
export function PublishState({ children }: { children: ReactNode }) {
  const result = useStatusActionState();
  const dispatch = useStatusActionDispatch();
  const pending = useStatusActionPending();
  const build = useBuildBridge();
  const [saving, setSaving] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  const [open, setOpen] = useState(false);

  // Each answer opens the panel, or not, once; closing it keeps it closed.
  const handled = useRef(result);
  useEffect(() => {
    if (result === handled.current) return;
    handled.current = result;
    setOpen(result !== null && 'check' in result);
  }, [result]);
  const check = open && result && 'check' in result ? result : null;

  async function publish(anyway = false) {
    setOpen(false);
    setUnsaved(false);
    void loadSharePanel();
    setSaving(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const saved = await Promise.race([
      build.flushPendingSaves(),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(resolve, SAVE_WAIT_MS, true);
      }),
    ]);
    clearTimeout(timer);
    setSaving(false);
    if (!saved) {
      setUnsaved(true);
      return;
    }
    const form = new FormData();
    if (anyway) form.set('acknowledge', 'placeholder');
    startTransition(() => dispatch?.(form));
  }

  const busy = saving || pending;
  const showBusy = useDelayedFlag(busy, { delay: 300, minVisible: 400 });
  // Two buttons read this, so it isn't worth memoizing.
  const value: Publish = {
    busy,
    showBusy,
    unsaved,
    check,
    publish: (anyway) => void publish(anyway),
    closeCheck: () => setOpen(false),
    fix: () => {
      setOpen(false);
      const target = check?.target;
      return target ? build.openSlot(target.slotId, target.fieldRef) : false;
    },
  };
  return <PublishContext.Provider value={value}>{children}</PublishContext.Provider>;
}

/**
 * Why Publish didn't publish, in the place a draft's header keeps for it: a
 * change in Build that didn't save, or what the action refused.
 */
export function PublishRefusal({ className }: { className?: string }) {
  const { unsaved } = useContext(PublishContext);
  return (
    <StatusActionRefusal
      className={className}
      {...(unsaved ? { message: 'A change didn’t save. Fix it, then publish.' } : {})}
    />
  );
}

/**
 * A draft's Publish and share: in a computer's header, or filling a phone's
 * bar at the bottom of the screen. The check's panel opens from it (see
 * `PublishCheckPanel`); pressing this again closes the popover.
 */
export function PublishButton({ variant }: { variant: 'desktop' | 'phone' }) {
  const { busy, showBusy, check, publish, closeCheck, fix } = useContext(PublishContext);
  const share = useShare();
  const desktop = variant === 'desktop';
  const answer = check !== null && share.desktop === desktop ? check : null;
  const trigger = useRef<HTMLButtonElement>(null);

  const button = (
    <button
      ref={trigger}
      type="button"
      onClick={() => {
        if (busy) return;
        if (answer) closeCheck();
        else publish();
      }}
      aria-haspopup="dialog"
      aria-expanded={answer !== null}
      aria-busy={busy}
      aria-disabled={busy || undefined}
      className={`${desktop ? HEADER_BUTTON : BAR_BUTTON} ${PRIMARY} ${showBusy ? 'cursor-progress brightness-90' : ''}`}
    >
      {showBusy ? <Spinner /> : <Send size={desktop ? 15 : 16} aria-hidden="true" />}
      {/* True whether it ends in the check or a publish, which checks first. */}
      {showBusy ? 'Checking…' : 'Publish and share'}
    </button>
  );

  const panel = (
    <PublishCheckPanel
      variant={variant}
      answer={answer}
      triggerRef={trigger}
      onClose={closeCheck}
      onFix={fix}
      onSecondary={() => (answer?.copy.blocking ? closeCheck() : publish(true))}
    />
  );

  return desktop ? (
    <div className="relative">
      {button}
      {panel}
    </div>
  ) : (
    <>
      {button}
      {panel}
    </>
  );
}
