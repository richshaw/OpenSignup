import Link from 'next/link';

/** The card an organizer page shows when its signup can't be loaded. */
export function SignupLoadError({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-surface-sunk bg-white p-8">
      <p className="text-danger font-medium">{message}</p>
      <Link href="/app" className="text-brand text-sm underline">
        Back to dashboard
      </Link>
    </div>
  );
}
