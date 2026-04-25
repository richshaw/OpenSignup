import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { getOrganizerSession, toActor } from '@/auth/session';
import { createSignup } from '@/services/signups';

export const metadata = { title: 'New signup' };

export default async function NewSignupPage() {
  const session = await getOrganizerSession();
  if (!session) redirect('/login?callbackUrl=/app/signups/new');

  async function createAction(formData: FormData) {
    'use server';
    const s = await getOrganizerSession();
    if (!s || !s.defaultWorkspaceId) redirect('/login');
    const actor = toActor(s);
    const result = await createSignup(getDb(), actor, s.defaultWorkspaceId, {
      title: String(formData.get('title') ?? ''),
      description: String(formData.get('description') ?? ''),
      visibility: 'unlisted',
    });
    if (!result.ok) {
      redirect(`/app/signups/new?error=${encodeURIComponent(result.error.message)}`);
    }
    redirect(`/app/signups/${result.value.id}`);
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New signup</h1>
        <p className="text-ink-muted text-sm">
          You can add slots after it&apos;s created. Nothing is visible until you publish.
        </p>
      </div>
      <form action={createAction} className="space-y-5 rounded-xl border border-surface-sunk bg-white p-6">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Title</span>
          <input
            type="text"
            name="title"
            required
            minLength={2}
            maxLength={120}
            placeholder="Snack duty — Spring season"
            className="focus:border-brand focus:ring-brand w-full rounded-lg border border-surface-sunk bg-white px-4 py-3 shadow-sm focus:outline-none focus:ring-1"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Description (optional)</span>
          <textarea
            name="description"
            rows={4}
            maxLength={2000}
            placeholder="One paragraph that shows up at the top of your signup page."
            className="focus:border-brand focus:ring-brand w-full rounded-lg border border-surface-sunk bg-white px-4 py-3 shadow-sm focus:outline-none focus:ring-1"
          />
        </label>
        <div className="flex items-center justify-end gap-3">
          <a
            href="/app"
            className="text-ink-muted hover:text-ink rounded-lg px-4 py-2 text-sm transition"
          >
            Cancel
          </a>
          <button
            type="submit"
            className="bg-brand rounded-lg px-5 py-2 font-medium text-white transition hover:brightness-110"
          >
            Create signup
          </button>
        </div>
      </form>
    </div>
  );
}
