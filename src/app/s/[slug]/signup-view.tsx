import Link from 'next/link';
import { willSendReminder } from '@/lib/reminder-eligibility';
import { shownSignupStatus } from '@/lib/signup-closing';
import { requiresEmail, sendsReminders, type SignupStatus } from '@/schemas/signups';
import { Banner } from '@/components/banner';
import CommitDialog from './commit-dialog';
import { toSignupViewSlots } from './public-signup';
import {
  ACTION_SIZING,
  buildMetaSegments,
  capacityLabel,
  slotAccessibleName,
  formatGroupLabel,
  pickPrimaryField,
  renderFieldValue,
} from './slot-format';
import type {
  OwnCommitment,
  SignupViewField,
  SignupViewSlot,
} from './signup-view-types';

export type { SignupViewField, SignupViewSlot };

/**
 * The live page's view of the signup itself. Past its closing time an open
 * signup takes no sign-ups (`signupShutReason`), so it shows as closed: the
 * Closed banner, and Closed on every slot.
 */
export function toSignupViewSignup(
  signup: {
    title: string;
    description: string | null;
    status: string;
    closesAt: Date | null;
    settings: unknown;
  },
  now: number = Date.now(),
): SignupViewProps['signup'] {
  return {
    title: signup.title,
    description: signup.description,
    status: shownSignupStatus(signup, now) as SignupStatus,
    requireEmail: requiresEmail(signup.settings),
    sendReminders: sendsReminders(signup.settings),
  };
}

/**
 * Everything the page needs from a signup as a service loads it: the live
 * page passes its sign-up counts, the organizer's preview has none. A field
 * definition already fits `SignupViewField`, so the fields go as they are.
 */
export function toSignupViewProps(
  signup: Parameters<typeof toSignupViewSlots>[0] &
    Parameters<typeof toSignupViewSignup>[0] & { slug: string },
  committedBySlot?: Record<string, number>,
): Pick<SignupViewProps, 'signup' | 'fields' | 'groupByRef' | 'slots' | 'slug'> {
  const settings = (signup.settings ?? {}) as { groupByFieldRefs?: string[] };
  return {
    signup: toSignupViewSignup(signup),
    fields: signup.fields,
    groupByRef: settings.groupByFieldRefs?.[0] ?? null,
    slots: toSignupViewSlots(signup, committedBySlot),
    slug: signup.slug,
  };
}

interface SignupViewProps {
  signup: {
    title: string;
    description: string | null;
    status: SignupStatus;
    /** Whether the sign-up form asks for the email; true when left out. Only
     *  the live page's form reads it. */
    requireEmail?: boolean;
    /** The signup's `sendReminders` setting; false when left out, so nothing
     *  promises a reminder. Only the live page's form reads it. */
    sendReminders?: boolean;
  };
  fields: SignupViewField[];
  groupByRef: string | null;
  slots: SignupViewSlot[];
  slug: string;
  /**
   * - 'live': real signup, real CommitDialog.
   * - 'preview': organizer-only preview (Build tab); Sign-up button is
   *   disabled and the preview banner explains why.
   * - 'showcase': marketing/example use (homepage); Sign-up button is rendered
   *   as an inert solid-blue span so the card matches a published signup
   *   visually. The wrapping context must convey that it's not real.
   */
  mode: 'live' | 'preview' | 'showcase';
  ownCommitments?: OwnCommitment[];
  /** Show the preview/closed status banner. Default true; set false when the
   *  surrounding context already conveys preview state (e.g. the build rail). */
  showStateBanner?: boolean;
}

interface SlotGroup {
  key: string;
  label: string;
  slots: SignupViewSlot[];
}

function groupSlots(
  slots: SignupViewSlot[],
  groupField: SignupViewField | null,
): SlotGroup[] {
  if (!groupField) return [{ key: '__all__', label: '', slots }];
  // A Map keeps its keys in the order they were first set, so the groups come
  // out in the order of their first slot.
  const map = new Map<string, SlotGroup>();
  for (const slot of slots) {
    const raw = slot.values[groupField.ref];
    const isUnset = raw === undefined || raw === null || raw === '';
    const key = isUnset ? '__unset__' : String(raw);
    const label = formatGroupLabel(groupField, raw);
    const existing = map.get(key);
    if (existing) {
      existing.slots.push(slot);
    } else {
      map.set(key, { key, label, slots: [slot] });
    }
  }
  return [...map.values()];
}

