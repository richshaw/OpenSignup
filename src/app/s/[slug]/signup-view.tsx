import Link from 'next/link';
import type { SignupStatus } from '@/schemas/signups';
import type { SlotStatus } from '@/schemas/slots';
import CommitDialog from './commit-dialog';

export interface SignupViewSlot {
  id: string;
  title: string;
  description: string;
  slotAt: string | null;
  location: string | null;
  capacity: number | null;
  status: SlotStatus;
  committed: number;
}

interface SignupViewProps {
  signup: {
    title: string;
    description: string | null;
    status: SignupStatus;
  };
  slots: SignupViewSlot[];
  slug: string;
  mode: 'live' | 'preview';
}

export default function SignupView({ signup, slots, slug, mode }: SignupViewProps) {
  const isPreview = mode === 'preview';
  const effectiveStatus =
    isPreview && signup.status === 'draft' ? 'open' : signup.status;

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
        <div role="status" className="space-y-1 rounded-lg bg-brand/10 px-5 py-4 text-brand">
          <p className="text-base font-semibold">Preview</p>
          <p className="text-sm">{previewCopy}</p>
        </div>
      ) : effectiveStatus === 'closed' ? (
        <div
          role="status"
          className="bg-surface-sunk text-ink-muted space-y-1 rounded-lg px-5 py-4"
        >
          <p className="text-base font-semibold">Closed</p>
          <p className="text-sm">This signup is no longer collecting responses.</p>
        </div>
      ) : null}

      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{signup.title}</h1>
        {signup.description ? (
          <p className="text-ink-muted whitespace-pre-line">{signup.description}</p>
        ) : null}
      </header>

      <ul className="divide-y divide-surface-sunk overflow-hidden rounded-xl border border-surface-sunk bg-white">
        {slots.map((slot) => {
          const full = slot.capacity !== null && slot.committed >= slot.capacity;
          const closed = slot.status !== 'open' || effectiveStatus !== 'open' || full;
          return (
            <li key={slot.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{slot.title}</p>
                <p className="text-ink-muted text-sm">
                  {slot.slotAt
                    ? new Date(slot.slotAt).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })
                    : ''}
                  {slot.location ? ` · ${slot.location}` : ''}
                </p>
                {slot.description ? (
                  <p className="text-ink-muted mt-1 text-sm whitespace-pre-line">
                    {slot.description}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-ink-muted text-sm">
                  {slot.committed}
                  {slot.capacity ? `/${slot.capacity}` : ''}
                </span>
                {closed ? (
                  <span className="text-ink-muted rounded-lg px-3 py-1.5 text-xs font-medium">
                    {full ? 'Full' : 'Closed'}
                  </span>
                ) : isPreview ? (
                  <button
                    type="button"
                    disabled
                    title="Preview — publish to enable signups"
                    className="bg-brand cursor-not-allowed rounded-lg px-4 py-2 text-sm font-medium text-white opacity-60"
                  >
                    Sign up
                  </button>
                ) : (
                  <CommitDialog slotId={slot.id} slotTitle={slot.title} slug={slug} />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <footer className="text-ink-soft pt-6 text-center text-xs">
        Ad-free · Run by Signups · <Link className="underline" href="/">About</Link>
      </footer>
    </div>
  );
}
