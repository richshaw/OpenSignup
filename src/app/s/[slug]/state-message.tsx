import { StateCard } from '@/components/state-card';

/**
 * The whole-page message a participant sees in place of a signup or their
 * sign-up: not published yet, archived, not found (`./not-found.tsx`,
 * `./c/[id]/not-found.tsx`), or cancelled or moved (`./c/[id]/page.tsx`). The
 * card is the shared `StateCard`; `action` is a link under the body.
 */
export function SignupStateMessage({
  title,
  detail,
  body,
  action,
}: {
  title: string;
  detail?: string;
  body: string;
  action?: { label: string; href: string };
}) {
  return (
    <main className="flex min-h-[100svh] flex-col items-center justify-center px-6 py-12">
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
