import { redirect } from 'next/navigation';
import { signIn } from '@/auth/config';
import { getOrganizerSession } from '@/auth/session';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const session = await getOrganizerSession();
  if (session) redirect(params.callbackUrl ?? '/app');

  async function handle(formData: FormData) {
    'use server';
    const email = String(formData.get('email') ?? '').trim();
    if (!email) return;
    await signIn('nodemailer', {
      email,
      redirectTo: '/app',
    });
  }

  return (
    <main className="container-tight flex min-h-[100svh] flex-col justify-center gap-8 py-16">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Sign in to Signup</h1>
        <p className="text-ink-muted">
          Enter your email and we&apos;ll send you a magic link. No passwords.
        </p>
      </div>
      <form action={handle} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            inputMode="email"
            className="focus:border-brand focus:ring-brand w-full rounded-lg border border-surface-sunk bg-white px-4 py-3 text-base shadow-sm transition focus:outline-none focus:ring-1"
            placeholder="you@example.com"
          />
        </label>
        <button
          type="submit"
          className="bg-brand w-full rounded-lg px-5 py-3 font-medium text-white transition hover:brightness-110"
        >
          Send magic link
        </button>
        {params.error ? (
          <p className="text-danger text-sm" role="alert">
            Something went wrong. Try again.
          </p>
        ) : null}
      </form>
    </main>
  );
}
