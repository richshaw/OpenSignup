import Link from 'next/link';
import type { CatalogLocale } from '@/i18n/config';
import { getServerTranslator } from '@/i18n/server';
import { signupTabPath } from '@/lib/organizer-paths';

/**
 * The organizer strip across the top of a signup's public page, shown only to
 * a member of its workspace (see `organizerBarSignupId`). It sits outside
 * `<main>` and is styled like the organizer app's header, so everything under
 * it is exactly what participants see. Ink links, not brand blue: brand on
 * `surface-raised` is under 4.5:1.
 *
 * Its text is the organizer's, not the participants': in `locale`, the
 * organizer app's language for this organizer (`localeOfOrganizer`), and
 * marked so, since the page under it is in the signup's language.
 */
export function OrganizerStrip({ signupId, locale }: { signupId: string; locale: CatalogLocale }) {
  const t = getServerTranslator(locale, 'organizer.publicPage.strip');
  return (
    <nav
      lang={locale}
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
            href={signupTabPath(signupId, 'responses')}
            className="font-medium text-ink hover:underline"
          >
            {t('responses')}
          </Link>
          <Link
            href={signupTabPath(signupId, 'build')}
            className="font-medium text-ink hover:underline"
          >
            {t('edit')}
          </Link>
        </div>
      </div>
    </nav>
  );
}
