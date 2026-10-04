import { after } from 'next/server';
import { getDb } from '@/db/client';
import { requireOrganizerSession, toActor } from '@/auth/session';
import { loadSignupForOrganizer } from '@/services/signups.cached';
import { ACTIVE_COMMITMENT_STATUSES, listCommitmentsForSignup } from '@/services/commitments';
import { recordOrganizerView } from '@/lib/view-tracker';
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
  const commitments = await listCommitmentsForSignup(getDb(), id);
  // Most signups are one spot per person, and a column of 1s is noise. Show
  // Spots only when someone holds more than one, as the confirmation email
  // does. Cancelled rows keep their quantity but no longer hold anything, so
  // they don't count, the same rule the public page's "2/4" follows.
  const showSpots = commitments.some(
    (c) => c.quantity > 1 && (c.status === 'confirmed' || c.status === 'tentative'),
  );

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
        // made the whole page pan sideways.
        <div className="relative overflow-x-auto rounded-xl border border-surface-sunk bg-white">
          <table className="w-full text-sm">
            <thead className="bg-surface-raised text-ink-muted">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Slot</th>
                {showSpots ? <th className="px-4 py-3 text-right">Spots</th> : null}
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3">
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
                // this cell, which then reads "cancelled". Every row has it,
                // so it outlasts that re-render.
                const statusId = `status-${c.id}`;
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-medium">{c.participantName}</td>
                    <td className="text-ink-muted px-4 py-3">{c.participantEmail}</td>
                    <td className="px-4 py-3">{summary || slot?.ref || '—'}</td>
                    {showSpots ? (
                      <td className="px-4 py-3 text-right tabular-nums">{c.quantity}</td>
                    ) : null}
                    <td id={statusId} tabIndex={-1} className="px-4 py-3">
                      {c.status}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {ACTIVE_COMMITMENT_STATUSES.includes(c.status) ? (
                        <RemoveCommitmentForm
                          signupId={sig.id}
                          commitmentId={c.id}
                          statusCellId={statusId}
                          name={c.participantName}
                          // Unlabelled, to read as part of a sentence.
                          slot={summarizeSlotValues(sig.fields, values) || slot?.ref || 'this slot'}
                          quantity={c.quantity}
                        />
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
