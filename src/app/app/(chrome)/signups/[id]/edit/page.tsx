import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db/client';
import { getOrganizerSession, toActor } from '@/auth/session';
import { getSignupForOrganizer, updateSignup } from '@/services/signups';

type PageParams = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export async function generateMetadata({ params }: PageParams) {
  const { id } = await params;
  const session = await getOrganizerSession();
  if (!session) return { title: 'Edit signup' };
  const result = await getSignupForOrganizer(getDb(), toActor(session), id);
  if (!result.ok) return { title: 'Edit signup' };
  return { title: `Edit: ${result.value.title}` };
}

export default async function EditSignupPage({ params, searchParams }: PageParams) {
  const { id } = await params;
  const { error } = await searchParams;
  const session = await getOrganizerSession();
  if (!session) redirect(`/login?callbackUrl=/app/signups/${id}/edit`);
  const actor = toActor(session);
  const db = getDb();
  const result = await getSignupForOrganizer(db, actor, id);
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

  async function updateAction(formData: FormData) {
    'use server';
    const s = await getOrganizerSession();
    if (!s) redirect('/login');
    const a = toActor(s);
    const updated = await updateSignup(getDb(), a, id, {
      title: String(formData.get('title') ?? ''),
      description: String(formData.get('description') ?? ''),
    });
    if (!updated.ok) {
      redirect(`/app/signups/${id}/edit?error=${encodeURIComponent(updated.error.message)}`);
    }
    revalidatePath(`/app/signups/${id}`);
    redirect(`/app/signups/${id}`);
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href={`/app/signups/${id}`} className="text-ink-muted text-sm hover:underline">
          ← Back to signup
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Edit signup</h1>
      </div>
      {error ? (
        <p className="bg-danger/10 text-danger rounded-lg px-3 py-2 text-sm">{error}</p>
      ) : null}
      <form
        action={updateAction}
        className="space-y-5 rounded-xl border border-surface-sunk bg-white p-6"
      >
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Title</span>
          <input
            type="text"
            name="title"
            required
            minLength={2}
            maxLength={120}
            defaultValue={sig.title}
            className="focus:border-brand focus:ring-brand w-full rounded-lg border border-surface-sunk bg-white px-4 py-3 shadow-sm focus:outline-none focus:ring-1"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Description (optional)</span>
          <textarea
            name="description"
            rows={4}
            maxLength={2000}
            defaultValue={sig.description ?? ''}
            className="focus:border-brand focus:ring-brand w-full rounded-lg border border-surface-sunk bg-white px-4 py-3 shadow-sm focus:outline-none focus:ring-1"
          />
        </label>
        <div className="flex items-center justify-end gap-3">
          <Link
            href={`/app/signups/${id}`}
            className="text-ink-muted hover:text-ink rounded-lg px-4 py-2 text-sm transition"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="bg-brand rounded-lg px-5 py-2 font-medium text-white transition hover:brightness-110"
          >
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}
