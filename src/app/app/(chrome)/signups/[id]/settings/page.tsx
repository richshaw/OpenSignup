import { redirect } from 'next/navigation';
import { getOrganizerSession, toActor } from '@/auth/session';
import { loadSignupForOrganizer } from '@/services/signups.cached';
import { updateBasicsAction } from '../actions';

type PageParams = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function SettingsTab({ params, searchParams }: PageParams) {
  const { id } = await params;
  const { error } = await searchParams;
  const session = await getOrganizerSession();
  if (!session) redirect(`/login?callbackUrl=/app/signups/${id}/settings`);
  const result = await loadSignupForOrganizer(toActor(session), id);
  if (!result.ok) return null;
  const sig = result.value;

  return (
    <section className="max-w-2xl space-y-6">
      {error ? (
        <p role="alert" className="bg-danger/10 text-danger rounded-lg px-3 py-2 text-sm">{error}</p>
      ) : null}
      <form
        action={updateBasicsAction.bind(null, id)}
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
        <div className="flex items-center justify-end">
          <button
            type="submit"
            className="bg-brand rounded-lg px-5 py-2 font-medium text-white transition hover:brightness-110"
          >
            Save changes
          </button>
        </div>
      </form>
    </section>
  );
}
