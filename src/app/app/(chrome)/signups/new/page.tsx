import { requireOrganizerSession } from '@/auth/session';
import { trackOrganizerView } from '@/lib/view-tracker';
import { getEnv, magicComposeEnabled } from '@/lib/env';
import { MagicComposeRoot } from '@/components/magic-compose/MagicComposeRoot';
import { DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH } from '@/schemas/signups';
import { NewSignupForm } from './NewSignupForm';

export const metadata = { title: 'New signup' };

type PageProps = {
  searchParams: Promise<{ manual?: string; title?: string; description?: string }>;
};

/** A box's starting text, from Magic Compose's "fill in by hand" links (see `handFillHref`). */
function carried(value: unknown, max: number): string | undefined {
  return typeof value === 'string' ? value.slice(0, max) : undefined;
}

export default async function NewSignupPage({ searchParams }: PageProps) {
  const session = await requireOrganizerSession();

  const { manual, title, description } = await searchParams;
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
    return <MagicComposeRoot llmTimeoutMs={getEnv().LLM_TIMEOUT_MS} />;
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New signup</h1>
        <p className="text-sm text-ink-muted">
          You can add slots after it&apos;s created. Nothing is visible until you publish.
        </p>
      </div>
      <NewSignupForm
        title={carried(title, TITLE_MAX_LENGTH)}
        description={carried(description, DESCRIPTION_MAX_LENGTH)}
      />
    </div>
  );
}
