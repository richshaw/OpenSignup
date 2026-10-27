import { DETAILS_STEP, LABEL, StepIcon, type StepState } from './Steps';

// Only the questions and the draft from their answers use these, so they load
// with the questions rather than with the page.

/** The questions' step: it waits on the organizer, not the AI, so a still dot, not a spinner. */
export function HereDot() {
  return (
    <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 border-brand bg-white">
      <span className="h-2 w-2 rounded-full bg-brand" />
    </span>
  );
}

/**
 * The steps on one line, for phones once the questions have been asked: the
 * full list would push the questions, or the draft, below the first screen.
 */
export function StepLine({ details, draft }: { details: 'here' | 'done'; draft: StepState }) {
  const parts: Array<[string, StepState | 'here']> = [
    ['Read', 'done'],
    [DETAILS_STEP.label, details],
    ['Draft', draft],
  ];
  return (
    <ol
      aria-label="Progress"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] md:hidden"
    >
      {parts.map(([label, state], i) => (
        <li
          key={label}
          aria-current={state === 'active' || state === 'here' ? 'step' : undefined}
          className={`inline-flex items-center gap-1.5 ${LABEL[state === 'here' ? 'active' : state]}`}
        >
          {i > 0 && (
            <span aria-hidden="true" className="mr-0.5 text-ink-soft">
              ·
            </span>
          )}
          {state === 'here' ? <HereDot /> : <StepIcon state={state} />}
          {label}
        </li>
      ))}
    </ol>
  );
}
