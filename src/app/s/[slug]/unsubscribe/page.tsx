import { getDb } from '@/db/client';
import { previewReminderOptOut } from '@/services/reminder-optout';

export const metadata = {
  title: 'Reminder emails',
  robots: { index: false, follow: false },
};

type PageParams = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ p?: string; token?: string; done?: string }>;
};

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="container-tight flex min-h-[100svh] flex-col justify-center gap-4 py-8">
      <div className="border-surface-sunk space-y-4 rounded-xl border bg-white p-6">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {children}
      </div>
    </main>
  );
}

export default async function UnsubscribePage({ params, searchParams }: PageParams) {
  const { slug } = await params;
  const { p: participantId, token, done } = await searchParams;

  if (done) {
    return (
      <Shell title="Reminders turned off">
        <p className="text-ink-muted text-sm">
          You won&apos;t get any more reminder emails for this signup. Your slot is unchanged — if
          you also want to give it up, open the link in your confirmation email and cancel there.
        </p>
        <a href={`/s/${slug}`} className="text-brand text-sm underline">
          Back to the signup
        </a>
      </Shell>
    );
  }

  // An invalid or missing token gets a plain explanation rather than a 404:
  // the most likely visitor is a real participant whose mail client mangled
  // the link, and a "not found" would tell them nothing useful.
  if (!participantId || !token) {
    return (
      <Shell title="This link is incomplete">
        <p className="text-ink-muted text-sm">
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
        <p className="text-ink-muted text-sm">
          It may have been mangled in transit, or the signup may have been deleted. Open the link
          straight from your reminder email, or reply to the organizer to ask them to stop.
        </p>
      </Shell>
    );
  }

  const target = result.value;

  if (target.optedOut) {
    return (
      <Shell title="You're already unsubscribed">
        <p className="text-ink-muted text-sm">
          Reminders for <strong>{target.signupTitle}</strong> are already off for{' '}
          {target.participantEmail}.
        </p>
        <a href={`/s/${slug}`} className="text-brand text-sm underline">
          Back to the signup
        </a>
      </Shell>
    );
  }

  return (
    <Shell title="Stop reminder emails?">
      <p className="text-ink-muted text-sm">
        We&apos;ll stop sending {target.participantEmail} reminders for{' '}
        <strong>{target.signupTitle}</strong>. This only affects this signup, and your slot stays
        as it is.
      </p>
      {/* A POST, so a link scanner following the URL can't unsubscribe anyone. */}
      <form action="/api/public/reminder-optout" method="post" className="flex gap-3">
        <input type="hidden" name="p" value={target.participantId} />
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="bg-brand rounded-lg px-5 py-2 font-medium text-white transition hover:brightness-110"
        >
          Stop reminders
        </button>
        <a
          href={`/s/${slug}`}
          className="border-surface-sunk rounded-lg border px-5 py-2 font-medium transition hover:bg-surface-sunk/40"
        >
          Keep them
        </a>
      </form>
    </Shell>
  );
}
