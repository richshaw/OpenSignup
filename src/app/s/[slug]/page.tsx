import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/db/client';
import { getPublicSignup } from '@/services/signups';
import CommitDialog from './commit-dialog';

export const metadata = { title: 'Sign up' };

type PageParams = { params: Promise<{ slug: string }> };

export default async function PublicSignupPage({ params }: PageParams) {
  const { slug } = await params;
  const result = await getPublicSignup(getDb(), slug);
  if (!result.ok) notFound();
  const sig = result.value;

  const slots = sig.slots.map((slot) => {
    const committerIds = sig.committerByslot[slot.id] ?? [];
    return {
      id: slot.id,
      title: slot.title,
      description: slot.description,
      slotAt: slot.slotAt ? slot.slotAt.toISOString() : null,
      location: slot.location,
      capacity: slot.capacity,
      status: slot.status,
      committed: committerIds.length,
    };
  });

  return (
    <main className="container-tight flex min-h-[100svh] flex-col gap-6 py-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{sig.title}</h1>
        {sig.description ? (
          <p className="text-ink-muted whitespace-pre-line">{sig.description}</p>
        ) : null}
        {sig.status === 'closed' ? (
          <p className="rounded-lg bg-warn/10 px-4 py-2 text-sm text-warn">
            This signup is closed.
          </p>
        ) : null}
      </header>

      <ul className="divide-y divide-surface-sunk overflow-hidden rounded-xl border border-surface-sunk bg-white">
        {slots.map((slot) => {
          const full = slot.capacity !== null && slot.committed >= slot.capacity;
          const closed = slot.status !== 'open' || sig.status !== 'open' || full;
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
                ) : (
                  <CommitDialog slotId={slot.id} slotTitle={slot.title} slug={slug} />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <footer className="text-ink-soft pt-6 text-center text-xs">
        Ad-free · Run by Signup · <Link className="underline" href="/">About</Link>
      </footer>
    </main>
  );
}
