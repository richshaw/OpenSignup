import Link from 'next/link';
import type { SignupStatus } from '@/schemas/signups';
import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import type { SlotStatus } from '@/schemas/slots';
import { Banner } from '@/components/banner';
import CommitDialog from './commit-dialog';

export interface OwnCommitment {
  slotId: string;
  editUrl: string;
  participantName: string;
}

export interface SignupViewSlot {
  id: string;
  ref: string;
  values: Record<string, unknown>;
  slotAt: string | null;
  capacity: number | null;
  status: SlotStatus;
  committed: number;
}

export interface SignupViewField {
  ref: string;
  label: string;
  fieldType: SlotFieldDefinition['fieldType'];
}

function summarizeSlotValues(
  fields: SignupViewField[],
  values: Record<string, unknown>,
  excludeRef?: string,
): string {
  const parts: string[] = [];
  for (const f of fields) {
    if (f.ref === excludeRef) continue;
    const v = values[f.ref];
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${f.label}: ${String(v)}`);
  }
  return parts.join(' · ');
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
  mode: 'live' | 'preview';
  ownCommitments?: OwnCommitment[];
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
  const map = new Map<string, SlotGroup>();
  for (const slot of slots) {
    const raw = slot.values[groupField.ref];
    const key = raw === undefined || raw === null || raw === '' ? '' : String(raw);
    const existing = map.get(key);
    if (existing) {
      existing.slots.push(slot);
    } else {
      map.set(key, {
        key: key || '__unset__',
        label: key || `(no ${groupField.label.toLowerCase()})`,
        slots: [slot],
      });
    }
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export default function SignupView({
  signup,
  fields,
  groupByRef,
  slots,
  slug,
  mode,
  ownCommitments,
}: SignupViewProps) {
  const isPreview = mode === 'preview';
  const effectiveStatus =
    isPreview && signup.status === 'draft' ? 'open' : signup.status;
  const groupField =
    groupByRef ? fields.find((f) => f.ref === groupByRef) ?? null : null;
  const groups = groupSlots(slots, groupField);
  const ownBySlot = new Map((ownCommitments ?? []).map((c) => [c.slotId, c]));
  const firstOwn = ownCommitments?.[0] ?? null;
  const ownCount = ownCommitments?.length ?? 0;

  const previewCopy =
    signup.status === 'draft'
      ? 'This is what people will see once you publish. No signups will be saved.'
      : signup.status === 'closed'
        ? 'This signup is closed. The page below shows what visitors see.'
        : signup.status === 'archived'
          ? 'This signup is archived and is not visible to participants.'
          : 'This signup is live. The page below shows what visitors see.';

  return (
    <div className="container-tight flex flex-col gap-6">
      {isPreview ? (
        <Banner kind="preview" title="Preview" body={previewCopy} />
      ) : effectiveStatus === 'closed' ? (
        <Banner
          kind="closed"
          title="Closed"
          body="This signup is no longer collecting responses."
        />
      ) : firstOwn ? (
        <div className="rounded-xl border border-surface-sunk bg-success/5 px-4 py-3 text-sm">
          <span className="font-medium">You&apos;re signed up</span>
          {ownCount === 1 ? (
            <>
              {' '}as <span className="text-ink">{firstOwn.participantName}</span>.{' '}
              <Link href={firstOwn.editUrl} className="text-brand underline">
                Edit or cancel
              </Link>
            </>
          ) : (
            <>
              {' '}as <span className="text-ink">{firstOwn.participantName}</span> for{' '}
              <span className="text-ink">{ownCount} slots</span>. Use the Edit button on
              any of your slots below to change or cancel it.
            </>
          )}
        </div>
      ) : null}

      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{signup.title}</h1>
        {signup.description ? (
          <p className="text-ink-muted whitespace-pre-line">{signup.description}</p>
        ) : null}
      </header>

      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <section key={group.key} className="flex flex-col gap-2">
            {groupField ? (
              <h2 className="text-ink-muted text-sm font-semibold uppercase tracking-wide">
                {groupField.label}: {group.label}
              </h2>
            ) : null}
            <ul className="divide-y divide-surface-sunk overflow-hidden rounded-xl border border-surface-sunk bg-white">
              {group.slots.map((slot) => {
                const full = slot.capacity !== null && slot.committed >= slot.capacity;
                const closed = slot.status !== 'open' || effectiveStatus !== 'open' || full;
                const summary =
                  summarizeSlotValues(fields, slot.values, groupField?.ref) || slot.ref;
                const own = ownBySlot.get(slot.id) ?? null;
                const isOwn = own !== null;
                return (
                  <li
                    key={slot.id}
                    className={`flex items-center justify-between gap-4 px-5 py-4 ${
                      isOwn ? 'bg-success/5' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{summary}</p>
                      <p className="text-ink-muted text-sm">
                        {slot.slotAt
                          ? new Date(slot.slotAt).toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            })
                          : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-ink-muted w-9 text-right text-sm tabular-nums">
                        {slot.committed}
                        {slot.capacity ? `/${slot.capacity}` : ''}
                      </span>
                      <div className="flex w-24 justify-center">
                        {own ? (
                          <Link
                            href={own.editUrl}
                            className="rounded-lg border border-surface-sunk bg-white px-4 py-2 text-sm font-medium transition hover:bg-surface-raised"
                          >
                            Edit
                          </Link>
                        ) : closed ? (
                          <span className="text-ink-muted px-3 py-1.5 text-sm font-medium">
                            {full ? 'Full' : 'Closed'}
                          </span>
                        ) : isPreview ? (
                          <button
                            type="button"
                            disabled
                            title="Preview: publish to enable signups"
                            className="bg-brand cursor-not-allowed rounded-lg px-4 py-2 text-sm font-medium text-white opacity-60"
                          >
                            Sign up
                          </button>
                        ) : (
                          <CommitDialog
                            slotId={slot.id}
                            slotTitle={summary}
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

      <footer className="text-ink-soft pt-6 text-center text-xs">
        Ad-free · Run by OpenSignup · <Link className="underline" href="/">About</Link>
      </footer>
    </div>
  );
}
