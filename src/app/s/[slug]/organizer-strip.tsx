import Link from 'next/link';
import { getServerTranslator } from '@/i18n/server';

/**
 * The organizer strip across the top of a signup's public page, shown only to
 * a member of its workspace (see `organizerBarSignupId`). It sits outside
 * `<main>` and is styled like the organizer app's header, so everything under
 * it is exactly what participants see. Ink links, not brand blue: brand on
 * `surface-raised` is under 4.5:1.
 *
 * Its text is the organizer's, not the participants': English until the
 * organizer app has other languages, and marked so, since the page under it
 * is in the signup's language.
 */
export function OrganizerStrip({ signupId }: { signupId: string }) {
  const t = getServerTranslator('en', 'organizer.publicPage.strip');
  return (
    <nav
      lang="en"
      aria-label={t('label')}
      className="border-b border-surface-sunk bg-surface-raised"
    >
      <div className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm sm:px-6">
        <p className="text-ink-muted">
          {t.rich('note', {
            b: (chunks) => <span className="font-medium text-ink">{chunks}</span>,
          })}
        </p>
        <div className="flex shrink-0 gap-4">
          <Link
            href={`/app/signups/${signupId}/responses`}
            className="font-medium text-ink hover:underline"
          >
            {t('responses')}
          </Link>
          <Link
            href={`/app/signups/${signupId}/build`}
            className="font-medium text-ink hover:underline"
          >
            {t('edit')}
          </Link>
        </div>
      </div>
    </nav>
  );
}
