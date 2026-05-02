import type { Metadata } from 'next';
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
import { getOwnCommitmentsForSignup } from '@/services/commitments';
import { loadPublicSignup } from '@/services/signups.cached';
import SignupView, { type SignupViewField, type SignupViewSlot } from './signup-view';

type PageParams = { params: Promise<{ slug: string }> };

function trimToBoundary(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  if (value.length <= max) return value;
  const sliced = value.slice(0, max);
  const lastSpace = sliced.search(/\s\S*$/);
  const trimmed = (lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced).trimEnd();
  return trimmed.length > 0 ? `${trimmed}…` : sliced;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadPublicSignup(slug);
  if (!result.ok) return { title: 'Sign up' };
  const sig = result.value;
  const description = trimToBoundary(sig.description, 200) ?? 'Sign up via OpenSignup';
  return {
    title: sig.title,
    description,
    openGraph: {
      title: sig.title,
      description,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: sig.title,
      description,
    },
  };
}

export default async function PublicSignupPage({ params }: PageParams) {
  const { slug } = await params;
  const result = await loadPublicSignup(slug);
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
  // Drop entries the cookie says belong to a different signup; legacy entries
  // (no signupId) fall through and are filtered by the signupId-scoped query.
  const candidates = parseReturningCommits(returningRaw).filter(
    (e) => !e.signupId || e.signupId === sig.id,
  );
  const found = await getOwnCommitmentsForSignup(getDb(), sig.id, candidates);
  const tokenById = new Map(candidates.map((c) => [c.commitmentId, c.token]));
  const ownCommitments = found.map((c) => ({
    slotId: c.slotId,
    editUrl: commitmentEditUrl(slug, c.id, tokenById.get(c.id) ?? ''),
    participantName: c.participantName,
  }));

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
