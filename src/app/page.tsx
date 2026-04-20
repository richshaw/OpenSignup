import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="container-tight flex min-h-[100svh] flex-col justify-center gap-8 py-16">
      <div className="space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Signup</h1>
        <p className="text-ink-muted text-lg">
          Ad-free, open-source coordination for school parents, coaches, and community organizers.
          A calm, modern way to coordinate sign-ups.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="bg-brand inline-flex items-center rounded-lg px-5 py-3 font-medium text-white transition hover:brightness-110"
        >
          Organizer sign in
        </Link>
        <a
          href="https://github.com/richardshaw/signup"
          className="text-ink-muted hover:text-ink inline-flex items-center rounded-lg border border-surface-sunk px-5 py-3 font-medium transition"
        >
          View source
        </a>
      </div>
      <p className="text-ink-soft pt-8 text-sm">
        v{process.env.npm_package_version ?? '0.1.0'} · AGPL-3.0 · Built for real community groups.
      </p>
    </main>
  );
}
