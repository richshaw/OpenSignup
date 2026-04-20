export const metadata = { title: 'Check your email' };

export default function CheckEmailPage() {
  return (
    <main className="container-tight flex min-h-[100svh] flex-col justify-center gap-6 py-16">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Check your email</h1>
        <p className="text-ink-muted">
          We sent a sign-in link to your inbox. Click it to continue. The link expires in a few
          minutes.
        </p>
      </div>
      <p className="text-ink-soft text-sm">
        Dev: with <code className="font-mono">EMAIL_TRANSPORT=console</code>, the link is logged to
        the server console.
      </p>
    </main>
  );
}
