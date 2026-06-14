import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { getDb } from '@/db/client';
import { getOwnCommitment } from '@/services/commitments';
import { readRequestSignals, recordEditLinkFollowed } from '@/lib/view-tracker';
import EditForm from './edit-form';

export const metadata = { title: 'Your signup', robots: { index: false, follow: false } };

type PageParams = {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function CommitmentEditPage({ params, searchParams }: PageParams) {
  const { slug, id } = await params;
  const { token } = await searchParams;
  if (!token) notFound();
  const result = await getOwnCommitment(getDb(), id, token);
  if (!result.ok) notFound();
  const c = result.value;

  // Read headers in the request context — `after(...)` runs outside it and
  // Next.js 15 forbids dynamic APIs (headers/cookies) inside the callback.
  const signals = readRequestSignals(await headers());
  after(() =>
    recordEditLinkFollowed({
      signupId: c.signupId,
      workspaceId: c.workspaceId,
      commitmentId: c.id,
      participantId: c.participantId,
      signals,
    }),
  );

  return (
    <main className="container-tight flex min-h-[100svh] flex-col gap-6 py-8">
      <header className="space-y-1">
        <a href={`/s/${slug}`} className="text-ink-muted text-sm hover:underline">
          ← Back to signup
        </a>
        <h1 className="text-2xl font-semibold tracking-tight">Your signup</h1>
        <p className="text-ink-muted text-sm">
          You&apos;re editing this as {c.participantName} ({c.participantEmail}).
        </p>
      </header>
      <EditForm
        commitmentId={c.id}
        token={token}
        initialName={c.participantName}
        initialNotes={c.notes}
        initialQuantity={c.quantity}
        slug={slug}
      />
    </main>
  );
}
