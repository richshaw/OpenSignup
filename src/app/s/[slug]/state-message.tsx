/**
 * The whole-page message a participant sees in place of a signup or their
 * sign-up: not published yet, archived, not found (`./not-found.tsx`,
 * `./c/[id]/not-found.tsx`), or cancelled or moved (`./c/[id]/page.tsx`). One
 * card, so the states can't drift. `action` is a link under the body.
 */
export function SignupStateMessage({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; href: string };
}) {
  return (
    <main className="flex min-h-[100svh] flex-col items-center justify-center px-6 py-12">
      <div className="container-tight w-full space-y-3 rounded-xl border border-surface-sunk bg-white p-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-ink-muted">{body}</p>
        {action ? (
          <a href={action.href} className="inline-block text-sm text-brand underline">
            {action.label}
          </a>
        ) : null}
      </div>
    </main>
  );
}
