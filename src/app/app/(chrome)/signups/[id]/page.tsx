import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db/client';
import { getOrganizerSession, toActor } from '@/auth/session';
import { publishSignup, closeSignup, updateSignup } from '@/services/signups';
import { loadSignupForOrganizer } from '@/services/signups.cached';
import { addSlot, deleteSlot } from '@/services/slots';
import { addField, deleteField } from '@/services/slot-fields';
import { listCommitmentsForSignup } from '@/services/commitments';
import { publicSignupUrl } from '@/lib/links';
import CopyLinkField from '@/components/CopyLinkField';
import { StatusPill } from '@/components/status-pill';
import { toSlug } from '@/lib/slug';
import type { SlotFieldDefinition, SlotFieldConfig } from '@/schemas/slot-fields';

type PageParams = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageParams) {
  const { id } = await params;
  const session = await getOrganizerSession();
  if (!session) return { title: 'OpenSignup' };
  const result = await loadSignupForOrganizer(toActor(session), id);
  if (!result.ok) return { title: 'OpenSignup' };
  return { title: result.value.title };
}

function describeFieldType(field: SlotFieldDefinition): string {
  if (field.fieldType === 'enum' && field.config.fieldType === 'enum') {
    return `enum (${field.config.choices.length})`;
  }
  return field.fieldType;
}

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

