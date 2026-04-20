import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db/client';
import { getOrganizerSession, toActor } from '@/auth/session';
import { getSignupForOrganizer, publishSignup, closeSignup } from '@/services/signups';
import { addSlot, deleteSlot } from '@/services/slots';
import { listCommitmentsForSignup } from '@/services/commitments';
import { publicSignupUrl } from '@/lib/links';

export const metadata = { title: 'Signup' };

type PageParams = { params: Promise<{ id: string }> };

export default async function SignupDetailPage({ params }: PageParams) {
  const { id } = await params;
  const session = await getOrganizerSession();
  if (!session) redirect(`/login?callbackUrl=/app/signups/${id}`);
  const actor = toActor(session);
  const db = getDb();
  const result = await getSignupForOrganizer(db, actor, id);
  if (!result.ok) {
    return (
      <div className="rounded-xl border border-surface-sunk bg-white p-8">
        <p className="text-danger font-medium">{result.error.message}</p>
        <Link href="/app" className="text-brand text-sm underline">
          Back to dashboard
        </Link>
      </div>
    );
  }
  const sig = result.value;
  const commitments = await listCommitmentsForSignup(db, id);
  const publicUrl = publicSignupUrl(sig.slug);

  async function addSlotAction(formData: FormData) {
    'use server';
    const s = await getOrganizerSession();
    if (!s) redirect('/login');
    const actor = toActor(s);
    const title = String(formData.get('title') ?? '').trim();
    const capacityRaw = String(formData.get('capacity') ?? '').trim();
    const dateRaw = String(formData.get('date') ?? '').trim();
    const capacity = capacityRaw ? Number(capacityRaw) : null;
    await addSlot(getDb(), actor, id, {
      title,
      description: '',
      slotType: dateRaw ? 'date' : 'generic',
      capacity,
      data: dateRaw ? { date: dateRaw } : {},
    });
    revalidatePath(`/app/signups/${id}`);
  }

  async function deleteSlotAction(formData: FormData) {
    'use server';
    const s = await getOrganizerSession();
    if (!s) redirect('/login');
    const actor = toActor(s);
    const slotId = String(formData.get('slotId') ?? '');
    if (slotId) await deleteSlot(getDb(), actor, slotId);
    revalidatePath(`/app/signups/${id}`);
  }

  async function publishAction() {
    'use server';
    const s = await getOrganizerSession();
    if (!s) redirect('/login');
    const actor = toActor(s);
    await publishSignup(getDb(), actor, id);
    revalidatePath(`/app/signups/${id}`);
  }

  async function closeAction() {
    'use server';
    const s = await getOrganizerSession();
    if (!s) redirect('/login');
    const actor = toActor(s);
    await closeSignup(getDb(), actor, id);
    revalidatePath(`/app/signups/${id}`);
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/app" className="text-ink-muted text-sm hover:underline">
            ← All signups
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{sig.title}</h1>
          <p className="text-ink-muted truncate text-sm">
            <a href={publicUrl} className="underline" target="_blank" rel="noreferrer">
              {publicUrl}
            </a>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              sig.status === 'open'
                ? 'bg-success/10 text-success'
                : sig.status === 'draft'
                  ? 'bg-warn/10 text-warn'
                  : 'bg-ink-soft/10 text-ink-muted'
            }`}
          >
            {sig.status}
          </span>
          {sig.status === 'draft' ? (
            <form action={publishAction}>
              <button
                type="submit"
                className="bg-brand rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
              >
                Publish
              </button>
            </form>
          ) : sig.status === 'open' ? (
            <form action={closeAction}>
              <button
                type="submit"
                className="rounded-lg border border-surface-sunk px-4 py-2 text-sm font-medium transition hover:bg-surface-raised"
              >
                Close
              </button>
            </form>
          ) : null}
          <Link
            href={`/api/signups/${sig.id}/export.csv`}
            className="rounded-lg border border-surface-sunk px-4 py-2 text-sm font-medium transition hover:bg-surface-raised"
          >
            Export CSV
          </Link>
        </div>
      </header>

      {sig.description ? (
        <p className="text-ink-muted max-w-2xl">{sig.description}</p>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Slots</h2>
        <form
          action={addSlotAction}
          className="grid grid-cols-1 gap-3 rounded-xl border border-surface-sunk bg-white p-5 sm:grid-cols-[1fr_160px_120px_auto]"
        >
          <input
            type="text"
            name="title"
            required
            placeholder="Slot title (e.g., Week 1 snack)"
            className="focus:border-brand focus:ring-brand w-full rounded-lg border border-surface-sunk px-3 py-2 focus:outline-none focus:ring-1"
          />
          <input
            type="date"
            name="date"
            className="focus:border-brand focus:ring-brand w-full rounded-lg border border-surface-sunk px-3 py-2 focus:outline-none focus:ring-1"
          />
          <input
            type="number"
            name="capacity"
            min={1}
            placeholder="Cap"
            className="focus:border-brand focus:ring-brand w-full rounded-lg border border-surface-sunk px-3 py-2 focus:outline-none focus:ring-1"
          />
          <button
            type="submit"
            className="bg-brand rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
          >
            Add slot
          </button>
        </form>

        {sig.slots.length === 0 ? (
          <p className="text-ink-muted rounded-lg border border-dashed border-surface-sunk p-6 text-center text-sm">
            Add at least one slot before publishing.
          </p>
        ) : (
          <ul className="divide-y divide-surface-sunk overflow-hidden rounded-xl border border-surface-sunk bg-white">
            {sig.slots.map((slot) => {
              const active = commitments.filter(
                (c) => c.slotId === slot.id && (c.status === 'confirmed' || c.status === 'tentative'),
              );
              return (
                <li key={slot.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{slot.title}</p>
                    <p className="text-ink-muted text-sm">
                      {slot.slotAt ? new Date(slot.slotAt).toLocaleDateString() : '—'} ·{' '}
                      {active.length}
                      {slot.capacity ? `/${slot.capacity}` : ''} signed up
                    </p>
                  </div>
                  <form action={deleteSlotAction}>
                    <input type="hidden" name="slotId" value={slot.id} />
                    <button
                      type="submit"
                      className="text-danger text-sm transition hover:underline"
                    >
                      Remove
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Commitments ({commitments.length})</h2>
        {commitments.length === 0 ? (
          <p className="text-ink-muted rounded-lg border border-dashed border-surface-sunk p-6 text-center text-sm">
            No signups yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-surface-sunk bg-white">
            <table className="w-full text-sm">
              <thead className="bg-surface-raised text-ink-muted">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Slot</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-sunk">
                {commitments.map((c) => {
                  const slot = sig.slots.find((s) => s.id === c.slotId);
                  return (
                    <tr key={c.id}>
                      <td className="px-4 py-3 font-medium">{c.participantName}</td>
                      <td className="text-ink-muted px-4 py-3">{c.participantEmail}</td>
                      <td className="px-4 py-3">{slot?.title ?? '—'}</td>
                      <td className="px-4 py-3">{c.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
