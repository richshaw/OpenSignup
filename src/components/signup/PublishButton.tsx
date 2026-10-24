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
import { useAnnounce } from './HeaderAnnouncer';
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

/** How long Publish and share stays ringed once a check's fix hands it the focus. */
const RING_MS = 1_600;

interface Publish {
  /** Saving the Build tab's edits, then publishing: a second press does nothing. */
  busy: boolean;
  /**
   * Whether the button shows it's busy: only once it has been for 300 ms, so
   * a check that answers at once flashes no spinner, and then until the
   * press's answer shows (the check's panel, or a refusal). Only when nothing
   * else on screen changes does it stay 400 ms at least, so it never flickers.
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
  // The answer there was when Publish was last pressed: one that differs is
  // that press's own, on screen as its panel or a refusal.
  const [pressedWith, setPressedWith] = useState(result);
  // The answer whose panel was closed, or that was there to begin with. A
  // check Publish answers with opens its panel in the same render as it
  // comes, as the spinner goes, and closing it keeps it closed.
  const [closedOn, setClosedOn] = useState(result);
  const check = result && 'check' in result && result !== closedOn ? result : null;
  const close = () => setClosedOn(result);

  async function publish(anyway = false) {
    close();
    setUnsaved(false);
    setPressedWith(result);
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
  // An answer on screen ends the busy look in the same render, and lets the
  // flag go too (no minimum), so a press soon after waits its 300 ms again.
  const answered = unsaved || result !== pressedWith;
  const showBusy =
    useDelayedFlag(busy, { delay: 300, minVisible: answered ? 0 : 400 }) && !answered;
  // Two buttons read this, so it isn't worth memoizing.
  const value: Publish = {
    busy,
    showBusy,
    unsaved,
    check,
    publish: (anyway) => void publish(anyway),
    closeCheck: close,
    fix: () => {
      close();
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
 *
 * When Done, or Enter, closes the slot a check's fix opened, the one on
 * screen takes the focus, ringed for `RING_MS` so it shows after a click too,
 * and the header says the organizer can publish now; not "Saved", as the
 * slot's last edit may still be on its way. The ring goes early when it's
 * pressed or loses the focus. A held Enter's repeats are ignored: the first
 * brings focus here from the slot, and the next mustn't publish. Other keys'
 * repeats go through, so a held Tab moves on past it; a held Space presses
 * only as it's let go, so its repeats need nothing.
 */
export function PublishButton({ variant }: { variant: 'desktop' | 'phone' }) {
  const { busy, showBusy, check, publish, closeCheck, fix } = useContext(PublishContext);
  const share = useShare();
  const desktop = variant === 'desktop';
  const onScreen = share.desktop === desktop;
  const answer = check !== null && onScreen ? check : null;
  const trigger = useRef<HTMLButtonElement>(null);
  const { onHandBack } = useBuildBridge();
  const say = useAnnounce();
  // Counts hand-backs, so a second one starts the ring's time again; 0 is off.
  const [ring, setRing] = useState(0);

  useEffect(() => {
    if (!onScreen) return;
    return onHandBack(() => {
      trigger.current?.focus();
      setRing((n) => n + 1);
      say('Publish and share when you’re ready.');
    });
  }, [onScreen, onHandBack, say]);
  useEffect(() => {
    if (!ring) return;
    const timer = setTimeout(setRing, RING_MS, 0);
    return () => clearTimeout(timer);
  }, [ring]);

  const button = (
    <button
      ref={trigger}
      type="button"
      onClick={() => {
        setRing(0);
        if (busy) return;
        if (answer) closeCheck();
        else publish();
      }}
      onBlur={() => setRing(0)}
      onKeyDown={(e) => {
        if (e.repeat && e.key === 'Enter') e.preventDefault();
      }}
      aria-haspopup="dialog"
      aria-expanded={answer !== null}
      aria-busy={busy}
      aria-disabled={busy || undefined}
      className={`${desktop ? HEADER_BUTTON : BAR_BUTTON} ${PRIMARY} ${showBusy ? 'cursor-progress brightness-90' : ''} ${ring ? 'outline outline-2 outline-offset-[3px] outline-brand' : ''}`}
    >
      {/* Both labels with their icons, in one cell: the one not shown keeps
          its room unread, so the button is as wide as the wider in any
          language and the header doesn't shift. "Checking…" is true whether
          it ends in the check or a publish, which checks first. */}
      <span className="grid *:flex *:items-center *:justify-center *:gap-2 *:[grid-area:1/1]">
        <span className={showBusy ? 'invisible' : ''} aria-hidden={showBusy || undefined}>
          <Send size={desktop ? 15 : 16} aria-hidden="true" />
          Publish and share
        </span>
        <span className={showBusy ? '' : 'invisible'} aria-hidden={!showBusy || undefined}>
          <Spinner />
          Checking…
        </span>
      </span>
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
