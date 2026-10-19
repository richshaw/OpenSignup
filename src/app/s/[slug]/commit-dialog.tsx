'use client';

import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { suggestEmail } from '@/lib/email-suggest';
import { buildIcs } from '@/lib/ics';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { participantErrorCopy } from './participant-error';
import { Field, NotesAndSpots } from './participant-fields';
import { ACTION_SIZING } from './slot-format';
import { urlBreakSegments } from './url-breaks';

interface CommitDialogProps {
  slotId: string;
  slotTitle: string;
  /** Full disambiguating name for the button; see slotAccessibleName. */
  actionName: string;
  slotAt: string | null;
  /**
   * Whether the slot carries a time of its own: the row's `hasTime`, which the
   * server decides. A date-only slot's `slotAt` is a noon-UTC anchor (see
   * `extractSlotAt`), not a time anyone typed, so its calendar export is an
   * all-day event.
   */
  slotHasTime: boolean;
  /**
   * Places still open on the slot when the page rendered, or `null` when it is
   * unlimited. At 1 the only quantity the server can accept is 1, so the
   * quantity field is left out and the form sends the default; above 1 it is
   * the field's `max`. The server's capacity check stays the authority; this
   * only decides what to ask.
   */
  spotsLeft: number | null;
  /** The slot's capacity, or `null` when unlimited; the sheet's header says
   *  "2 of 4 spots left" from this and `spotsLeft`. */
  capacity: number | null;
  signupTitle: string;
  slug: string;
  /**
   * The signup's `requireEmail` setting when the page rendered. When false the
   * email box is optional, and someone who leaves it blank gets no email, so
   * the success screen tells them to save the link it shows.
   */
  requireEmail: boolean;
  /**
   * Whether someone who gives an email gets a reminder before this slot
   * (`willSendReminder`, decided when the page rendered). The optional email
   * box's help text mentions one only then.
   */
  sendsReminder: boolean;
}

interface ApiError {
  code: string;
  message: string;
  field?: string;
  suggestion?: string;
  details?: {
    alternatives?: { id: string; title: string }[];
    remaining?: number;
    capacity?: number;
    retryAfterSeconds?: number;
  };
}

interface PrefillState {
  name: string;
  email: string;
}

const PREFILL_KEY = 'opensignup:lastCommit';

/**
 * 128 random bits, URL-safe. `getRandomValues` rather than `randomUUID`,
 * which a self-hosted site served over plain HTTP does not have.
 */
function newIdempotencyKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function readPrefill(): PrefillState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PREFILL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PrefillState>;
    if (typeof parsed.name !== 'string' || typeof parsed.email !== 'string') return null;
    return { name: parsed.name, email: parsed.email };
  } catch {
    return null;
  }
}

function writePrefill(value: PrefillState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREFILL_KEY, JSON.stringify(value));
  } catch {
    // ignore quota / private mode
  }
}

