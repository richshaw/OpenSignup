import type { Metadata } from 'next';
import { getOrganizerSession, requireOrganizerSession, toActor } from '@/auth/session';
import { ClientMessages } from '@/i18n/ClientMessages';
import { getOrganizerAppLocale } from '@/i18n/organizer';
import { getServerTranslator } from '@/i18n/server';
import { messagesFor } from '@/i18n/translator';
import { trackOrganizerView } from '@/lib/view-tracker';
import { getEnv, magicComposeEnabled } from '@/lib/env';
import { MAGIC_COMPOSE_NAMESPACES } from '@/components/magic-compose/client-namespaces';
import { MagicComposeRoot } from '@/components/magic-compose/MagicComposeRoot';
import { DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH } from '@/schemas/signups';
import { NewSignupForm } from './NewSignupForm';

export async function generateMetadata(): Promise<Metadata> {
  const locale = getOrganizerAppLocale(await getOrganizerSession());
  return { title: getServerTranslator(locale, 'organizer.newSignup')('title') };
}

type PageProps = {
  searchParams: Promise<{ manual?: string; title?: string; description?: string }>;
};

/** A box's starting text, from Magic Compose's "fill in by hand" links (see `handFillHref`). */
function carried(value: unknown, max: number): string | undefined {
  return typeof value === 'string' ? value.slice(0, max) : undefined;
}

export default async function NewSignupPage({ searchParams }: PageProps) {
  const session = await requireOrganizerSession();

  const locale = getOrganizerAppLocale(session);
  const { manual, title, description } = await searchParams;
  const useMagic = magicComposeEnabled() && manual !== '1';

  if (session.defaultWorkspaceId) {
    const workspaceId = session.defaultWorkspaceId;
    await trackOrganizerView({
      actor: toActor(session),
      signupId: null,
      workspaceId,
      eventType: 'signup.draft_started',
      payload: { mode: useMagic ? 'magic' : 'manual' },
    });
  }

  // Magic Compose is all client components, so its words reach it as
  // messages; the form's few reach it as props, worded here.
  if (useMagic) {
    return (
      <ClientMessages locale={locale} messages={messagesFor(locale, MAGIC_COMPOSE_NAMESPACES)}>
        <MagicComposeRoot llmTimeoutMs={getEnv().LLM_TIMEOUT_MS} />
      </ClientMessages>
    );
  }

  const t = getServerTranslator(locale, 'organizer.newSignup');
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-ink-muted">{t('intro')}</p>
      </div>
      <NewSignupForm
        title={carried(title, TITLE_MAX_LENGTH)}
        description={carried(description, DESCRIPTION_MAX_LENGTH)}
        text={{
          title: t('titleLabel'),
          titlePlaceholder: t('titlePlaceholder'),
          description: t('descriptionLabel'),
          descriptionPlaceholder: t('descriptionPlaceholder'),
          cancel: t('cancel'),
          creating: t('creating'),
          create: t('create'),
        }}
      />
    </div>
  );
}
