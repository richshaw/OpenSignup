/**
 * The whole-page message a participant sees in place of a signup or their
 * sign-up: not published yet, archived, or not found (`./not-found.tsx`,
 * `./c/[id]/not-found.tsx`). One card, so the states can't drift.
 */
export function SignupStateMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-[100svh] flex-col items-center justify-center px-6 py-12">
      <div className="container-tight w-full space-y-3 rounded-xl border border-surface-sunk bg-white p-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-ink-muted">{body}</p>
      </div>
    </main>
  );
}
