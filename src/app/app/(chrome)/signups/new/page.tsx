import { requireOrganizerSession } from '@/auth/session';
import { AsyncSubmitButton } from '@/components/ui/async-submit-button';
import { FormError } from '@/components/ui/form-error';
import { trackOrganizerView } from '@/lib/view-tracker';
import { magicComposeEnabled } from '@/lib/env';
import { MagicComposeRoot } from '@/components/magic-compose/MagicComposeRoot';
import { createSignupAction } from './actions';

export const metadata = { title: 'New signup' };

type PageProps = { searchParams: Promise<{ manual?: string; error?: string }> };

export default async function NewSignupPage({ searchParams }: PageProps) {
  const session = await requireOrganizerSession();

  const { manual, error } = await searchParams;
  const useMagic = magicComposeEnabled() && manual !== '1';

  if (session.defaultWorkspaceId) {
    const workspaceId = session.defaultWorkspaceId;
    await trackOrganizerView({
      actor: { actorId: session.organizerId, actorType: 'organizer' },
      signupId: null,
      workspaceId,
      eventType: 'signup.draft_started',
      payload: { mode: useMagic ? 'magic' : 'manual' },
    });
  }

  if (useMagic) {
    return <MagicComposeRoot />;
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New signup</h1>
        <p className="text-ink-muted text-sm">
          You can add slots after it&apos;s created. Nothing is visible until you publish.
        </p>
      </div>
      {error ? <FormError>{error}</FormError> : null}
      <form action={createSignupAction} className="space-y-5 rounded-xl border border-surface-sunk bg-white p-6">
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
          <AsyncSubmitButton
            loadingLabel="Creating…"
            className="bg-brand rounded-lg px-5 py-2 font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:brightness-90"
          >
            Create signup
          </AsyncSubmitButton>
        </div>
      </form>
    </div>
  );
}
