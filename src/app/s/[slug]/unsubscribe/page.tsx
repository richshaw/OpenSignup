import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { FormError } from '@/components/ui/form-error';
import { getDb } from '@/db/client';
import { type CatalogLocale, signupLocale } from '@/i18n/config';
import { getServerTranslator, instanceDefaultLocale } from '@/i18n/server';
import { unsubscribePath } from '@/lib/links';
import { previewReminderOptOut } from '@/services/reminder-optout';
import { requestedSignupLocale } from '../signup-locale';
import { SignupStateMessage } from '../state-message';

/**
 * The tab's title, in the language of the signup the path names: the read
 * the not-found page makes on every request under this one, so it costs no
 * statement. The page itself goes by the signup its token opens, which is
 * the same one whenever the page shows it (a wrong slug is redirected).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = getServerTranslator(await requestedSignupLocale(), 'participant.unsubscribe');
  return { title: t('title'), robots: { index: false, follow: false } };
}

type PageParams = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ p?: string; token?: string; done?: 'on' | 'off'; error?: string }>;
};

function Shell({
  locale,
  title,
  error,
  children,
}: {
  locale: CatalogLocale;
  title: string;
  /** Why the last try failed, already in the page's language. */
  error?: string;
  children: ReactNode;
}) {
  return (
    <main
      lang={locale}
      className="container-tight flex min-h-[100svh] flex-col justify-center gap-4 py-8"
    >
      <div className="space-y-4 rounded-xl border border-surface-sunk bg-white p-6">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {error ? <FormError>{error}</FormError> : null}
        {children}
      </div>
    </main>
  );
}

export default async function UnsubscribePage({ params, searchParams }: PageParams) {
  const { slug } = await params;
  const { p: participantId, token, done, error } = await searchParams;

  // Nothing below is decided by the query string alone. `?done=off` used to
  // render "Reminders turned off" to anyone handed the URL, on any slug, with
  // nothing having happened — so someone who bookmarked or was sent that link
  // believed they were unsubscribed and kept getting reminders. The token is
  // resolved first, every time, and the outcome is read from the row.
  if (!participantId || !token) {
    // An incomplete link gets a plain explanation rather than a 404: the most
    // likely visitor is a real participant whose mail client mangled the link,
    // and a "not found" would tell them nothing useful. With no signup to read
    // a language from, it's in the language of the signup the path names, as
    // a broken edit link's page is (`../c/[id]/not-found.tsx`).
    const locale = await requestedSignupLocale();
    const t = getServerTranslator(locale, 'participant.unsubscribe');
    return (
      <SignupStateMessage
        locale={locale}
        title={t('incomplete.title')}
        body={t('incomplete.body')}
      />
    );
  }

  const result = await previewReminderOptOut(getDb(), participantId, token);
  if (!result.ok) {
    const locale = await requestedSignupLocale();
    const t = getServerTranslator(locale, 'participant.unsubscribe');
    return (
      <SignupStateMessage locale={locale} title={t('invalid.title')} body={t('invalid.body')} />
    );
  }

  // `participantEmail` is null only for a participant who gave no email. They
  // never get a reminder, so never this link, and the copy below just leaves
  // the address out.
  const target = result.value;

  // The slug is decoration — the token alone identifies the participant — so a
  // wrong one would otherwise show the real signup's title and the
  // participant's email address under an unrelated signup's URL. Send them to
  // the canonical address instead of rendering the misleading one.
  if (slug !== target.signupSlug) {
    redirect(unsubscribePath(target.signupSlug, participantId, token));
  }
  // The signup's language, from the row the token was checked against.
  const locale = signupLocale(target.signupLocale, instanceDefaultLocale());
  const t = getServerTranslator(locale, 'participant.unsubscribe');
  // The signup's title in bold, and the address in the sentence when there
  // is one: a whole sentence for each, so a language can put the address
  // where it reads best.
  const email = target.participantEmail;
  const sentence = (key: 'confirm' | 'areOff' | 'turnedOn') =>
    email
      ? t.rich(`${key}.bodyWithEmail`, { title: target.signupTitle, email, b: strong })
      : t.rich(`${key}.body`, { title: target.signupTitle, b: strong });

  const credentials = (
    <>
      <input type="hidden" name="p" value={target.participantId} />
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="slug" value={target.signupSlug} />
    </>
  );

  if (target.optedOut) {
    return (
      /*
        The neutral heading states the current state and claims nothing about
        when it was reached. "You're already unsubscribed" told anyone whose
        `?done=off` went missing that their click had changed nothing, seconds
        after it had — the one message guaranteed to make someone click again
        or give up and mark the mail as spam. `done=off` still earns the
        affirmative wording; without it we say only what the row shows.
      */
      <Shell
        locale={locale}
        title={done === 'off' ? t('turnedOff.title') : t('areOff.title')}
        error={error === 'on' ? t('turnOnFailed') : undefined}
      >
        <p className="text-sm text-ink-muted">
          {done === 'off'
            ? t.rich('turnedOff.body', { title: target.signupTitle, b: strong })
            : sentence('areOff')}
        </p>
        {/*
          Reminders are per-participant and the row is reused for the same
          email, so without a way back someone who unsubscribes from this signup
          in September and signs up again in November silently gets nothing.
        */}
        <form
          action="/api/public/reminder-optout"
          method="post"
          className="flex items-center gap-3"
        >
          {credentials}
          <input type="hidden" name="action" value="start" />
          <button type="submit" className="text-sm text-brand underline">
            {t('turnBackOn')}
          </button>
        </form>
        <a href={`/s/${target.signupSlug}`} className="text-sm text-brand underline">
          {t('back')}
        </a>
      </Shell>
    );
  }

  return (
    <Shell
      locale={locale}
      title={done === 'on' ? t('turnedOn.title') : t('confirm.title')}
      error={error === 'off' ? t('turnOffFailed') : undefined}
    >
      <p className="text-sm text-ink-muted">
        {done === 'on' ? sentence('turnedOn') : sentence('confirm')}
      </p>
      {/* A POST, so a link scanner following the URL can't unsubscribe anyone. */}
      <form action="/api/public/reminder-optout" method="post" className="flex gap-3">
        {credentials}
        <button
          type="submit"
          className="rounded-lg bg-brand px-5 py-2 font-medium text-white transition hover:bg-brand-hover"
        >
          {t('stop')}
        </button>
        <a
          href={`/s/${target.signupSlug}`}
          className="rounded-lg border border-surface-sunk px-5 py-2 font-medium transition hover:bg-surface-sunk/40"
        >
          {t('keep')}
        </a>
      </form>
    </Shell>
  );
}

/** The signup's title, in bold, as each sentence above names it. */
function strong(chunks: ReactNode) {
  return <strong>{chunks}</strong>;
}
