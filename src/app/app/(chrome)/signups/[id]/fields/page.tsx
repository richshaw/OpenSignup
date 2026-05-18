import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { getOrganizerSession, toActor } from '@/auth/session';
import { loadSignupForOrganizer } from '@/services/signups.cached';
import { fieldEnumChoices, fieldTypeLabel } from '@/lib/field-labels';
import { AsyncSubmitButton } from '@/components/ui/async-submit-button';
import { recordOrganizerView } from '@/lib/view-tracker';
import AddFieldForm from '../add-field-form';
import { addFieldAction, deleteFieldAction, updateSettingsAction } from '../actions';

type PageParams = { params: Promise<{ id: string }> };

export default async function FieldsTab({ params }: PageParams) {
  const { id } = await params;
  const session = await getOrganizerSession();
  if (!session) redirect(`/login?callbackUrl=/app/signups/${id}/fields`);
  const result = await loadSignupForOrganizer(toActor(session), id);
  if (!result.ok) return null;
  const sig = result.value;
  after(() =>
    recordOrganizerView({
      actor: { actorId: session.organizerId, actorType: 'organizer' },
      signupId: sig.id,
      workspaceId: sig.workspaceId,
      eventType: 'signup.editor_opened',
      payload: { section: 'fields' },
    }),
  );
  const fields = sig.fields;
  const dateFieldCount = fields.filter((f) => f.fieldType === 'date').length;
  const settings = (sig.settings ?? {}) as {
    groupByFieldRefs?: string[];
    reminderFromFieldRef?: string;
  };
  const groupByRef = settings.groupByFieldRefs?.[0] ?? '';
  const reminderRef = settings.reminderFromFieldRef ?? '';

  return (
    <section className="space-y-4">
      <p className="text-ink-muted text-sm">
        Define the columns that describe each slot. Participants don&rsquo;t fill these in, you do,
        when creating slots.
      </p>
      <AddFieldForm action={addFieldAction.bind(null, id)} />

      {fields.length === 0 ? (
        <p className="text-ink-muted rounded-lg border border-dashed border-surface-sunk p-6 text-center text-sm">
          Add at least one field before creating slots.
        </p>
      ) : (
        <ul className="divide-y divide-surface-sunk overflow-hidden rounded-xl border border-surface-sunk bg-white">
          {fields.map((f) => {
            const choices = fieldEnumChoices(f);
            return (
              <li key={f.id} className="flex items-start justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">{f.label}</span>
                    <span className="text-ink-muted text-sm">{fieldTypeLabel(f)}</span>
                  </p>
                  {choices ? (
                    <p className="text-ink-muted mt-1 text-sm">
                      Options: <span className="text-ink">{choices.join(', ')}</span>
                    </p>
                  ) : null}
                </div>
                <form action={deleteFieldAction.bind(null, id)}>
                  <input type="hidden" name="fieldId" value={f.id} />
                  <AsyncSubmitButton
                    loadingLabel="Removing…"
                    className="text-danger text-sm transition hover:underline disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    Remove
                  </AsyncSubmitButton>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      {fields.length > 0 ? (
        <form
          action={updateSettingsAction.bind(null, id)}
          className="grid grid-cols-1 gap-3 rounded-xl border border-surface-sunk bg-white p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        >
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Group slots by</span>
            <select
              key={`groupBy:${groupByRef}`}
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
                key={`reminder:${reminderRef}`}
                name="reminderFromFieldRef"
                defaultValue={reminderRef}
                className="focus:border-brand focus:ring-brand block min-h-[42px] w-full appearance-none rounded-lg border border-surface-sunk bg-white px-3 py-2 focus:outline-none focus:ring-1"
              >
                <option value="">Select a field…</option>
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
          <AsyncSubmitButton
            loadingLabel="Saving…"
            className="hover:bg-surface-raised rounded-lg border border-surface-sunk px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-70"
          >
            Save settings
          </AsyncSubmitButton>
        </form>
      ) : null}
    </section>
  );
}
