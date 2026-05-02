import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { getDb } from '@/db/client';
import { getOrganizerSession, toActor } from '@/auth/session';
import { loadSignupForOrganizer } from '@/services/signups.cached';
import { listCommitmentsForSignup } from '@/services/commitments';
import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import { addSlotAction, deleteSlotAction } from '../actions';

type PageParams = { params: Promise<{ id: string }> };

function summarizeValues(
  fields: SlotFieldDefinition[],
  values: Record<string, unknown>,
): string {
  const parts: string[] = [];
  for (const f of fields) {
    const v = values[f.ref];
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${f.label}: ${String(v)}`);
  }
  return parts.join(' · ');
}

export default async function SlotsTab({ params }: PageParams) {
  const { id } = await params;
  const session = await getOrganizerSession();
  if (!session) redirect(`/login?callbackUrl=/app/signups/${id}/slots`);
  const result = await loadSignupForOrganizer(toActor(session), id);
  if (!result.ok) return null;
  const sig = result.value;
  const fields = sig.fields;
  const commitments = await listCommitmentsForSignup(getDb(), id);

  if (fields.length === 0) {
    return (
      <section className="space-y-4">
        <p className="text-ink-muted text-sm">
          Each slot is a thing people can sign up for. Capacity caps how many people can claim it.
        </p>
        <div className="rounded-xl border border-surface-sunk bg-white p-10 text-center">
          <h3 className="text-base font-semibold">Define what a slot looks like first</h3>
          <p className="text-ink-muted mx-auto mt-2 max-w-md text-sm">
            A slot is a row of values: a date, a role, an item. Add at least one field so we know
            what to ask you for.
          </p>
          <Link
            href={`/app/signups/${id}/fields`}
            className="bg-brand mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
          >
            <Plus size={16} aria-hidden="true" />
            Add a field
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <p className="text-ink-muted max-w-2xl text-sm">
        Each slot is a thing people can sign up for. Capacity caps how many people can claim it.
      </p>
      <form
        action={addSlotAction.bind(null, id)}
        className="grid grid-cols-1 gap-3 rounded-xl border border-surface-sunk bg-white p-5 sm:grid-cols-2 sm:items-end"
      >
        {fields.map((f) => {
          const inputBase =
            'focus:border-brand focus:ring-brand block min-h-[42px] w-full appearance-none rounded-lg border border-surface-sunk bg-white px-3 py-2 focus:outline-none focus:ring-1';
          const inputName = `field:${f.ref}`;
          const labelEl = (
            <span className="mb-1 block text-sm font-medium">
              {f.label}
              {f.required ? '' : ' (optional)'}
            </span>
          );
          if (f.fieldType === 'enum' && f.config.fieldType === 'enum') {
            return (
              <label key={f.id} className="block">
                {labelEl}
                <select name={inputName} className={inputBase} {...(f.required ? { required: true } : {})}>
                  <option value="">—</option>
                  {f.config.choices.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            );
          }
          const inputType =
            f.fieldType === 'date'
              ? 'date'
              : f.fieldType === 'time'
                ? 'time'
                : f.fieldType === 'number'
                  ? 'number'
                  : 'text';
          return (
            <label key={f.id} className="block">
              {labelEl}
              <input
                type={inputType}
                name={inputName}
                {...(f.required ? { required: true } : {})}
                className={inputBase}
              />
            </label>
          );
        })}
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Capacity (optional)</span>
          <input
            type="number"
            name="capacity"
            min={1}
            className="focus:border-brand focus:ring-brand block min-h-[42px] w-full appearance-none rounded-lg border border-surface-sunk bg-white px-3 py-2 focus:outline-none focus:ring-1"
          />
        </label>
        <button
          type="submit"
          className="bg-brand rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 sm:col-span-2 sm:justify-self-start"
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
            const activeQty = commitments
              .filter(
                (c) => c.slotId === slot.id && (c.status === 'confirmed' || c.status === 'tentative'),
              )
              .reduce((acc, c) => acc + c.quantity, 0);
            const summary = summarizeValues(fields, (slot.values as Record<string, unknown>) ?? {});
            return (
              <li key={slot.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{summary || slot.ref}</p>
                  <p className="text-ink-muted text-sm">
                    {slot.slotAt ? new Date(slot.slotAt).toLocaleDateString() : '—'} ·{' '}
                    {activeQty}
                    {slot.capacity ? `/${slot.capacity}` : ''} signed up
                  </p>
                </div>
                <form action={deleteSlotAction.bind(null, id)}>
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
  );
}
