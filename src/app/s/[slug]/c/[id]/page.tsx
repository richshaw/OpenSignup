import { notFound } from 'next/navigation';
import { getDb } from '@/db/client';
import { getOwnCommitment } from '@/services/commitments';
import EditForm from './edit-form';

export const metadata = { title: 'Your signup' };

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
