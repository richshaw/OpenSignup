import { Download } from 'lucide-react';
import { getDb } from '@/db/client';
import { requireOrganizerSession, toActor } from '@/auth/session';
import { loadSignupForOrganizer } from '@/services/signups.cached';
import {
  ACTIVE_COMMITMENT_STATUSES,
  PLACE_HOLDING_STATUSES,
  howCommitmentsEnded,
  listCommitmentsForSignup,
  shownCommitmentStatus,
} from '@/services/commitments';
import { trackOrganizerView } from '@/lib/view-tracker';
import { StatusPill } from '@/components/status-pill';
import { getOrganizerAppLocale } from '@/i18n/organizer';
import { getServerTranslator } from '@/i18n/server';
import { commitmentStatusLabel } from '@/lib/commitment-status-label';
import type { SignupStatus } from '@/schemas/signups';
import { summarizeSlotValues } from '@/lib/slot-summary';
import { RemoveCommitmentForm, type RemoveText } from './remove-commitment-form';
import { noResponsesLine, summarizeResponses } from './responses-summary';

type PageParams = { params: Promise<{ id: string }> };

export default async function ResponsesTab({ params }: PageParams) {
  const { id } = await params;
  const session = await requireOrganizerSession();
  const result = await loadSignupForOrganizer(toActor(session), id);
  if (!result.ok) return null;
  const sig = result.value;
  await trackOrganizerView({
    actor: toActor(session),
    signupId: sig.id,
    workspaceId: sig.workspaceId,
    eventType: 'signup.editor_opened',
    payload: { section: 'responses' },
  });
  const [commitments, ended] = await Promise.all([
    listCommitmentsForSignup(getDb(), id),
    howCommitmentsEnded(getDb(), sig),
  ]);
  // Most signups are one spot per person, and a column of 1s is noise. Show
  // Spots only when someone holds more than one, as the confirmation email
  // does. Cancelled rows keep their quantity but no longer hold anything, so
  // they don't count, the same rule the public page's "2/4" follows.
  const showSpots = commitments.some(
    (c) => c.quantity > 1 && PLACE_HOLDING_STATUSES.includes(c.status),
  );
  const canRemove = (c: (typeof commitments)[number]) =>
    ACTIVE_COMMITMENT_STATUSES.includes(c.status);
  // The tab's own words are in the organizer's language. What the signup
  // holds (its slots' values) and what participants gave stay as written.
  const t = getServerTranslator(getOrganizerAppLocale(session), 'organizer.responses');
  const totals = summarizeResponses(commitments, ended, t);
  // Every row's Remove says the same. One object, so the page's RSC payload
  // carries its words once and each row refers to it.
  const removeText: RemoveText = {
    remove: t('remove.button'),
    dialogLabel: t('remove.dialogLabel'),
    keep: t('remove.keep'),
    confirm: t('remove.confirm'),
    removing: t('remove.removing'),
  };

  return (
    <section className="space-y-4">
      {/* Outside the table's box, whose phone layout is its own. With no
          sign-ups the empty box below says it all. */}
      {commitments.length > 0 ? (
        <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between md:gap-3">
          <p className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">{totals.count}</span>
            {totals.rest.map((part) => ` · ${part}`).join('')}
          </p>
          {/* A plain link, not next/link: it's a file, so the router has
              nothing to do, and the route sends it as an attachment. */}
          <a
            href={`/api/signups/${sig.id}/export.csv`}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-surface-sunk bg-white px-3.5 text-[15px] font-medium text-ink transition hover:bg-surface-raised md:h-9 md:text-[13px]"
          >
            <Download size={15} aria-hidden="true" />
            {t('downloadCsv')}
          </a>
        </div>
      ) : null}
      {commitments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-surface-sunk p-6 text-center text-sm text-ink-muted">
          {noResponsesLine(sig.status as SignupStatus, t)}
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
                  {t('table.name')}
                </th>
                <th role="columnheader" className="px-4 py-3 text-left">
                  {t('table.email')}
                </th>
                <th role="columnheader" className="px-4 py-3 text-left">
                  {t('table.slot')}
                </th>
                {showSpots ? (
                  <th role="columnheader" className="px-4 py-3 text-right">
                    {t('table.spots')}
                  </th>
                ) : null}
                <th role="columnheader" className="px-4 py-3 text-left">
                  {t('table.status')}
                </th>
                <th role="columnheader" className="px-4 py-3">
                  <span className="sr-only">{t('table.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup" className="divide-y divide-surface-sunk max-md:block">
              {commitments.map((c) => {
                const slot = sig.slots.find((s) => s.id === c.slotId);
                const values = slot?.values ?? {};
                // Values only: the column heading already says Slot, and the
                // Remove question below reads the slot the same way.
                const summary = slot ? summarizeSlotValues(sig.fields, values, 'en') : '';
                // A removal takes the Remove button away, so focus goes to
                // this cell, which then reads "removed". Every row has it, so
                // it outlasts that re-render.
                const statusId = `status-${c.id}`;
                const status = shownCommitmentStatus(c, ended);
                // Remove's name, and the start of its question.
                const slotName = summary || slot?.ref;
                const removeLabel = slotName
                  ? t('remove.label', { name: c.participantName, slot: slotName })
                  : t('remove.labelNoSlot', { name: c.participantName });
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
                      {c.participantEmail ?? t('table.noEmail')}
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
                        <span className="md:hidden">
                          {' '}
                          {t('table.spotsAfterCount', { count: c.quantity })}
                        </span>
                      </td>
                    ) : null}
                    <td
                      id={statusId}
                      role="cell"
                      tabIndex={-1}
                      className="max-md:col-start-2 max-md:row-start-1 max-md:text-right md:px-4 md:py-3"
                    >
                      <StatusPill status={status} label={commitmentStatusLabel(status, t)} />
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
                          text={removeText}
                        >
                          {t('remove.question', { label: removeLabel, count: c.quantity })}
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
