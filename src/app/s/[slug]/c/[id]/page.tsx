import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { after } from 'next/server';
import { Banner } from '@/components/banner';
import { getDb } from '@/db/client';
import {
  ACTIVE_COMMITMENT_STATUSES,
  cancelledCommitmentState,
  editLimitsForCommitment,
  getOwnCommitment,
} from '@/services/commitments';
import { commitmentEditUrl } from '@/lib/links';
import { editTokenFor } from '@/lib/token';
import { readRequestSignals, recordEditLinkFollowed } from '@/lib/view-tracker';
import { CANCELLED_PAGE } from '../../cancelled-message';
import { SignupStateMessage } from '../../state-message';
import EditForm from './edit-form';

export const metadata = { title: 'Your signup', robots: { index: false, follow: false } };

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
    redirect(`/s/${c.signupSlug}/c/${encodeURIComponent(c.id)}?token=${encodeURIComponent(token)}`);
  }

  // Read headers in the request context — `after(...)` runs outside it and
  // Next.js 15 forbids dynamic APIs (headers/cookies) inside the callback.
  // Recorded for a cancelled sign-up too: the link was still followed.
  const signals = readRequestSignals(await headers());
  after(() =>
    recordEditLinkFollowed({
      signupId: c.signupId,
      workspaceId: c.workspaceId,
      commitmentId: c.id,
      participantId: c.participantId,
      signals,
    }),
  );

  // The link in the confirmation email never changes, so people follow it
  // after a cancel too. The token shows the sign-up is theirs, so there is
  // nothing to hide, and the form would only fail: a save is refused and a
  // cancel changes nothing.
  if (c.status === 'cancelled') {
    const state = await cancelledCommitmentState(getDb(), c);
    if (state.movedTo !== null) {
      // Its token is derived from its id, as the reminder email's is. Only
      // the holder of this link could have made the move, so linking them to
      // the sign-up it made gives nothing away.
      return (
        <SignupStateMessage
          {...CANCELLED_PAGE.moved}
          action={{
            label: 'See your sign-up',
            href: commitmentEditUrl(slug, state.movedTo, editTokenFor(state.movedTo)),
          }}
        />
      );
    }
    return (
      <SignupStateMessage
        {...(state.removed ? CANCELLED_PAGE.removed : CANCELLED_PAGE[state.slot])}
        action={{ label: 'Back to the signup', href: `/s/${slug}` }}
      />
    );
  }
  // `no_show`, which nothing writes yet: the form can't act on it and no
  // message here fits, so it gets the not-found page.
  if (!ACTIVE_COMMITMENT_STATUSES.includes(c.status)) notFound();

  const { maxQuantity, closed } = await editLimitsForCommitment(getDb(), c);

  return (
    <main className="container-tight flex min-h-[100svh] flex-col gap-6 py-8">
      <header className="space-y-1">
        <a href={`/s/${slug}`} className="text-ink-muted text-sm hover:underline">
          ← Back to signup
        </a>
        <h1 className="text-2xl font-semibold tracking-tight">Your signup</h1>
        <p className="text-ink-muted text-sm">
          You&apos;re editing this as {c.participantName} ({c.participantEmail}).
        </p>
      </header>
      {/* The organizer closed the signup or the slot, or its time has come.
          The form still works for everything but taking more spots. */}
      {closed ? (
        <Banner
          kind="closed"
          title="Sign-ups have closed"
          body="You can't add more spots now, but you can still change your details, give spots back, or cancel."
        />
      ) : null}
      <EditForm
        commitmentId={c.id}
        token={token}
        initialName={c.participantName}
        initialNotes={c.notes}
        initialQuantity={c.quantity}
        maxQuantity={maxQuantity}
        slug={slug}
      />
    </main>
  );
}
