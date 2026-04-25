import { notFound } from 'next/navigation';
import { getDb } from '@/db/client';
import type { SignupStatus } from '@/schemas/signups';
import type { SlotStatus } from '@/schemas/slots';
import { getPublicSignup } from '@/services/signups';
import SignupView, { type SignupViewSlot } from './signup-view';

export const metadata = { title: 'Sign up' };

type PageParams = { params: Promise<{ slug: string }> };

export default async function PublicSignupPage({ params }: PageParams) {
  const { slug } = await params;
  const result = await getPublicSignup(getDb(), slug);
  if (!result.ok) {
    const received = result.error.received;
    if (received === 'draft' || received === 'archived') {
      return (
        <main className="flex min-h-[100svh] flex-col items-center justify-center px-6 py-12">
          <div className="container-tight w-full space-y-3 rounded-xl border border-surface-sunk bg-white p-8 text-center">
            <h1 className="text-xl font-semibold tracking-tight">
              {received === 'draft'
                ? 'This signup isn’t ready yet'
                : 'This signup is no longer available'}
            </h1>
            <p className="text-ink-muted text-sm">
              {received === 'draft'
                ? 'The organizer hasn’t published this signup yet. Check back soon or ask them for an updated link.'
                : 'The organizer has archived this signup. If you need to reach them, ask for a new link.'}
            </p>
          </div>
        </main>
      );
    }
    notFound();
  }
  const sig = result.value;

  const slots: SignupViewSlot[] = sig.slots.map((slot) => {
    const committerIds = sig.committerByslot[slot.id] ?? [];
    return {
      id: slot.id,
      title: slot.title,
      description: slot.description,
      slotAt: slot.slotAt ? slot.slotAt.toISOString() : null,
      location: slot.location,
      capacity: slot.capacity,
      status: slot.status as SlotStatus,
      committed: committerIds.length,
    };
  });

  return (
    <main className="flex min-h-[100svh] flex-col py-8">
      <SignupView
        signup={{
          title: sig.title,
          description: sig.description,
          status: sig.status as SignupStatus,
        }}
        slots={slots}
        slug={slug}
        mode="live"
      />
    </main>
  );
}
