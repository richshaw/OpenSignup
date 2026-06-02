import Link from 'next/link';
import type { SignupStatus } from '@/schemas/signups';
import type { SlotStatus } from '@/schemas/slots';
import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import { Banner } from '@/components/banner';
import CommitDialog from './commit-dialog';
import {
  buildMetaSegments,
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
        <h1 className="text-3xl font-semibold tracking-tight">{signup.title}</h1>
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
                return (
                  <li
                    key={slot.id}
                    className={`flex items-center justify-between gap-4 px-[18px] py-3 ${
                      idx > 0 ? 'border-t border-surface-sunk' : ''
                    } ${isOwn ? 'bg-success/5' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium tracking-tight">
                        {title}
                      </p>
                      {meta.length ? (
                        <p className="truncate text-sm text-ink-muted">
                          {meta.join(' · ')}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="w-9 text-right text-sm tabular-nums text-ink-muted">
                        {slot.committed}
                        {slot.capacity ? `/${slot.capacity}` : ''}
                      </span>
                      <div className="flex w-24 justify-end">
                        {own ? (
                          <Link
                            href={own.editUrl}
                            className="rounded-lg border border-surface-sunk bg-white px-3.5 py-1.5 text-sm font-medium transition hover:bg-surface-raised"
                          >
                            Edit
                          </Link>
                        ) : closed ? (
                          <span className="px-3 py-1.5 text-xs font-medium text-ink-soft">
                            {full ? 'Full' : 'Closed'}
                          </span>
                        ) : isPreview ? (
                          <button
                            type="button"
                            disabled
                            title="Preview: publish to enable signups"
                            className="bg-brand cursor-not-allowed rounded-lg px-4 py-1.5 text-sm font-medium text-white opacity-60"
                          >
                            Sign up
                          </button>
                        ) : mode === 'showcase' ? (
                          <span className="bg-brand rounded-lg px-4 py-1.5 text-sm font-medium text-white">
                            Sign up
                          </span>
                        ) : (
                          <CommitDialog
                            slotId={slot.id}
                            slotTitle={title}
                            slotAt={slot.slotAt}
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
