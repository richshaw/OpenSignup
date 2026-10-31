import type { ReactNode } from 'react';
import { Check, Sparkles } from 'lucide-react';

/**
 * The frame the reading, questions and drafting screens share: the steps on
 * the left, a panel on the right. Questions arrive in the panel where the
 * draft would have, so the screen keeps its shape from one to the next.
 */
export const FRAME =
  'mx-auto mt-10 grid max-w-[1080px] grid-cols-1 items-start gap-7 md:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]';

export interface DraftStep {
  id: string;
  label: string;
  /** Fixed time on this step; the fields and slots steps take a reveal time instead. */
  duration?: number;
}

export const DRAFT_STEPS: DraftStep[] = [
  { id: 'read', label: 'Reading your description', duration: 700 },
  { id: 'title', label: 'Drafting a title', duration: 700 },
  { id: 'desc', label: 'Writing a short blurb', duration: 900 },
  { id: 'fields', label: 'Choosing columns for each slot' },
  { id: 'slots', label: 'Generating slots' },
  { id: 'check', label: 'Tidying up', duration: 600 },
];

/** The step the questions add, between reading and drafting. */
export const DETAILS_STEP = { id: 'details', label: 'A few details' };

/** `active` is the step under way; `todo` is still to come. */
export type StepState = 'done' | 'active' | 'todo';

export interface StepRow {
  id: string;
  label: string;
  state: StepState;
  /**
   * In place of the state's icon. The questions' step waits on the organizer,
   * not the AI, so it shows a still dot (`HereDot`), not a spinner.
   */
  icon?: ReactNode;
  /** More classes for the row, such as growing in one that has just appeared. */
  className?: string;
}

export function StepIcon({ state }: { state: StepState }) {
  if (state === 'done') {
    return (
      <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-success text-white">
        <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  if (state === 'active') {
    return (
      <span className="relative h-5 w-5 flex-shrink-0">
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-surface-sunk border-t-brand" />
      </span>
    );
  }
  // ink-soft at 75%, about as light as a step's outline can go and still stand
  // out from white (3:1).
  return (
    <span className="inline-block h-5 w-5 flex-shrink-0 rounded-full border-[1.5px] border-ink-soft/75 bg-white" />
  );
}

/**
 * Each state's label colour. A step still to come is ink-soft, the lightest
 * grey that still reads at 4.5:1, so it looks quieter than a finished one.
 */
export const LABEL: Record<StepState, string> = {
  done: 'text-ink-muted',
  active: 'text-ink font-medium',
  todo: 'text-ink-soft',
};

/** Every step, one per row. */
export function StepList({ rows, className = '' }: { rows: StepRow[]; className?: string }) {
  return (
    <ul
      aria-label="Progress"
      className={`flex-col gap-0.5 rounded-2xl border border-surface-sunk bg-white p-1.5 ${className || 'flex'}`}
    >
      {rows.map((row) => (
        <li
          key={row.id}
          aria-current={row.state === 'active' ? 'step' : undefined}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
            row.state === 'active' ? 'bg-surface-raised' : ''
          } ${row.className ?? ''}`}
        >
          {row.icon ?? <StepIcon state={row.state} />}
          <div className={`text-sm ${LABEL[row.state]}`}>{row.label}</div>
        </li>
      ))}
    </ul>
  );
}

/** The sparkle at the top of the frame; it pulses while the AI works. */
export function PulseMark({ still = false }: { still?: boolean }) {
  return (
    <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-brand">
      <Sparkles className="h-6 w-6" aria-hidden="true" />
      {!still && (
        <span className="absolute inset-0 animate-ping rounded-2xl border-2 border-brand opacity-50" />
      )}
    </div>
  );
}