function titleFor(
  slot: SignupViewSlot,
  primary: SignupViewField | null,
): string {
  const value = primary ? renderFieldValue(primary, slot.values[primary.ref]) : null;
  return value || 'Untitled slot';
}

export function SignupViewBody({
  signup,
  fields,
  groupByRef,
  slots,
  slug,
  mode,
  ownCommitments,
  showStateBanner = true,
}: SignupViewProps) {
  const isPreview = mode === 'preview';
  const effectiveStatus =
    isPreview && signup.status === 'draft' ? 'open' : signup.status;
  const groupField =
    groupByRef ? fields.find((f) => f.ref === groupByRef) ?? null : null;
  const groupRef = groupField?.ref ?? null;
  const primary = pickPrimaryField(fields, groupRef);
  const primaryRef = primary?.ref;
  const groups = groupSlots(slots, groupField);
  const ownBySlot = new Map((ownCommitments ?? []).map((c) => [c.slotId, c]));
  const firstOwn = ownCommitments?.[0] ?? null;
  const ownCount = ownCommitments?.length ?? 0;
  const firstOwnSlot = firstOwn ? slots.find((s) => s.id === firstOwn.slotId) ?? null : null;
  const firstOwnTitle = firstOwnSlot ? titleFor(firstOwnSlot, primary) : '';
  const Title = mode === 'showcase' ? 'h2' : 'h1';

  const previewCopy =
    signup.status === 'draft'
      ? 'This is what people will see once you publish. No signups will be saved.'
      : signup.status === 'closed'
        ? 'This signup is closed. The page below shows what visitors see.'
        : signup.status === 'archived'
          ? 'This signup is archived and is not visible to participants.'
          : 'This signup is live. The page below shows what visitors see.';

  // Closing only stops new sign-ups: everyone keeps their place and can still
  // change or cancel it, so a returning participant sees this bar under the
  // Closed banner too.
  const signedUpBar = firstOwn ? (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-surface-sunk bg-success/5 px-4 py-3 text-sm">
      <span>
        <span className="font-medium">You&apos;re signed up</span> for{' '}
        <span className="font-medium text-ink">
          {ownCount === 1 ? firstOwnTitle : `${ownCount} slots`}
        </span>
        .
      </span>
      <Link
        href={firstOwn.editUrl}
        className="shrink-0 font-medium text-brand hover:underline"
      >
        {ownCount === 1 ? 'Edit or cancel' : 'Manage'}
      </Link>
    </div>
  ) : null;

  return (
    <>
      {!showStateBanner ? null : isPreview ? (
        <Banner kind="preview" title="Preview" body={previewCopy} />
      ) : effectiveStatus === 'closed' ? (
        <>
          <Banner
            kind="closed"
            title="Closed"
            body={
              firstOwn
                ? `No one new can sign up, but your ${ownCount === 1 ? 'spot is' : 'spots are'} still yours.`
                : 'This signup is no longer collecting responses.'
            }
          />
          {signedUpBar}
        </>
      ) : (
        signedUpBar
      )}

      <header className="space-y-2">
        {/* On /s/[slug] this title *is* the page heading, so it's an h1. In
            'showcase' mode the card is embedded in a page that already has its
            own h1 (the marketing headline), and a second h1 is an SEO defect —
            demote to h2 there. Styling is identical either way. */}
        <Title className="text-3xl font-semibold tracking-tight">{signup.title}</Title>
        {signup.description ? (
          <p className="text-ink-muted whitespace-pre-line">{signup.description}</p>
        ) : null}
      </header>

      <div className="flex flex-col gap-7">
        {groups.map((group) => (
          <section key={group.key} className="flex flex-col gap-2.5">
            {groupField ? (
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                {group.label}
              </h2>
            ) : null}
            <ul className="overflow-hidden rounded-2xl border border-surface-sunk bg-white">
              {group.slots.map((slot, idx) => {
                // Floored at 0: the organizer can lower a slot's capacity below
                // its sign-ups.
                const spotsLeft =
                  slot.capacity === null ? null : Math.max(0, slot.capacity - slot.committed);
                const full = spotsLeft === 0;
                const closed = slot.status !== 'open' || effectiveStatus !== 'open' || full;
                const title = titleFor(slot, primary);
                const meta = buildMetaSegments({ fields, slot, primaryRef, groupRef });
                const own = ownBySlot.get(slot.id) ?? null;
                const isOwn = own !== null;
                // A closed row says "Closed" (or "Full"), and "2 left" beside it
                // would offer spots nobody can take.
                const count = closed
                  ? { text: '', sr: null }
                  : capacityLabel(slot.committed, slot.capacity);
                const actionName = slotAccessibleName(group.label || null, title, meta);
                return (
                  <li
                    key={slot.id}
                    className={`flex items-center justify-between gap-3 px-3 py-2.5 sm:gap-4 sm:px-[18px] sm:py-3 ${
                      idx > 0 ? 'border-t border-surface-sunk' : ''
                    } ${isOwn ? 'bg-success/5' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium tracking-tight">
                        {title}
                      </p>
                      {meta.length ? (
                        // Wrapped, not `truncate`. The fixed right rail left
                        // ~160px for text at 390px, so one clamped line dropped
                        // the last segment — usually the location — from every
                        // row. The title above stays single-line.
                        //
                        // Three lines below `sm`, because a row that also shows
                        // a count has a third column competing for a 360px
                        // screen and two lines still clipped the location. This
                        // is a ceiling, not a height: short meta still wraps to
                        // one line.
                        <p className="line-clamp-3 text-sm text-ink-muted sm:line-clamp-2">
                          {meta.join(' · ')}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {count.text ? (
                        // `min-w`, not `w`: a fixed 36px column clipped "10/12".
                        <span className="min-w-9 text-right text-sm tabular-nums text-ink-muted">
                          <span aria-hidden="true">{count.text}</span>
                          <span className="sr-only">{count.sr}</span>
                        </span>
                      ) : null}
                      <div className="flex">
                        {own ? (
                          <Link
                            href={own.editUrl}
                            aria-label={`Edit your spot for ${actionName}`}
                            className={`${ACTION_SIZING} border border-surface-sunk bg-white font-medium transition hover:bg-surface-raised`}
                          >
                            Edit
                          </Link>
                        ) : closed ? (
                          <span className={`${ACTION_SIZING} font-medium text-ink-soft`}>
                            {full ? 'Full' : 'Closed'}
                          </span>
                        ) : isPreview ? (
                          <button
                            type="button"
                            disabled
                            title="Preview: publish to enable signups"
                            aria-label={`Sign up for ${actionName}`}
                            className={`${ACTION_SIZING} cursor-not-allowed bg-brand font-medium text-white opacity-60`}
                          >
                            Sign up
                          </button>
                        ) : mode === 'showcase' ? (
                          <span
                            className={`${ACTION_SIZING} bg-brand font-medium text-white`}
                          >
                            Sign up
                          </span>
                        ) : (
                          <CommitDialog
                            slotId={slot.id}
                            slotTitle={title}
                            actionName={actionName}
                            slotAt={slot.slotAt}
                            slotHasTime={slot.hasTime}
                            spotsLeft={spotsLeft}
                            capacity={slot.capacity}
                            signupTitle={signup.title}
                            slug={slug}
                            requireEmail={signup.requireEmail ?? true}
                            sendsReminder={willSendReminder({
                              sendReminders: signup.sendReminders ?? false,
                              slotAt: slot.slotAt ? new Date(slot.slotAt) : null,
                            })}
                          />
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

export default function SignupView(props: SignupViewProps) {
  return (
    <div className="container-tight flex flex-col gap-7">
      <SignupViewBody {...props} />
    </div>
  );
}
