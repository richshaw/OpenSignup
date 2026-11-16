import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Banner } from '@/components/banner';
import { getDb } from '@/db/client';
import { ClientMessages } from '@/i18n/ClientMessages';
import { signupLocale } from '@/i18n/config';
import { getServerTranslator, instanceDefaultLocale } from '@/i18n/server';
import { messagesFor } from '@/i18n/translator';
import {
  ACTIVE_COMMITMENT_STATUSES,
  cancelledCommitmentState,
  editLimitsForCommitment,
  getOwnCommitment,
} from '@/services/commitments';
import { commitmentEditPath, commitmentEditUrl } from '@/lib/links';
import { editTokenFor } from '@/lib/token';
import { recordEditLinkFollowed, trackAfterResponse } from '@/lib/view-tracker';
import { cancelledPage } from '../../cancelled-message';
import { EDIT_FORM_NAMESPACES } from '../../client-namespaces';
import { requestedSignupLocale } from '../../signup-locale';
import { SignupStateMessage } from '../../state-message';
import EditForm from './edit-form';

/**
 * The tab's title, in the language of the signup the path names: the read
 * the not-found pages make on every request under this one, so it costs no
 * statement. The page itself goes by the signup its token opens, which is
 * the same one whenever the page shows it (a wrong slug is redirected).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = getServerTranslator(await requestedSignupLocale(), 'participant.editPage');
  return { title: t('title'), robots: { index: false, follow: false } };
}

type PageParams = {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function CommitmentEditPage({ params, searchParams }: PageParams) {
  const { slug, id } = await params;
  const { token } = await searchParams;
  // A missing token, a wrong one and a deleted sign-up all get the same page
  // (./not-found.tsx), so a guessed id can't confirm a sign-up exists.
  if (!token) notFound();
  const result = await getOwnCommitment(getDb(), id, token);
  if (!result.ok) notFound();
  const c = result.value;

  // The slug is decoration, since the token alone identifies the sign-up, so
  // a wrong one would point the back link at an unrelated signup. Send them
  // to the right address instead, as the unsubscribe page does.
  if (slug !== c.signupSlug) {
    redirect(commitmentEditPath(c.signupSlug, c.id, token));
  }
  // The signup's language, from the row the token was checked against: the
  // page's words, the slot's dates and times, and the form's text.
  const locale = signupLocale(c.signupLocale, instanceDefaultLocale());

  // Recorded for a cancelled sign-up too: the link was still followed.
  await trackAfterResponse(recordEditLinkFollowed, {
    signupId: c.signupId,
    workspaceId: c.workspaceId,
    commitmentId: c.id,
    participantId: c.participantId,
  });

  // The link in the confirmation email never changes, so people follow it
  // after a cancel too. The token shows the sign-up is theirs, so there is
  // nothing to hide, and the form would only fail: a save is refused and a
  // cancel changes nothing.
  if (c.status === 'cancelled') {
    const state = await cancelledCommitmentState(getDb(), c, locale);
    const t = getServerTranslator(locale, 'participant.cancelledPage');
    const copy = cancelledPage(t);
    if (state.movedTo !== null) {
      // Its token is derived from its id, as the reminder email's is. Only
      // the holder of this link could have made the move, so linking them to
      // the sign-up it made gives nothing away.
      return (
        <SignupStateMessage
          locale={locale}
          {...copy.moved}
          action={{
            label: t('moved.link'),
            href: commitmentEditUrl(slug, state.movedTo, editTokenFor(state.movedTo)),
          }}
        />
      );
    }
    return (
      <SignupStateMessage
        locale={locale}
        {...(state.removed ? copy.removed : copy[state.slot])}
        detail={state.slotName}
        action={{ label: t('back'), href: `/s/${slug}` }}
      />
    );
  }
  // `no_show`, which nothing writes yet: the form can't act on it and no
  // message here fits, so it gets the not-found page.
  if (!ACTIVE_COMMITMENT_STATUSES.includes(c.status)) notFound();

  const { maxQuantity, closed, slotName } = await editLimitsForCommitment(getDb(), c, locale);
  const t = getServerTranslator(locale, 'participant.editPage');

  return (
    <main lang={locale} className="container-tight flex min-h-[100svh] flex-col gap-6 py-8">
      <header className="space-y-1">
        <a href={`/s/${slug}`} className="text-sm text-ink-muted hover:underline">
          {t('back')}
        </a>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        {/* Which slot this is, as the cancelled page and the emails name it,
            for someone with more than one sign-up or no email to check. */}
        {slotName ? <p className="text-balance text-sm font-medium">{slotName}</p> : null}
        <p className="text-sm text-ink-muted">
          {c.participantEmail
            ? t('editingAsWithEmail', { name: c.participantName, email: c.participantEmail })
            : t('editingAs', { name: c.participantName })}
        </p>
      </header>
      {/* The organizer closed the signup or the slot, or its time has come.
          The form still works for everything but taking more spots. */}
      {closed ? (
        <Banner kind="closed" title={t('closedBanner.title')} body={t('closedBanner.body')} />
      ) : null}
      {/* The form's text, which it reads in the browser, in the page's language. */}
      <ClientMessages locale={locale} messages={messagesFor(locale, EDIT_FORM_NAMESPACES)}>
        <EditForm
          commitmentId={c.id}
          token={token}
          initialName={c.participantName}
          initialNotes={c.notes}
          initialQuantity={c.quantity}
          maxQuantity={maxQuantity}
        />
      </ClientMessages>
    </main>
  );
}
