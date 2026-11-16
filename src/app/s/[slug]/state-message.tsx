import { StateCard } from '@/components/state-card';
import type { CatalogLocale } from '@/i18n/config';

/**
 * The whole-page message a participant sees in place of a signup or their
 * sign-up: not published yet, archived, not found (`./not-found.tsx`,
 * `./c/[id]/not-found.tsx`), or cancelled or moved (`./c/[id]/page.tsx`). The
 * card is the shared `StateCard`; `action` is a link under the body.
 *
 * `locale` is the language the message is for, when the page knows it: the
 * signup's own, or the instance's for participants when there is no live
 * signup to ask. It marks the message with `lang`. Left out, the message reads
 * in the page's language, as on the edit and unsubscribe pages, whose reads
 * don't give the signup's language yet.
 */
export function SignupStateMessage({
  locale,
  title,
  detail,
  body,
  action,
}: {
  locale?: CatalogLocale;
  title: string;
  detail?: string;
  body: string;
  action?: { label: string; href: string };
}) {
  return (
    <main
      lang={locale}
      className="flex min-h-[100svh] flex-col items-center justify-center px-6 py-12"
    >
      <StateCard
        title={title}
        body={body}
        className="container-tight"
        {...(detail ? { detail } : {})}
      >
        {action ? (
          <a href={action.href} className="inline-block text-sm text-brand underline">
            {action.label}
          </a>
        ) : null}
      </StateCard>
    </main>
  );
}
