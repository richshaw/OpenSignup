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
import { summarizeSlot, summarizeSlotValues } from '@/lib/slot-summary';
import { RemoveCommitmentForm } from './remove-commitment-form';

type PageParams = { params: Promise<{ id: string }> };

// The Actions column, held at the scroll box's right edge. The shadow marks
// that edge on a phone, where the rest of the table scrolls under it. Only a
// cell with Remove in it is held there: an empty one would hide the row
// beneath it.
const STICKY_END = 'sticky right-0 max-sm:shadow-[-6px_0_6px_-6px_rgb(11_18_32/0.2)]';

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
        // Scrolls sideways instead of clipping: an email address can't wrap,
        // so on a phone the table is wider than the screen, and Status was
        // cut off with no way to reach it. `relative` keeps the Actions
        // header's sr-only text, which is absolutely positioned, inside this
        // scroll box; without it the text sat past the table's right edge and
        // made the whole page pan sideways. The Actions column sticks to the
        // right edge, so Remove is in view without scrolling; the rest of the
        // row slides under it. On a phone the cells keep to one line, rather
        // than squeezing to a word per line and making every row tall, and the
        // table scrolls sideways. Slot is the exception: it wraps at a width
        // that fits beside Remove, so a long slot can still be read whole.
        <div className="relative overflow-x-auto rounded-xl border border-surface-sunk bg-white">
          <table className="w-full text-sm max-sm:whitespace-nowrap">
            <thead className="bg-surface-raised text-ink-muted">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left max-sm:min-w-48">Slot</th>
                {showSpots ? <th className="px-4 py-3 text-right">Spots</th> : null}
                <th className="px-4 py-3 text-left">Status</th>
                <th
                  className={`${commitments.some(canRemove) ? STICKY_END : ''} bg-surface-raised px-4 py-3`}
                >
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-sunk">
              {commitments.map((c) => {
                const slot = sig.slots.find((s) => s.id === c.slotId);
                const values = (slot?.values as Record<string, unknown>) ?? {};
                const summary = slot ? summarizeSlot(sig.fields, values) : '';
                // A removal takes the Remove button away, so focus goes to
                // this cell, which then reads "removed". Every row has it, so
                // it outlasts that re-render.
                const statusId = `status-${c.id}`;
                // "cancelled" is the participant's own cancel. An organizer's
                // removal and the old sign-up of a move say so instead. The
                // CSV export keeps the stored status.
                const status = c.status === 'cancelled' ? (ended.get(c.id) ?? c.status) : c.status;
                // Remove's name, and the start of its question. The slot is
                // unlabelled, to read as part of a sentence.
                const removeLabel = `Remove ${c.participantName} from ${
                  summarizeSlotValues(sig.fields, values) || slot?.ref || 'this slot'
                }`;
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-medium">{c.participantName}</td>
                    <td className="text-ink-muted px-4 py-3">{c.participantEmail}</td>
                    <td className="px-4 py-3 max-sm:whitespace-normal">
                      {summary || slot?.ref || '—'}
                    </td>
                    {showSpots ? (
                      <td className="px-4 py-3 text-right tabular-nums">{c.quantity}</td>
                    ) : null}
                    <td id={statusId} tabIndex={-1} className="px-4 py-3">
                      {status}
                    </td>
                    <td
                      className={`${canRemove(c) ? `${STICKY_END} bg-white` : ''} px-4 py-3 text-right`}
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
