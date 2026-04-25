import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { getOrganizerSession, toActor } from '@/auth/session';
import type { SignupStatus } from '@/schemas/signups';
import type { SlotStatus } from '@/schemas/slots';
import { getSignupForOrganizer } from '@/services/signups';
import SignupView, { type SignupViewSlot } from '@/app/s/[slug]/signup-view';

export const metadata = { title: 'Preview · Signup' };

type PageParams = { params: Promise<{ id: string }> };

export default async function SignupPreviewPage({ params }: PageParams) {
  const { id } = await params;
  const session = await getOrganizerSession();
  if (!session) redirect(`/login?callbackUrl=/app/signups/${id}/preview`);
  const actor = toActor(session);
  const result = await getSignupForOrganizer(getDb(), actor, id);
  if (!result.ok) {
    return (
      <div className="rounded-xl border border-surface-sunk bg-white p-8">
        <p className="text-danger font-medium">{result.error.message}</p>
        <Link href="/app" className="text-brand text-sm underline">
          Back to dashboard
        </Link>
      </div>
    );
  }
  const sig = result.value;

  const slots: SignupViewSlot[] = sig.slots.map((slot) => ({
    id: slot.id,
    title: slot.title,
    description: slot.description,
    slotAt: slot.slotAt ? slot.slotAt.toISOString() : null,
    location: slot.location,
    capacity: slot.capacity,
    status: slot.status as SlotStatus,
    committed: 0,
  }));

  return (
    <main className="flex min-h-[100svh] flex-col py-8">
      <SignupView
        signup={{
          title: sig.title,
          description: sig.description,
          status: sig.status as SignupStatus,
        }}
        slots={slots}
        slug={sig.slug}
        mode="preview"
      />
    </main>
  );
}
