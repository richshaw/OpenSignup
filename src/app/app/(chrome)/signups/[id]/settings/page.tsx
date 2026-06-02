import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { getOrganizerSession, toActor } from '@/auth/session';
import { loadSignupForOrganizer } from '@/services/signups.cached';
import { AsyncSubmitButton } from '@/components/ui/async-submit-button';
import { recordOrganizerView } from '@/lib/view-tracker';
import { SignupSettingsSchema } from '@/schemas/signups';
import { updateReminderAction } from '../actions';
import { DeleteSignupForm } from './delete-signup-form';

type PageParams = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function SettingsTab({ params, searchParams }: PageParams) {
  const { id } = await params;
  const { error } = await searchParams;
  const session = await getOrganizerSession();
  if (!session) redirect(`/login?callbackUrl=/app/signups/${id}/settings`);
  const result = await loadSignupForOrganizer(toActor(session), id);
  if (!result.ok) return null;
  const sig = result.value;
  after(() =>
    recordOrganizerView({
      actor: { actorId: session.organizerId, actorType: 'organizer' },
      signupId: sig.id,
      workspaceId: sig.workspaceId,
      eventType: 'signup.editor_opened',
      payload: { section: 'settings' },
    }),
  );

  const parsedSettings = SignupSettingsSchema.safeParse(sig.settings ?? {});
  const reminderRef = parsedSettings.success ? (parsedSettings.data.reminderFromFieldRef ?? '') : '';

  return (
    <section className="max-w-2xl space-y-6">
      {error ? (
        <p role="alert" className="bg-danger/10 text-danger rounded-lg px-3 py-2 text-sm">{error}</p>
      ) : null}
      {sig.fields.some((f) => f.fieldType === 'date') && (
        <form
          action={updateReminderAction.bind(null, id)}
          className="space-y-4 rounded-xl border border-surface-sunk bg-white p-6"
        >
          <div>
            <h2 className="text-sm font-semibold">Reminders</h2>
            <p className="text-ink-muted mt-1 text-sm">
              Send participants a reminder email before their slot.
            </p>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Reminder date field</span>
            <select
              name="reminderFromFieldRef"
              defaultValue={reminderRef}
              className="focus:border-brand focus:ring-brand block min-h-[42px] w-full appearance-none rounded-lg border border-surface-sunk bg-white px-3 py-2 focus:outline-none focus:ring-1"
            >
              <option value="">— No reminder —</option>
              {sig.fields
                .filter((f) => f.fieldType === 'date')
                .map((f) => (
                  <option key={f.id} value={f.ref}>{f.label}</option>
                ))}
            </select>
          </label>
          <div className="flex justify-end">
            <AsyncSubmitButton
              loadingLabel="Saving…"
              className="bg-brand rounded-lg px-5 py-2 font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:brightness-90"
            >
              Save
            </AsyncSubmitButton>
          </div>
        </form>
      )}
      <section
        aria-labelledby="danger-zone-heading"
        className="space-y-3 rounded-xl border border-danger/30 bg-danger/5 p-6"
      >
        <div>
          <h2 id="danger-zone-heading" className="text-danger text-sm font-semibold">
            Danger zone
          </h2>
          <p className="text-ink-muted mt-1 text-sm">
            Deleting removes this signup from your dashboard and immediately makes its public
            link inaccessible.
          </p>
        </div>
        <DeleteSignupForm signupId={id} />
      </section>
    </section>
  );
}
