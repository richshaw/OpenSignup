import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getOrganizerSession, toActor } from '@/auth/session';
import { getDb } from '@/db/client';
import { openGraphLocale, signupLocale } from '@/i18n/config';
import { getServerTranslator, instanceDefaultLocale } from '@/i18n/server';
import { ServiceException } from '@/lib/errors';
import { commitmentEditUrl } from '@/lib/links';
import { COMMIT_COOKIE_NAME, parseReturningCommits } from '@/lib/returning-participant';
import { shortenToLimit } from '@/lib/shorten';
import { INSTANCE_NAME } from '@/lib/site-config';
import { recordPublicView, trackAfterResponse } from '@/lib/view-tracker';
import { getOwnCommitmentsForSignup } from '@/services/commitments';
import { findDraftForOrganizer } from '@/services/signups';
import { loadPublicSignup } from '@/services/signups.cached';
import { organizerBarSignupId } from './organizer-bar';
import { OrganizerStrip } from './organizer-strip';
import { signupLocaleForSlug } from './signup-locale';
import SignupView, { toSignupViewProps } from './signup-view';
import { SignupStateMessage } from './state-message';

type PageParams = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadPublicSignup(slug);
  // Private share links: keep these out of the search index. They stay
  // crawlable (not robots-disallowed) so the noindex directive is honored.
  const robots = { index: false, follow: false } as const;
  if (!result.ok) {
    const t = getServerTranslator(await signupLocaleForSlug(slug), 'participant.signupPage');
    return { title: t('title'), robots };
  }
  const sig = result.value;
  const locale = signupLocale(sig.settings.locale, instanceDefaultLocale());
  const t = getServerTranslator(locale, 'participant.signupPage');
  // Trimmed for a description saved as only spaces before the schema trimmed it.
  const text = sig.description.trim();
  const description = text
    ? shortenToLimit(text, 200)
    : t('description', { instance: INSTANCE_NAME });
  return {
    title: sig.title,
    description,
    robots,
    // Next replaces the root layout's openGraph rather than merging it, so
    // this one names its own language: link previews read og:locale.
    openGraph: {
      title: sig.title,
      description,
      type: 'website',
      locale: openGraphLocale(locale),
    },
    twitter: {
      card: 'summary',
      title: sig.title,
      description,
    },
  };
}

/**
 * The draft's id when the signed-in organizer is a member of its workspace,
 * so its own organizer gets a note and a way back to it; null for everyone
 * else, who sees the visitor message. Only the draft branch asks, so an open
 * signup's page never pays for this read.
 */
async function ownDraftId(slug: string): Promise<string | null> {
  const actor = toActor(await getOrganizerSession());
  if (actor.kind !== 'organizer') return null;
  try {
    const found = await findDraftForOrganizer(getDb(), actor, slug);
    return found.ok ? found.value.id : null;
  } catch (e) {
    // Another workspace's draft: the guard refuses, and they're a visitor here.
    if (e instanceof ServiceException) return null;
    throw e;
  }
}

export default async function PublicSignupPage({ params }: PageParams) {
  const { slug } = await params;
  const result = await loadPublicSignup(slug);
  if (!result.ok) {
    const received = result.error.received;
    if (received === 'draft' || received === 'archived') {
      // From the row the read above cached, so it costs no statement.
      const locale = await signupLocaleForSlug(slug);
      const t = getServerTranslator(locale, 'participant.signupPage');
      if (received === 'archived') {
        return (
          <SignupStateMessage
            locale={locale}
            title={t('archived.title')}
            body={t('archived.body')}
          />
        );
      }
      const draftId = await ownDraftId(slug);
      if (draftId) {
        // Its own organizer's note: organizer text, so English until the
        // organizer app has other languages, and marked so. It quotes the
        // title visitors see, in the signup's language.
        const own = getServerTranslator('en', 'organizer.publicPage.ownDraft');
        return (
          <SignupStateMessage
            locale="en"
            title={own('title')}
            body={own('body', { title: t('draft.title') })}
            action={{ label: own('open'), href: `/app/signups/${draftId}/build` }}
          />
        );
      }
      return <SignupStateMessage locale={locale} title={t('draft.title')} body={t('draft.body')} />;
    }
    // Deleted and never-existed both land here, and ./not-found.tsx words
    // them the same, so the page never says which.
    notFound();
  }
  const sig = result.value;
  // Worked out here, not left to a layout: a soft navigation renders the page
  // without its layout.
  const locale = signupLocale(sig.settings.locale, instanceDefaultLocale());

  const cookieStore = await cookies();
  const returningRaw = cookieStore.get(COMMIT_COOKIE_NAME)?.value ?? null;
  // Drop entries the cookie says belong to a different signup; legacy entries
  // (no signupId) fall through and are filtered by the signupId-scoped query.
  const candidates = parseReturningCommits(returningRaw).filter(
    (e) => !e.signupId || e.signupId === sig.id,
  );
  // The session read costs a visitor nothing: with no session cookie Auth.js
  // answers without touching the database. Only a signed-in organizer pays
  // for it, and it runs alongside the commitments read.
  const [found, session] = await Promise.all([
    getOwnCommitmentsForSignup(getDb(), sig.id, candidates),
    getOrganizerSession(),
  ]);
  const organizerSignupId = organizerBarSignupId(toActor(session), sig);
  const tokenById = new Map(candidates.map((c) => [c.commitmentId, c.token]));
  const ownCommitments = found.map((c) => ({
    slotId: c.slotId,
    editUrl: commitmentEditUrl(slug, c.id, tokenById.get(c.id) ?? ''),
  }));

  await trackAfterResponse(recordPublicView, {
    signupId: sig.id,
    workspaceId: sig.workspaceId,
    signupStatus: sig.status,
    isReturning: ownCommitments.length > 0,
  });

  // The organizer strip sits above <main>, so the page under it is exactly
  // what participants see.
  return (
    <>
      {organizerSignupId ? <OrganizerStrip signupId={organizerSignupId} /> : null}
      <main lang={locale} className="flex min-h-[100svh] flex-col pb-24 pt-10 sm:pt-14">
        {/* Brand mark only. The old "· Public signup" segment told participants
          nothing actionable — they arrive from a shared link, and the title and
          Sign-up buttons already say what the page is. "Public" was also
          ambiguous: it is true in the sense the product means it (no account,
          anyone with the link), but a reader can just as easily take it as
          "publicly listed", which these pages are not — `generateMetadata`
          above sets `robots: noindex` precisely because they are unlisted.

          `prefetch={false}`: `/` writes a `landing.viewed` activity row on
          render (src/app/page.tsx) with no rate limit of its own. Nothing
          renders it on prefetch today — that needs a `loading.tsx` in the tree
          or PPR, and the repo has neither — but this link is a one-off brand
          mark nobody races to follow, so there is no reason to leave the
          coupling in place. */}
        <div className="container-tight mb-7 text-[13px]">
          <Link
            href="/"
            prefetch={false}
            className="font-semibold tracking-tight text-ink hover:underline"
          >
            {INSTANCE_NAME}
          </Link>
        </div>
        <SignupView
          {...toSignupViewProps(sig, sig.committedBySlot)}
          locale={locale}
          mode="live"
          ownCommitments={ownCommitments}
        />
      </main>
    </>
  );
}
