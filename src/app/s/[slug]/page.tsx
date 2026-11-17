import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound, permanentRedirect } from 'next/navigation';
import { getOrganizerSession, toActor } from '@/auth/session';
import { getDb } from '@/db/client';
import { type CatalogLocale, openGraphLocale } from '@/i18n/config';
import { getServerTranslator } from '@/i18n/server';
import { localeOfOrganizer, localeOfSignup } from '@/i18n/locale';
import { ServiceException } from '@/lib/errors';
import { commitmentEditUrl } from '@/lib/links';
import { COMMIT_COOKIE_NAME, parseReturningCommits } from '@/lib/returning-participant';
import { shortenToLimit } from '@/lib/shorten';
import { INSTANCE_NAME } from '@/lib/site-config';
import { trimSlugTail } from '@/lib/slug';
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

// The tab title, with the site name after it. Next applies the root layout's
// title template only to the segments below the layout's own, and this page
// shares its segment with that layout (./layout.tsx), so it writes the site
// name in itself, the way the template does for every other page.
const tabTitle = (title: string) => ({ absolute: `${title} · ${INSTANCE_NAME}` });

/**
 * Sends a link with punctuation after its slug ("…/s/team-snacks-a7vc8.", as
 * some apps take a sentence's full stop into the link) to the signup's own
 * address, before anything looks the slug up. Next may hand the slug over
 * still percent-encoded ("…" as %E2%80%A6), so it's decoded first. A slug
 * that trims to nothing is left to the not-found page.
 */
function redirectPunctuatedSlug(slug: string): void {
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    // A malformed escape: not a slug, so the lookup below finds nothing.
  }
  const trimmed = trimSlugTail(decoded);
  if (trimmed && trimmed !== slug) permanentRedirect(`/s/${trimmed}`);
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug } = await params;
  redirectPunctuatedSlug(slug);
  const result = await loadPublicSignup(slug);
  // Private share links: keep these out of the search index. They stay
  // crawlable (not robots-disallowed) so the noindex directive is honored.
  const robots = { index: false, follow: false } as const;
  if (!result.ok) {
    const t = getServerTranslator(await signupLocaleForSlug(slug), 'participant.signupPage');
    return { title: tabTitle(t('title')), robots };
  }
  const sig = result.value;
  const locale = localeOfSignup(sig.settings.locale);
  const t = getServerTranslator(locale, 'participant.signupPage');
  // Trimmed for a description saved as only spaces before the schema trimmed it.
  const text = sig.description.trim();
  const description = text
    ? shortenToLimit(text, 200)
    : t('description', { instance: INSTANCE_NAME });
  return {
    title: tabTitle(sig.title),
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
 * with the organizer app's language for them (`localeOfOrganizer`), so
 * its own organizer gets a note in their language and a way back to it; null
 * for everyone else, who sees the visitor message. Only the draft branch
 * asks, so an open signup's page never pays for this read.
 */
async function ownDraft(slug: string): Promise<{ id: string; locale: CatalogLocale } | null> {
  const session = await getOrganizerSession();
  const actor = toActor(session);
  if (!session || actor.kind !== 'organizer') return null;
  try {
    const found = await findDraftForOrganizer(getDb(), actor, slug);
    return found.ok ? { id: found.value.id, locale: localeOfOrganizer(session) } : null;
  } catch (e) {
    // Another workspace's draft: the guard refuses, and they're a visitor here.
    if (e instanceof ServiceException) return null;
    throw e;
  }
}

export default async function PublicSignupPage({ params }: PageParams) {
  const { slug } = await params;
  redirectPunctuatedSlug(slug);
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
      const draft = await ownDraft(slug);
      if (draft) {
        // Its own organizer's note: organizer text, so in the organizer
        // app's language for them, and marked so. It quotes the title
        // visitors see, in the signup's language.
        const own = getServerTranslator(draft.locale, 'organizer.publicPage.ownDraft');
        return (
          <SignupStateMessage
            locale={draft.locale}
            title={own('title')}
            body={own('body', { title: t('draft.title') })}
            action={{ label: own('open'), href: `/app/signups/${draft.id}/build` }}
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
  const locale = localeOfSignup(sig.settings.locale);

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
  // The strip is the organizer's, in the organizer app's language for them:
  // from the session just read, so it costs no statement.
  const strip =
    session && organizerSignupId ? (
      <OrganizerStrip signupId={organizerSignupId} locale={localeOfOrganizer(session)} />
    ) : null;
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
      {strip}
      <main lang={locale} className="flex min-h-[100svh] flex-col pb-24 pt-10 sm:pt-14">
        {/* Brand mark only. The old "· Public signup" segment told participants
          nothing actionable — they arrive from a shared link, and the title and
          Sign-up buttons already say what the page is. "Public" was also
          ambiguous: it is true in the sense the product means it (no account,
          anyone with the link), but a reader can just as easily take it as
          "publicly listed", which these pages are not — `generateMetadata`
          above sets `robots: noindex` precisely because they are unlisted.

          `prefetch={false}`: `/` writes a `landing.viewed` activity row on
          render (src/app/(site)/page.tsx) with no rate limit of its own. Nothing
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
