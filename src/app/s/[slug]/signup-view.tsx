import Link from 'next/link';
import type { SignupStatus } from '@/schemas/signups';
import type { SlotStatus } from '@/schemas/slots';
import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import { Banner } from '@/components/banner';
import CommitDialog from './commit-dialog';
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

export type { OwnCommitment, SignupViewField, SignupViewSlot };

interface SourceSlot {
  id: string;
  ref: string;
  values: unknown;
  slotAt: Date | null;
  capacity: number | null;
  status: string;
}

interface SourceField {
  ref: string;
  label: string;
  fieldType: SlotFieldDefinition['fieldType'];
}

export function toSignupViewSlots(
  slots: readonly SourceSlot[],
  committedBySlot?: Record<string, number>,
): SignupViewSlot[] {
  return slots.map((slot) => ({
    id: slot.id,
    ref: slot.ref,
    values: (slot.values as Record<string, unknown>) ?? {},
    slotAt: slot.slotAt ? slot.slotAt.toISOString() : null,
    capacity: slot.capacity,
    status: slot.status as SlotStatus,
    committed: committedBySlot?.[slot.id] ?? 0,
  }));
}

export function toSignupViewFields(fields: readonly SourceField[]): SignupViewField[] {
  return fields.map((f) => ({
    ref: f.ref,
    label: f.label,
    fieldType: f.fieldType,
  }));
}

interface SignupViewProps {
  signup: {
    title: string;
    description: string | null;
    status: SignupStatus;
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
  const order: string[] = [];
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
      order.push(key);
    }
  }
  return order.map((k) => {
    const g = map.get(k);
    if (!g) throw new Error(`group ${k} missing`);
    return g;
  });
}

function titleFor(
  slot: SignupViewSlot,
  primary: SignupViewField | null,
): string {
  const value = primary ? renderFieldValue(primary, slot.values[primary.ref]) : null;
  return value || 'Untitled slot';
}

/**
 * Whether the slot carries a time of its own, which decides whether "Add to
 * calendar" exports a timed or an all-day event. A date-only slot's `slotAt`
 * is a noon-UTC anchor (see `extractSlotAt`), not a time anyone typed.
 *
 * Any time field holding a real HH:MM counts — the same test `slotTimeOfDay`
 * applies on the server, so a blank or malformed legacy value does not turn an
 * all-day export into a timed one. The view carries neither sort orders nor
 * the anchor ref, so it cannot replay the server's pairing rule; the two only
 * disagree on a signup with several time fields of which only some are filled
 * in.
 */
const REAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function slotHasTime(slot: SignupViewSlot, fields: readonly SignupViewField[]): boolean {
  return fields.some((f) => {
    if (f.fieldType !== 'time') return false;
    const value = slot.values[f.ref];
    return typeof value === 'string' && REAL_TIME.test(value);
  });
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

  return (
    <>
      {!showStateBanner ? null : isPreview ? (
        <Banner kind="preview" title="Preview" body={previewCopy} />
      ) : effectiveStatus === 'closed' ? (
        <Banner
          kind="closed"
          title="Closed"
          body="This signup is no longer collecting responses."
        />
      ) : firstOwn ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-surface-sunk bg-success/5 px-4 py-3 text-sm">
          <span>
            <span className="font-medium">You&apos;re signed up</span>
            {ownCount === 1 ? (
              <>
                {' '}for <span className="font-medium text-ink">{firstOwnTitle}</span>.
              </>
            ) : (
              <>
                {' '}for <span className="font-medium text-ink">{ownCount} slots</span>.
              </>
            )}
          </span>
          <Link
            href={firstOwn.editUrl}
            className="shrink-0 font-medium text-brand hover:underline"
          >
            {ownCount === 1 ? 'Edit or cancel' : 'Manage'}
          </Link>
        </div>
      ) : null}

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
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                {group.label}
              </h2>
            ) : null}
            <ul className="overflow-hidden rounded-2xl border border-surface-sunk bg-white">
              {group.slots.map((slot, idx) => {
                const full = slot.capacity !== null && slot.committed >= slot.capacity;
                const closed = slot.status !== 'open' || effectiveStatus !== 'open' || full;
                const title = titleFor(slot, primary);
                const meta = buildMetaSegments({ fields, slot, primaryRef, groupRef });
                const own = ownBySlot.get(slot.id) ?? null;
                const isOwn = own !== null;
                const count = capacityLabel(slot.committed, slot.capacity);
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
                            aria-label={`Edit your signup for ${actionName}`}
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
                            slotHasTime={slotHasTime(slot, fields)}
                            spotsLeft={
                              slot.capacity === null
                                ? null
                                : Math.max(0, slot.capacity - slot.committed)
                            }
                            signupTitle={signup.title}
                            slug={slug}
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
