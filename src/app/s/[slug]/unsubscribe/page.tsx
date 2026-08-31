import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { previewReminderOptOut } from '@/services/reminder-optout';

export const metadata = {
  title: 'Reminder emails',
  robots: { index: false, follow: false },
};

type PageParams = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ p?: string; token?: string; done?: 'on' | 'off'; error?: string }>;
};

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="container-tight flex min-h-[100svh] flex-col justify-center gap-4 py-8">
      <div className="space-y-4 rounded-xl border border-surface-sunk bg-white p-6">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
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
    // and a "not found" would tell them nothing useful.
    return (
      <Shell title="This link is incomplete">
        <p className="text-sm text-ink-muted">
          Unsubscribe links only work in full. Open the link straight from your reminder email, or
          reply to the organizer to ask them to stop.
        </p>
      </Shell>
    );
  }

  const result = await previewReminderOptOut(getDb(), participantId, token);
  if (!result.ok) {
    return (
      <Shell title="This link isn't valid">
        <p className="text-sm text-ink-muted">
          It may have been mangled in transit, or the signup may have been deleted. Open the link
          straight from your reminder email, or reply to the organizer to ask them to stop.
        </p>
      </Shell>
    );
  }

  const target = result.value;

  // The slug is decoration — the token alone identifies the participant — so a
  // wrong one would otherwise show the real signup's title and the
  // participant's email address under an unrelated signup's URL. Send them to
  // the canonical address instead of rendering the misleading one.
  if (slug !== target.signupSlug) {
    redirect(
      `/s/${target.signupSlug}/unsubscribe?p=${encodeURIComponent(participantId)}&token=${encodeURIComponent(token)}`,
    );
  }

  const credentials = (
    <>
      <input type="hidden" name="p" value={target.participantId} />
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="slug" value={target.signupSlug} />
    </>
  );

  if (target.optedOut) {
    return (
      <Shell title={done === 'off' ? 'Reminders turned off' : "You're already unsubscribed"}>
        <p className="text-sm text-ink-muted">
          {done === 'off' ? (
            <>
              You won&apos;t get any more reminder emails for <strong>{target.signupTitle}</strong>.
              Your slot is unchanged — if you also want to give it up, open the link in your
              confirmation email and cancel there.
            </>
          ) : (
            <>
              Reminders for <strong>{target.signupTitle}</strong> are already off for{' '}
              {target.participantEmail}.
            </>
          )}
        </p>
        {/*
          Reminders are per-participant and the row is reused, so without a way
          back someone who unsubscribes from this signup in September and signs
          up again in November silently gets nothing.
        */}
        <form
          action="/api/public/reminder-optout"
          method="post"
          className="flex items-center gap-3"
        >
          {credentials}
          <input type="hidden" name="action" value="start" />
          <button type="submit" className="text-sm text-brand underline">
            Turn reminders back on
          </button>
        </form>
        <a href={`/s/${target.signupSlug}`} className="text-sm text-brand underline">
          Back to the signup
        </a>
      </Shell>
    );
  }

  return (
    <Shell title={done === 'on' ? 'Reminders turned back on' : 'Stop reminder emails?'}>
      {error ? (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          That didn&apos;t work — nothing has changed. Try again below.
        </p>
      ) : null}
      <p className="text-sm text-ink-muted">
        {done === 'on' ? (
          <>
            You&apos;ll get reminders for <strong>{target.signupTitle}</strong> again at{' '}
            {target.participantEmail}. You can stop them any time from the link in one.
          </>
        ) : (
          <>
            We&apos;ll stop sending {target.participantEmail} reminders for{' '}
            <strong>{target.signupTitle}</strong>. This only affects this signup, and your slot
            stays as it is.
          </>
        )}
      </p>
      {/* A POST, so a link scanner following the URL can't unsubscribe anyone. */}
      <form action="/api/public/reminder-optout" method="post" className="flex gap-3">
        {credentials}
        <button
          type="submit"
          className="rounded-lg bg-brand px-5 py-2 font-medium text-white transition hover:brightness-110"
        >
          Stop reminders
        </button>
        <a
          href={`/s/${target.signupSlug}`}
          className="rounded-lg border border-surface-sunk px-5 py-2 font-medium transition hover:bg-surface-sunk/40"
        >
          Keep them
        </a>
      </form>
    </Shell>
  );
}