export default function CommitDialog({
  slotId,
  slotTitle,
  actionName,
  slotAt,
  slotHasTime,
  spotsLeft,
  capacity,
  signupTitle,
  slug,
  requireEmail,
  sendsReminder,
}: CommitDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [success, setSuccess] = useState<{
    commitmentId: string;
    editUrl: string;
    /** False when they left the email blank, so nothing will send them the link. */
    emailed: boolean;
  } | null>(null);
  const [prefill, setPrefill] = useState<PrefillState | null>(null);
  const [emailValue, setEmailValue] = useState('');
  // The organizer can make the email required again after this page rendered.
  // The server then refuses a blank one, and the box says so from then on.
  const [emailNowRequired, setEmailNowRequired] = useState(false);
  const emailRequired = requireEmail || emailNowRequired;
  const [shareCopied, setShareCopied] = useState(false);
  // What happened to the last Copy link, said in a live region.
  const [copyResult, setCopyResult] = useState<'copied' | 'failed' | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  // What the last Confirm sent, and the idempotency key it went with. Pressing
  // Confirm again with the same details, say after a network error, sends the
  // same key, so if the first press did get the place the server hands that
  // sign-up back rather than making a second. Changed details are a new
  // sign-up, with a new key. Kept when the sheet closes without a sign-up,
  // since the row still says Sign up and it may be opened again for a retry;
  // forgotten once one goes through.
  const lastAttempt = useRef<{ body: string; key: string } | null>(null);

  // Read before the sheet opens, so the form's first render already has the
  // remembered name and the autofocus below can go by it.
  function handleOpen() {
    const stored = readPrefill();
    setPrefill(stored);
    // Where the email is optional the box starts blank, so someone who chose
    // to leave it out does not send a remembered one by accident.
    setEmailValue(requireEmail ? (stored?.email ?? '') : '');
    setOpen(true);
  }

  // The sheet's body scrolls under an 85vh cap, and the alert renders below the
  // fields. A screen reader announces it either way, but on a short viewport a
  // sighted participant would see only the buttons re-enable and no reason why.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [error]);

  /**
   * Autofocus the first field still to be filled, rather than the sheet's close
   * button. Scoped to this dialog's own refs: the document-wide query this
   * replaced would focus whichever `input[name="email"]` came first in the DOM,
   * not necessarily the one on screen.
   */
  function handleOpenAutoFocus(event: Event) {
    const target = prefill?.name ? emailRef.current : nameRef.current;
    // Only take the focus away from Radix if we actually have somewhere to put
    // it. Pre-empting it with nothing to focus would strand the caret on the
    // trigger, which is outside the sheet's focus trap and aria-hidden by then.
    if (!target) return;
    event.preventDefault();
    target.focus();
  }

  const emailHint = useMemo(() => suggestEmail(emailValue), [emailValue]);
  const askQuantity = spotsLeft === null || spotsLeft > 1;
  // The row's own count ("2 left") is behind the sheet, and hidden from
  // assistive tech while it is open, so the header says how many are left.
  // Only on a slot with more than one spot, as the row only counts those:
  // "1 of 1 spots left" would say nothing.
  //
  // After a capacity error the server's numbers are newer than the page's, so
  // the header and the field's max use them; otherwise the header kept saying
  // "2 of 4 spots left" beside an error saying only 1 was. They last until the
  // sheet closes. Not a router.refresh(): a slot that just filled would turn
  // its row to "Full" and take this sheet, error and all, off the page.
  const [reported, setReported] = useState<{ left: number; capacity: number | null } | null>(null);
  const left = reported ? reported.left : spotsLeft;
  const slotCapacity = reported ? reported.capacity : capacity;
  const showSpotsLeft = left !== null && slotCapacity !== null && slotCapacity > 1;
  const spotsLeftId = useId();
  const emailHelpId = useId();

  function handleAcceptSuggestion() {
    if (emailHint) setEmailValue(emailHint);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const data = new FormData(e.currentTarget);
    const name = String(data.get('name') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();
    const body = {
      name,
      // Left out when blank, which only a signup with the email optional takes.
      email: email || undefined,
      notes: String(data.get('notes') ?? '') || undefined,
      // No Spots field when only one place is open (see `spotsLeft`), so 1.
      quantity: Number(data.get('quantity') ?? 1),
    };
    const sent = JSON.stringify(body);
    if (lastAttempt.current?.body !== sent) {
      lastAttempt.current = { body: sent, key: newIdempotencyKey() };
    }
    const idempotencyKey = lastAttempt.current.key;
    try {
      const res = await fetch(`/api/slots/${slotId}/commitments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, idempotencyKey }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? { code: 'internal', message: 'something went wrong' });
        // A blank email is refused only because the signup now requires one.
        if (!email && payload.error?.code === 'invalid_input' && payload.error.field === 'email') {
          setEmailNowRequired(true);
        }
        const remaining = payload.error?.details?.remaining;
        if (payload.error?.code === 'capacity_full' && typeof remaining === 'number') {
          const reportedCapacity = payload.error.details?.capacity;
          setReported({
            left: remaining,
            capacity: typeof reportedCapacity === 'number' ? reportedCapacity : capacity,
          });
        }
        return;
      }
      // A blank email keeps the one remembered from an earlier sign-up.
      writePrefill({ name, email: email || (readPrefill()?.email ?? '') });
      setSuccess({
        commitmentId: payload.data.commitment.id,
        editUrl: payload.data.editUrl,
        emailed: email !== '',
      });
      // Don't refresh server state yet — that would re-render the parent and
      // replace this dialog (slot row swaps to "Edit" once cookie is read),
      // dismissing the success view with its calendar/share affordances.
      // Refresh on close instead.
    } catch {
      setError({ code: 'internal', message: 'network error' });
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    const wasSuccess = success !== null;
    setOpen(false);
    setSuccess(null);
    setError(null);
    setReported(null);
    if (wasSuccess) lastAttempt.current = null;
    setShareCopied(false);
    setCopyResult(null);
    if (wasSuccess) router.refresh();
  }

  function handleDownloadIcs() {
    if (!slotAt || !success) return;
    const start = new Date(slotAt);
    const ics = buildIcs({
      uid: `${success.commitmentId}@opensignup.org`,
      title: `${signupTitle} — ${slotTitle}`,
      description: `Edit or cancel: ${success.editUrl}`,
      url: success.editUrl,
      start,
      allDay: !slotHasTime,
    });
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}-${slotTitle}.ics`.replace(/[^A-Za-z0-9._-]+/g, '-');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function handleShare() {
    if (!success) return;
    const shareData = {
      title: signupTitle,
      text: `I'm signed up for "${slotTitle}".`,
      url: success.editUrl,
    };
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (typeof nav.share === 'function') {
      try {
        await nav.share(shareData);
        return;
      } catch {
        // user cancelled or share failed; fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(success.editUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // last resort: do nothing — link is already on screen
    }
  }

  // Someone without an email gets Copy link, not Share link: the link is how
  // they change or cancel, and a share sheet invites them to post it.
  async function handleCopy() {
    if (!success) return;
    try {
      await navigator.clipboard.writeText(success.editUrl);
      setCopyResult('copied');
      // Back to Copy link, as Share link does, unless a failure replaced it.
      setTimeout(() => setCopyResult((r) => (r === 'copied' ? null : r)), 2000);
    } catch {
      // No clipboard over plain HTTP, or the browser refused.
      setCopyResult('failed');
    }
  }

  // A capacity error gets participant-facing copy built from its numbers, and
  // a slot or signup closed or removed while this page was open, a second
  // sign-up by the same email and a rate limit each get their own; any other
  // error keeps the server's own message and suggestion.
  const errorText = error ? (participantErrorCopy(error, 'join') ?? error) : null;
  // Share link and Copy link each say "Link copied" on themselves after a copy.
  const linkCopied = success?.emailed ? shareCopied : copyResult === 'copied';

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        // Every row's button reads "Sign up", so without this a screen-reader
        // user swiping the list hears the same name N times with no way to tell
        // which slot they are committing to.
        aria-label={`Sign up for ${actionName}`}
        className={`${ACTION_SIZING} bg-brand font-medium text-white transition hover:brightness-110`}
      >
        Sign up
      </button>
      {/* The shared sheet, not a hand-rolled overlay: it locks body scroll, so
          the list no longer scrolls away under the sheet on a phone, and it
          brings Escape, a focus trap and hiding the rest of the page from
          assistive tech with it. The slot name is the sheet's title, so
          neither branch below repeats it as a heading. */}
      <BottomSheet
        open={open}
        // Backdrop tap and Escape arrive here too, so an in-flight submit is
        // the one thing that holds the sheet open: dismissing mid-POST would
        // leave the participant unsure whether they got the spot.
        onClose={() => {
          if (!submitting) handleClose();
        }}
        busy={submitting}
        onOpenAutoFocus={handleOpenAutoFocus}
        // On screen the heading is the slot's own name, which is what the
        // participant just tapped. The name the dialog is *announced* by is the
        // disambiguated one the trigger uses, because "Cookies" alone repeats
        // across every date of a grouped signup, and says nothing about what
        // the sheet is for.
        title={
          success ? (
            "You're in."
          ) : (
            <>
              <span className="sr-only">Sign up for {actionName}</span>
              <span aria-hidden="true">{slotTitle}</span>
            </>
          )
        }
        description={
          !success && showSpotsLeft ? `${left} of ${slotCapacity} spots left` : undefined
        }
        descriptionId={spotsLeftId}
      >
        {success ? (
          <div className="space-y-4">
            <p className="text-ink-muted text-sm">
              We&apos;ve saved your spot for <strong className="text-ink">{slotTitle}</strong>.{' '}
              {success.emailed ? (
                'Bookmark this link to edit or cancel later:'
              ) : (
                <>
                  <strong className="text-ink">
                    Save this link now: we won&apos;t email it, and only this browser remembers it.
                  </strong>
                  {/* The calendar event carries the link: see handleDownloadIcs. */}
                  {slotAt ? ' Add to calendar saves the link too.' : null}
                </>
              )}
            </p>
            <a
              href={success.editUrl}
              className="block break-words rounded-lg bg-surface-raised px-3 py-2 font-mono text-xs"
            >
              {/* Breaks only between these pieces, except inside a token too
                  long for one line, which break-words still wraps. */}
              {urlBreakSegments(success.editUrl).map((piece, i) => (
                <Fragment key={i}>
                  {i > 0 ? <wbr /> : null}
                  {piece}
                </Fragment>
              ))}
            </a>
            <div>
              <div className="flex flex-wrap gap-2">
                {slotAt ? (
                  <button
                    type="button"
                    onClick={handleDownloadIcs}
                    className="flex-1 rounded-lg border border-surface-sunk px-3 py-2 text-sm font-medium transition hover:bg-surface-raised"
                  >
                    Add to calendar
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={success.emailed ? handleShare : handleCopy}
                  className="flex-1 rounded-lg border border-surface-sunk px-3 py-2 text-sm font-medium transition hover:bg-surface-raised"
                >
                  {linkCopied ? 'Link copied' : success.emailed ? 'Share link' : 'Copy link'}
                </button>
              </div>
              {success.emailed ? null : (
                // In the page from the start, so a screen reader hears it
                // change. Not display:none while empty, which would stop that.
                // A copy shows on the button itself, so only the failure, which
                // says what to do next, shows here on screen.
                <p
                  role="status"
                  className={copyResult === 'failed' ? 'mt-2 text-sm text-ink-muted' : 'sr-only'}
                >
                  {copyResult === 'copied'
                    ? 'Link copied.'
                    : copyResult === 'failed'
                      ? "Couldn't copy it. Select the link above and copy it yourself."
                      : null}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="bg-brand w-full rounded-lg px-4 py-3 text-sm font-medium text-white"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field
              label="Your name"
              inputRef={nameRef}
              type="text"
              name="name"
              required
              minLength={1}
              autoComplete="name"
              defaultValue={prefill?.name ?? ''}
            />
            {/* The help text sits outside the label so that it describes the
                box rather than becoming part of its name. */}
            <div>
              <Field
                label={emailRequired ? 'Email' : 'Email (optional)'}
                inputRef={emailRef}
                type="email"
                name="email"
                required={emailRequired}
                aria-describedby={emailRequired ? undefined : emailHelpId}
                autoComplete="email"
                inputMode="email"
                value={emailValue}
                onChange={(e) => setEmailValue(e.target.value)}
              >
                {emailHint ? (
                  <p className="text-ink-muted mt-1 text-xs">
                    Did you mean{' '}
                    <button
                      type="button"
                      onClick={handleAcceptSuggestion}
                      className="text-brand font-medium underline"
                    >
                      {emailHint}
                    </button>
                    ?
                  </p>
                ) : null}
              </Field>
              {emailRequired ? null : (
                <p id={emailHelpId} className="text-ink-muted mt-1 text-xs">
                  We&apos;ll email you your link to change or cancel
                  {sendsReminder ? ', and a reminder before your slot' : null}. Without an email,
                  save the link we show you after you sign up.
                </p>
              )}
            </div>
            <NotesAndSpots
              notes={{ placeholder: 'Allergies, preferences, etc.' }}
              spots={
                askQuantity
                  ? {
                      // Stops an over-ask before it reaches the server. The
                      // count can be stale, so the server's check still
                      // decides. At least 1: once the slot has filled, a max
                      // of 0 would only add a browser bubble to the error
                      // already shown.
                      max: left === null ? undefined : Math.max(left, 1),
                      defaultValue: 1,
                      describedBy: showSpotsLeft ? spotsLeftId : undefined,
                    }
                  : undefined
              }
            />
            {error ? (
              <div
                ref={errorRef}
                role="alert"
                className="rounded-lg bg-danger/10 p-3 text-sm text-danger"
              >
                <p className="font-medium">{errorText?.message}</p>
                {errorText?.suggestion ? <p className="text-xs">{errorText.suggestion}</p> : null}
                {error.details?.alternatives?.length && error.details.remaining === 0 ? (
                  <div className="mt-2 space-y-1 text-xs">
                    <a
                      href={`/s/${slug}`}
                      className="inline-block rounded bg-white px-2 py-1 underline"
                    >
                      See alternatives
                    </a>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="flex-1 rounded-lg border border-surface-sunk px-4 py-3 text-sm font-medium transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="bg-brand flex-1 rounded-lg px-4 py-3 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {submitting ? 'Signing up…' : 'Confirm'}
              </button>
            </div>
          </form>
        )}
      </BottomSheet>
    </>
  );
}