export default async function SignupDetailPage({ params }: PageParams) {
  const { id } = await params;
  const session = await getOrganizerSession();
  if (!session) redirect(`/login?callbackUrl=/app/signups/${id}`);
  const actor = toActor(session);
  const db = getDb();
  const result = await loadSignupForOrganizer(actor, id);
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
  const fields = sig.fields;
  const dateFieldCount = fields.filter((f) => f.fieldType === 'date').length;
  const settings = (sig.settings ?? {}) as {
    groupByFieldRefs?: string[];
    reminderFromFieldRef?: string;
  };
  const groupByRef = settings.groupByFieldRefs?.[0] ?? '';
  const reminderRef = settings.reminderFromFieldRef ?? '';

  async function addFieldAction(formData: FormData) {
    'use server';
    const s = await getOrganizerSession();
    if (!s) redirect('/login');
    const a = toActor(s);
    const label = String(formData.get('label') ?? '').trim();
    const fieldType = String(formData.get('fieldType') ?? 'text') as SlotFieldDefinition['fieldType'];
    const requiredFlag = formData.get('required') !== null;
    const choicesRaw = String(formData.get('choices') ?? '').trim();
    const ref = label ? toSlug(label, { suffix: false }) : '';

    let config: SlotFieldConfig;
    switch (fieldType) {
      case 'text':
        config = { fieldType: 'text', maxLength: 200 };
        break;
      case 'date':
        config = { fieldType: 'date' };
        break;
      case 'time':
        config = { fieldType: 'time' };
        break;
      case 'number':
        config = { fieldType: 'number' };
        break;
      case 'enum': {
        const choices = choicesRaw
          .split('\n')
          .map((c) => c.trim())
          .filter(Boolean);
        config = { fieldType: 'enum', choices };
        break;
      }
    }

    await addField(getDb(), a, id, {
      ref,
      label,
      fieldType,
      required: requiredFlag,
      config,
    });
    revalidatePath(`/app/signups/${id}`);
  }

  async function deleteFieldAction(formData: FormData) {
    'use server';
    const s = await getOrganizerSession();
    if (!s) redirect('/login');
    const a = toActor(s);
    const fieldId = String(formData.get('fieldId') ?? '');
    if (fieldId) await deleteField(getDb(), a, fieldId);
    revalidatePath(`/app/signups/${id}`);
  }

  async function updateSettingsAction(formData: FormData) {
    'use server';
    const s = await getOrganizerSession();
    if (!s) redirect('/login');
    const a = toActor(s);
    const groupBy = String(formData.get('groupByFieldRef') ?? '').trim();
    const reminder = String(formData.get('reminderFromFieldRef') ?? '').trim();
    const nextSettings: Record<string, unknown> = {
      groupByFieldRefs: groupBy ? [groupBy] : [],
    };
    if (reminder) nextSettings.reminderFromFieldRef = reminder;
    await updateSignup(getDb(), a, id, { settings: nextSettings });
    revalidatePath(`/app/signups/${id}`);
  }

  async function addSlotAction(formData: FormData) {
    'use server';
    const s = await getOrganizerSession();
    if (!s) redirect('/login');
    const a = toActor(s);
    const capacityRaw = String(formData.get('capacity') ?? '').trim();
    const capacity = capacityRaw ? Number(capacityRaw) : null;
    const values: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = formData.get(`field:${f.ref}`);
      if (raw === null) continue;
      const str = String(raw).trim();
      if (str === '') continue;
      if (f.fieldType === 'number') {
        const n = Number(str);
        if (!Number.isNaN(n)) values[f.ref] = n;
      } else {
        values[f.ref] = str;
      }
    }
    await addSlot(getDb(), a, id, { values, capacity });
    revalidatePath(`/app/signups/${id}`);
  }

  async function deleteSlotAction(formData: FormData) {
    'use server';
    const s = await getOrganizerSession();
    if (!s) redirect('/login');
    const a = toActor(s);
    const slotId = String(formData.get('slotId') ?? '');
    if (slotId) await deleteSlot(getDb(), a, slotId);
    revalidatePath(`/app/signups/${id}`);
  }

  async function publishAction() {
    'use server';
    const s = await getOrganizerSession();
    if (!s) redirect('/login');
    const a = toActor(s);
    await publishSignup(getDb(), a, id);
    revalidatePath(`/app/signups/${id}`);
  }

  async function closeAction() {
    'use server';
    const s = await getOrganizerSession();
    if (!s) redirect('/login');
    const a = toActor(s);
    await closeSignup(getDb(), a, id);
    revalidatePath(`/app/signups/${id}`);
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{sig.title}</h1>
            <StatusPill status={sig.status} />
          </div>
          <CopyLinkField url={publicUrl} />
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/app/signups/${sig.id}/preview`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-surface-sunk px-4 py-2 text-sm font-medium transition hover:bg-surface-raised"
          >
            Preview
          </Link>
          <Link
            href={`/app/signups/${sig.id}/edit`}
            className="rounded-lg border border-surface-sunk px-4 py-2 text-sm font-medium transition hover:bg-surface-raised"
          >
            Edit
          </Link>
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
        <h2 className="text-lg font-semibold">Fields</h2>
        <p className="text-ink-muted text-sm">
          Define the columns that describe each slot. Participants don&rsquo;t fill these in &mdash;
          you do, when creating slots.
        </p>
        <form
          action={addFieldAction}
          className="grid grid-cols-1 gap-3 rounded-xl border border-surface-sunk bg-white p-5 sm:grid-cols-[1fr_140px_120px_auto] sm:items-end"
        >
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Label</span>
            <input
              type="text"
              name="label"
              required
              placeholder="e.g., Date, Teacher, Subject"
              className="focus:border-brand focus:ring-brand w-full rounded-lg border border-surface-sunk px-3 py-2 focus:outline-none focus:ring-1"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Type</span>
            <select
              name="fieldType"
              defaultValue="text"
              className="focus:border-brand focus:ring-brand block min-h-[42px] w-full appearance-none rounded-lg border border-surface-sunk bg-white px-3 py-2 focus:outline-none focus:ring-1"
            >
              <option value="text">Text</option>
              <option value="date">Date</option>
              <option value="time">Time</option>
              <option value="number">Number</option>
              <option value="enum">Enum</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="required" defaultChecked /> Required
          </label>
          <button
            type="submit"
            className="bg-brand rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
          >
            Add field
          </button>
          <label className="block sm:col-span-4">
            <span className="mb-1 block text-sm font-medium">Enum choices (one per line, optional)</span>
            <textarea
              name="choices"
              rows={3}
              placeholder={'Math\nScience\nHistory'}
              className="focus:border-brand focus:ring-brand w-full rounded-lg border border-surface-sunk px-3 py-2 focus:outline-none focus:ring-1"
            />
          </label>
        </form>

        {fields.length === 0 ? (
          <p className="text-ink-muted rounded-lg border border-dashed border-surface-sunk p-6 text-center text-sm">
            Add at least one field before creating slots.
          </p>
        ) : (
          <ul className="divide-y divide-surface-sunk overflow-hidden rounded-xl border border-surface-sunk bg-white">
            {fields.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {f.label}{' '}
                    <span className="text-ink-muted font-normal">({describeFieldType(f)})</span>
                  </p>
                  <p className="text-ink-muted text-sm">
                    ref: <code>{f.ref}</code>
                    {f.required ? ' · required' : ' · optional'}
                  </p>
                </div>
                <form action={deleteFieldAction}>
                  <input type="hidden" name="fieldId" value={f.id} />
                  <button
                    type="submit"
                    className="text-danger text-sm transition hover:underline"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        {fields.length > 0 ? (
          <form
            action={updateSettingsAction}
            className="grid grid-cols-1 gap-3 rounded-xl border border-surface-sunk bg-white p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          >
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Group slots by</span>
              <select
                name="groupByFieldRef"
                defaultValue={groupByRef}
                className="focus:border-brand focus:ring-brand block min-h-[42px] w-full appearance-none rounded-lg border border-surface-sunk bg-white px-3 py-2 focus:outline-none focus:ring-1"
              >
                <option value="">No grouping</option>
                {fields.map((f) => (
                  <option key={f.id} value={f.ref}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            {dateFieldCount >= 2 ? (
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Reminder date field</span>
                <select
                  name="reminderFromFieldRef"
                  defaultValue={reminderRef}
                  className="focus:border-brand focus:ring-brand block min-h-[42px] w-full appearance-none rounded-lg border border-surface-sunk bg-white px-3 py-2 focus:outline-none focus:ring-1"
                >
                  <option value="">— select —</option>
                  {fields
                    .filter((f) => f.fieldType === 'date')
                    .map((f) => (
                      <option key={f.id} value={f.ref}>
                        {f.label}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <input type="hidden" name="reminderFromFieldRef" value={reminderRef} />
            )}
            <button
              type="submit"
              className="rounded-lg border border-surface-sunk px-4 py-2 text-sm font-medium transition hover:bg-surface-raised"
            >
              Save settings
            </button>
          </form>
        ) : null}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Slots</h2>
        {fields.length === 0 ? (
          <p className="text-ink-muted rounded-lg border border-dashed border-surface-sunk p-6 text-center text-sm">
            Add a field above before creating slots.
          </p>
        ) : (
          <form
            action={addSlotAction}
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
        )}

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
              const summary = summarizeValues(fields, (slot.values as Record<string, unknown>) ?? {});
              return (
                <li key={slot.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{summary || slot.ref}</p>
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
                  const summary = slot
                    ? summarizeValues(fields, (slot.values as Record<string, unknown>) ?? {})
                    : '';
                  return (
                    <tr key={c.id}>
                      <td className="px-4 py-3 font-medium">{c.participantName}</td>
                      <td className="text-ink-muted px-4 py-3">{c.participantEmail}</td>
                      <td className="px-4 py-3">{summary || slot?.ref || '—'}</td>
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
