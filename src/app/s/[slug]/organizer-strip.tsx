import Link from 'next/link';

/**
 * The organizer strip across the top of a signup's public page, shown only to
 * a member of its workspace (see `organizerBarSignupId`). It sits outside
 * `<main>` and is styled like the organizer app's header, so everything under
 * it is exactly what participants see. Ink links, not brand blue: brand on
 * `surface-raised` is under 4.5:1.
 */
export function OrganizerStrip({ signupId }: { signupId: string }) {
  return (
    <nav aria-label="Organizer" className="border-b border-surface-sunk bg-surface-raised">
      <div className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm sm:px-6">
        <p className="text-ink-muted">
          <span className="font-medium text-ink">Your signup.</span> Only organizers see this bar.
        </p>
        <div className="flex shrink-0 gap-4">
          <Link
            href={`/app/signups/${signupId}/responses`}
            className="font-medium text-ink hover:underline"
          >
            See responses
          </Link>
          <Link
            href={`/app/signups/${signupId}/build`}
            className="font-medium text-ink hover:underline"
          >
            Edit signup
          </Link>
        </div>
      </div>
    </nav>
  );
}
