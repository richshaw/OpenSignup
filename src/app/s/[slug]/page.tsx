import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getDb } from '@/db/client';
import { commitmentEditUrl } from '@/lib/links';
import {
  COMMIT_COOKIE_NAME,
  parseReturningCommits,
} from '@/lib/returning-participant';
import type { SignupStatus } from '@/schemas/signups';
import type { SlotStatus } from '@/schemas/slots';
import { getOwnCommitment } from '@/services/commitments';
import { getPublicSignup } from '@/services/signups';
import SignupView, { type SignupViewField, type SignupViewSlot } from './signup-view';

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

  const cookieStore = await cookies();
  const returningRaw = cookieStore.get(COMMIT_COOKIE_NAME)?.value ?? null;
  const returning = parseReturningCommits(returningRaw);
  const db = getDb();
  const lookups = await Promise.all(
    returning.map(async (r) => {
      const found = await getOwnCommitment(db, r.commitmentId, r.token);
      if (!found.ok) return null;
      const c = found.value;
      if (c.signupId !== sig.id) return null;
      if (c.status !== 'confirmed' && c.status !== 'tentative') return null;
      return {
        slotId: c.slotId,
        editUrl: commitmentEditUrl(slug, c.id, r.token),
        participantName: c.participantName,
      };
    }),
  );
  const ownCommitments = lookups.filter(
    (x): x is { slotId: string; editUrl: string; participantName: string } => x !== null,
  );

  const slots: SignupViewSlot[] = sig.slots.map((slot) => ({
    id: slot.id,
    ref: slot.ref,
    values: (slot.values as Record<string, unknown>) ?? {},
    slotAt: slot.slotAt ? slot.slotAt.toISOString() : null,
    capacity: slot.capacity,
    status: slot.status as SlotStatus,
    committed: sig.committedBySlot[slot.id] ?? 0,
  }));
  const fields: SignupViewField[] = sig.fields.map((f) => ({
    ref: f.ref,
    label: f.label,
    fieldType: f.fieldType,
  }));
  const settings = (sig.settings ?? {}) as { groupByFieldRefs?: string[] };
  const groupByRef = settings.groupByFieldRefs?.[0] ?? null;

  return (
    <main className="flex min-h-[100svh] flex-col py-8">
      <SignupView
        signup={{
          title: sig.title,
          description: sig.description,
          status: sig.status as SignupStatus,
        }}
        fields={fields}
        groupByRef={groupByRef}
        slots={slots}
        slug={slug}
        mode="live"
        ownCommitments={ownCommitments}
      />
    </main>
  );
}
