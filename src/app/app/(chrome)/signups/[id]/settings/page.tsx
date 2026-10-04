import { after } from 'next/server';
import { requireOrganizerSession, toActor } from '@/auth/session';
import { AsyncSubmitButton } from '@/components/ui/async-submit-button';
import { SavedNotice } from '@/components/ui/save-notice';
import { requiresEmail } from '@/schemas/signups';
import { loadSignupForOrganizer } from '@/services/signups.cached';
import { recordOrganizerView } from '@/lib/view-tracker';
import { setRequireEmailAction } from '../actions';
import { DeleteSignupForm } from './delete-signup-form';

type PageParams = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
};

export default async function SettingsTab({ params, searchParams }: PageParams) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  const session = await requireOrganizerSession();
  const result = await loadSignupForOrganizer(toActor(session), id);
  if (!result.ok) return null;
  const sig = result.value;
  const requireEmail = requiresEmail(sig.settings);
  after(() =>
    recordOrganizerView({
      actor: { actorId: session.organizerId, actorType: 'organizer' },
      signupId: sig.id,
      workspaceId: sig.workspaceId,
      eventType: 'signup.editor_opened',
      payload: { section: 'settings' },
    }),
  );

  // Reminders are configured on the date field itself, in the Build tab's
  // field editor. This tab keeps what has no better home: whether the sign-up
  // form asks for an email, and deletion.
  return (
    <section className="max-w-2xl space-y-6">
      {error ? (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <section
        aria-labelledby="signup-form-heading"
        className="space-y-3 rounded-xl border border-surface-sunk bg-white p-6"
      >
        <h2 id="signup-form-heading" className="text-sm font-semibold">
          Sign-up form
        </h2>
        {/* A plain form, so this tab adds no script of its own. Keyed on the
            stored value, so after a save the choice shown is the saved one.
            Gap, not space-y: the server's render starts the form with React's
            hidden action inputs and a client render doesn't, so sibling margins
            moved the fieldset 4px after a save. */}
        <form
          key={String(requireEmail)}
          action={setRequireEmailAction.bind(null, id)}
          className="flex flex-col gap-4"
        >
          <fieldset aria-describedby="require-email-help">
            <legend className="text-sm font-medium">Ask for an email address</legend>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="requireEmail"
                  value="required"
                  defaultChecked={requireEmail}
                  className="h-4 w-4 accent-brand"
                />
                Required
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="requireEmail"
                  value="optional"
                  defaultChecked={!requireEmail}
                  className="h-4 w-4 accent-brand"
                />
                Optional
              </label>
            </div>
            <p id="require-email-help" className="mt-2 text-sm text-ink-muted">
              Someone who leaves it blank gets no emails and sees their link to change or cancel
              only once. If they lose it, you can remove them on the Responses tab.
            </p>
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <AsyncSubmitButton
              loadingLabel="Saving…"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:brightness-90"
            >
              Save
            </AsyncSubmitButton>
            {saved ? <SavedNotice role="status" /> : null}
          </div>
        </form>
      </section>
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
