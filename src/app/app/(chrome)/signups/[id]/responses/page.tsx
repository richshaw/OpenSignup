import { after } from 'next/server';
import { getDb } from '@/db/client';
import { requireOrganizerSession, toActor } from '@/auth/session';
import { loadSignupForOrganizer } from '@/services/signups.cached';
import {
  ACTIVE_COMMITMENT_STATUSES,
  howCommitmentsEnded,
  listCommitmentsForSignup,
} from '@/services/commitments';
import { recordOrganizerView } from '@/lib/view-tracker';
import { StatusPill } from '@/components/status-pill';
import { summarizeSlot, summarizeSlotValues } from '@/lib/slot-summary';
import { RemoveCommitmentForm } from './remove-commitment-form';

type PageParams = { params: Promise<{ id: string }> };

export default async function ResponsesTab({ params }: PageParams) {
  const { id } = await params;
  const session = await requireOrganizerSession();
  const result = await loadSignupForOrganizer(toActor(session), id);
  if (!result.ok) return null;
  const sig = result.value;
  after(() =>
    recordOrganizerView({
      actor: { actorId: session.organizerId, actorType: 'organizer' },
      signupId: sig.id,
      workspaceId: sig.workspaceId,
      eventType: 'signup.editor_opened',
      payload: { section: 'responses' },
    }),
  );
  const [commitments, ended] = await Promise.all([
    listCommitmentsForSignup(getDb(), id),
    howCommitmentsEnded(getDb(), sig),
  ]);
  // Most signups are one spot per person, and a column of 1s is noise. Show
  // Spots only when someone holds more than one, as the confirmation email
  // does. Cancelled rows keep their quantity but no longer hold anything, so
  // they don't count, the same rule the public page's "2/4" follows.
  const showSpots = commitments.some(
    (c) => c.quantity > 1 && (c.status === 'confirmed' || c.status === 'tentative'),
  );
  const canRemove = (c: (typeof commitments)[number]) =>
    ACTIVE_COMMITMENT_STATUSES.includes(c.status);

  return (
    <section className="space-y-4">
      <p className="text-ink-muted text-sm">
        Everyone who&rsquo;s signed up so far. Export to CSV from the header.
      </p>
      {commitments.length === 0 ? (
        <p className="text-ink-muted rounded-lg border border-dashed border-surface-sunk p-6 text-center text-sm">
          No signups yet. Share the public link to start collecting.
        </p>
      ) : (
        // A table from md up. Narrower, it would be wider than the screen (an
        // email address can't wrap), so each row is laid out as a card: name
        // and status, then the slot, then the email and Remove. The headings
        // stay for screen readers. The roles are the elements' own, written
        // out because VoiceOver on Safari drops a row's cells once the row is a
        // grid. `relative` keeps the hidden headings inside this box; without
        // it they sat past its right edge and made the whole page pan
        // sideways. It still scrolls sideways if a long email needs it.
        <div className="relative overflow-x-auto rounded-xl border border-surface-sunk bg-white">
          <table role="table" className="w-full text-sm max-md:block">
            <thead role="rowgroup" className="bg-surface-raised text-ink-muted max-md:sr-only">
              <tr role="row">
                <th role="columnheader" className="px-4 py-3 text-left">
                  Name
                </th>
                <th role="columnheader" className="px-4 py-3 text-left">
                  Email
                </th>
                <th role="columnheader" className="px-4 py-3 text-left">
                  Slot
                </th>
                {showSpots ? (
                  <th role="columnheader" className="px-4 py-3 text-right">
                    Spots
                  </th>
                ) : null}
                <th role="columnheader" className="px-4 py-3 text-left">
                  Status
                </th>
                <th role="columnheader" className="px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup" className="divide-y divide-surface-sunk max-md:block">
              {commitments.map((c) => {
                const slot = sig.slots.find((s) => s.id === c.slotId);
                const values = slot?.values ?? {};
                const summary = slot ? summarizeSlot(sig.fields, values) : '';
                // A removal takes the Remove button away, so focus goes to
                // this cell, which then reads "removed". Every row has it, so
                // it outlasts that re-render.
                const statusId = `status-${c.id}`;
                // "cancelled" is the participant's own cancel. An organizer's
                // removal and the old sign-up of a move say so instead, here
                // and in the CSV export.
                const status = c.status === 'cancelled' ? (ended.get(c.id) ?? c.status) : c.status;
                // Remove's name, and the start of its question. The slot is
                // unlabelled, to read as part of a sentence.
                const removeLabel = `Remove ${c.participantName} from ${
                  summarizeSlotValues(sig.fields, values) || slot?.ref || 'this slot'
                }`;
                return (
                  <tr
                    key={c.id}
                    role="row"
                    className="max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-center max-md:gap-x-3 max-md:gap-y-1 max-md:p-4"
                  >
                    <td
                      role="cell"
                      className="font-medium max-md:col-start-1 max-md:row-start-1 md:px-4 md:py-3"
                    >
                      {c.participantName}
                    </td>
                    <td
                      role="cell"
                      className="text-ink-muted max-md:col-start-1 max-md:row-start-3 max-md:break-words md:px-4 md:py-3"
                    >
                      {/* Words, not a dash: a bare dash means nothing without
                          its column heading, and a row laid out for a phone
                          has none. */}
                      {c.participantEmail ?? 'No email'}
                    </td>
                    <td
                      role="cell"
                      className="max-md:col-span-2 max-md:row-start-2 md:px-4 md:py-3"
                    >
                      {summary || slot?.ref || '—'}
                    </td>
                    {showSpots ? (
                      <td
                        role="cell"
                        className="tabular-nums max-md:col-start-1 max-md:row-start-4 md:px-4 md:py-3 md:text-right"
                      >
                        {c.quantity}
                        <span className="md:hidden"> {c.quantity === 1 ? 'spot' : 'spots'}</span>
                      </td>
                    ) : null}
                    <td
                      id={statusId}
                      role="cell"
                      tabIndex={-1}
                      className="max-md:col-start-2 max-md:row-start-1 max-md:text-right md:px-4 md:py-3"
                    >
                      <StatusPill status={status} />
                    </td>
                    <td
                      role="cell"
                      className="text-right max-md:col-start-2 max-md:row-start-3 max-md:empty:hidden md:px-4 md:py-3"
                    >
                      {canRemove(c) ? (
                        <RemoveCommitmentForm
                          signupId={sig.id}
                          commitmentId={c.id}
                          statusCellId={statusId}
                          label={removeLabel}
                        >
                          {removeLabel}?{' '}
                          {c.quantity > 1 ? `Their ${c.quantity} spots open` : 'Their spot opens'}{' '}
                          up for someone else. They won&rsquo;t get an email about it.
                        </RemoveCommitmentForm>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
