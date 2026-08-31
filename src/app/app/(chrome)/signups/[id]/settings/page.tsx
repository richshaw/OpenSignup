import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { getOrganizerSession, toActor } from '@/auth/session';
import { loadSignupForOrganizer } from '@/services/signups.cached';
import { AsyncSubmitButton } from '@/components/ui/async-submit-button';
import { recordOrganizerView } from '@/lib/view-tracker';
import { DEFAULT_REMINDER_LEAD_HOURS, SignupSettingsSchema } from '@/schemas/signups';
import { leadHourLabel, leadHourOptions } from '@/lib/reminder-settings';
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
  const reminderRef = parsedSettings.success
    ? (parsedSettings.data.reminderFromFieldRef ?? '')
    : '';
  const sendReminders = parsedSettings.success ? parsedSettings.data.sendReminders : true;
  const leadHours = parsedSettings.success
    ? parsedSettings.data.reminderLeadHours
    : DEFAULT_REMINDER_LEAD_HOURS;

  return (
    <section className="max-w-2xl space-y-6">
      {error ? (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {sig.fields.some((f) => f.fieldType === 'date') && (
        <form
          action={updateReminderAction.bind(null, id)}
          className="space-y-4 rounded-xl border border-surface-sunk bg-white p-6"
        >
          <div>
            <h2 className="text-sm font-semibold">Reminders</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Send participants a reminder email before their slot.
            </p>
          </div>
          {/* Always submits, so the action can tell "unticked" from "absent". */}
          <input type="hidden" name="sendRemindersPresent" value="1" />
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="sendReminders"
              defaultChecked={sendReminders}
              className="mt-0.5 h-4 w-4 rounded border-surface-sunk text-brand focus:ring-1 focus:ring-brand"
            />
            <span className="text-sm">
              <span className="block font-medium">Send reminder emails</span>
              <span className="block text-ink-muted">
                Off means no reminders go out for this signup, whatever the timing below says.
              </span>
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Reminder date field</span>
            <select
              name="reminderFromFieldRef"
              defaultValue={reminderRef}
              className="block min-h-[42px] w-full appearance-none rounded-lg border border-surface-sunk bg-white px-3 py-2 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="">— No reminder —</option>
              {sig.fields
                .filter((f) => f.fieldType === 'date')
                .map((f) => (
                  <option key={f.id} value={f.ref}>
                    {f.label}
                  </option>
                ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Send reminder</span>
            <select
              name="reminderLeadHours"
              defaultValue={String(leadHours)}
              className="block min-h-[42px] w-full appearance-none rounded-lg border border-surface-sunk bg-white px-3 py-2 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              {leadHourOptions(leadHours).map((hours) => (
                <option key={hours} value={String(hours)}>
                  {leadHourLabel(hours)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end">
            <AsyncSubmitButton
              loadingLabel="Saving…"
              className="rounded-lg bg-brand px-5 py-2 font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:brightness-90"
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
          <h2 id="danger-zone-heading" className="text-sm font-semibold text-danger">
            Danger zone
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Deleting removes this signup from your dashboard and immediately makes its public link
            inaccessible.
          </p>
        </div>
        <DeleteSignupForm signupId={id} />
      </section>
    </section>
  );
}
