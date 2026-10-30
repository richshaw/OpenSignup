'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { Check, ChevronLeft, Minus, Plus, Sparkles, X } from 'lucide-react';
import {
  EARLIEST_DATE_YEAR,
  HOW_MANY_MAX,
  WHAT_ITEM_MAX_LENGTH,
  WHAT_ITEMS_MAX,
  WHEN_TEXT_MAX_LENGTH,
} from '@/lib/magic-compose/limits';
import type { FollowUp, MagicComposeQuestions, WhenAnswer } from '@/lib/magic-compose/questions';
import {
  addPending,
  answeredItems,
  answersProblem,
  appendAnswers,
  buildFollowUp,
  isFull,
  parseCount,
  removeItem,
  sameAnswers,
  startingAnswers,
  stepCount,
  togglePick,
  timeLength,
  type Answers,
} from './answers';
import { handFillHref } from './hand-fill';
import { DETAILS_STEP, DRAFT_STEPS, FRAME, PulseMark, StepList, type StepRow } from './Steps';
import { HereDot, StepLine } from './StepLine';
import { YouWrote } from './YouWrote';
import { TimeSelect } from '@/components/build-shared/TimeSelect';

const WHEN_CHOICES: Array<{ kind: WhenAnswer['kind']; label: string }> = [
  { kind: 'one_day', label: 'One day' },
  { kind: 'several', label: 'Several days' },
  { kind: 'not_decided', label: 'Not decided' },
];

// The pills look 36px tall, as the When choices do; the button around each
// one is the 44px target.
const PILL =
  'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[15px] font-medium';
const PILL_ON = 'border-brand bg-brand/10 text-ink';
const FOCUS_INSIDE =
  'focus-visible:outline-none group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-brand';
const BOX =
  'border-surface-sunk text-ink h-11 rounded-[10px] border bg-white text-base shadow-sm sm:text-[15px]';
const BOX_FOCUS = 'focus:border-brand focus:ring-brand focus:outline-none focus:ring-1';
const QUESTION = 'text-base font-semibold leading-snug';
const HINT = 'text-ink-muted text-[13px]';

type Topic = MagicComposeQuestions['topics'][number];

/**
 * "A few details first": the questions Magic Compose asks when it can't draft
 * real slots from a description. Only the asked topics show, but the "what"
 * list always does: asked, with the model's options to pick from; not asked,
 * with the things the description names already picked. The date and the
 * counts use the page's own controls, so the answers are exact values. Every
 * box lives in `answers`, held by the page, so nothing typed is lost to Cancel
 * or an error.
 */
export function Questions({
  prompt,
  questions,
  answers: held,
  setAnswers,
  error,
  onBack,
  onSend,
  onInvalid,
}: {
  prompt: string;
  questions: MagicComposeQuestions;
  /** The boxes as the organizer left them; null until they answer anything. */
  answers: Answers | null;
  setAnswers: Dispatch<SetStateAction<Answers | null>>;
  /** Why the last try failed, already in its `FormError`. Hidden once an answer changes. */
  error: ReactNode;
  /** Back to compose, with the description and the answers so far as one text. */
  onBack: (description: string) => void;
  onSend: (followUp: FollowUp) => void;
  /** The answers can't go as they are; `message` says why. */
  onInvalid: (message: string) => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Once an answer changes, `error` no longer speaks to what's in the boxes.
  // The next try brings its own: `onInvalid` below, or a failed call, which
  // comes back to a new screen.
  const [edited, setEdited] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  const answers = held ?? startingAnswers(questions);
  const update = (change: (a: Answers) => Answers) => {
    // Only a real change: − at 1, or a count box left as it was, isn't one.
    if (!sameAnswers(change(answers), answers)) setEdited(true);
    setAnswers((a) => change(a ?? startingAnswers(questions)));
  };
  const asks = (topic: Topic) => questions.topics.includes(topic);
  // Words left in "Add your own" go as an item: nothing typed is dropped.
  const committed = () => addPending(answers, questions.whatOptions);

  const draft = () => {
    const done = committed();
    const problem = answersProblem(questions, done);
    if (!problem) {
      setAnswers(done);
      onSend(buildFollowUp(questions, done));
      return;
    }
    flushSync(() => {
      setAnswers(done);
      setEdited(false);
      onInvalid(problem);
    });
    // The error shows at the top of the panel, which on a long list is far
    // above the buttons. Focus brings it into view and has it read out, even
    // unchanged.
    errorRef.current?.scrollIntoView?.({ block: 'center' });
    errorRef.current?.focus({ preventScroll: true });
  };

  const parts = [
    <What
      key="what"
      asked={asks('what')}
      options={questions.whatOptions}
      answers={answers}
      update={update}
    />,
    asks('when') && <When key="when" answers={answers} update={update} />,
    asks('how_many') && <HowMany key="how_many" answers={answers} update={update} />,
  ].filter(Boolean);

  const rows = DRAFT_STEPS.flatMap((s, i): StepRow[] =>
    i === 0
      ? [
          { id: s.id, label: s.label, state: 'done' },
          {
            ...DETAILS_STEP,
            state: 'active',
            icon: <HereDot />,
            className: 'animate-grow-in overflow-hidden',
          },
        ]
      : [{ id: s.id, label: s.label, state: 'todo' }],
  );

  // The drafting frame, with the questions in its panel: the steps keep their
  // place, and the panel's placeholders give way to the questions.
  return (
    <div className={FRAME}>
      <aside className="flex flex-col gap-4 md:sticky md:top-6">
        {/* First in the page so a phone shows it top left; under the steps on a wider screen. */}
        <button
          type="button"
          onClick={() => onBack(appendAnswers(prompt, questions, committed()))}
          className="-mb-2 -ml-1.5 inline-flex min-h-11 items-center gap-1 self-start rounded-[10px] pl-1 pr-2.5 text-[15px] font-medium text-ink-muted hover:text-ink md:order-last md:mb-0 md:ml-0 md:rounded-xl md:px-3 md:text-sm"
        >
          <ChevronLeft className="h-[18px] w-[18px]" aria-hidden="true" />
          Back
        </button>
        <PulseMark still />
        <div>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="animate-fade-in text-2xl font-semibold tracking-tight outline-none"
          >
            A few details first
          </h1>
          <p className="mt-1.5 animate-fade-in text-sm leading-relaxed text-ink-muted">
            Pick what fits. Anything you skip becomes a placeholder you can fill in later.
          </p>
        </div>
        <StepLine details="here" draft="todo" />
        <StepList rows={rows} className="hidden md:flex" />
      </aside>

      <section className="overflow-hidden rounded-2xl border border-surface-sunk bg-white">
        <div className="flex flex-col gap-4 p-4 sm:px-6 sm:py-5">
          <YouWrote prompt={prompt} variant="plain" />
          {!edited && error && (
            <div ref={errorRef} tabIndex={-1} className="outline-none">
              {error}
            </div>
          )}
        </div>

        <div className="divide-y divide-surface-sunk border-t border-surface-sunk">
          {parts.map((part, i) => (
            <div key={i} className="animate-rise" style={{ animationDelay: `${80 + i * 70}ms` }}>
              {part}
            </div>
          ))}
        </div>

        <div
          className="flex animate-rise flex-col-reverse gap-2 border-t border-surface-sunk bg-surface-raised/50 px-4 pb-1.5 pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:py-3 sm:pl-5 sm:pr-4"
          style={{ animationDelay: `${80 + parts.length * 70}ms` }}
        >
          <Link
            href={handFillHref(prompt)}
            className="inline-flex min-h-11 items-center self-center text-[15px] text-ink-muted underline hover:text-ink sm:self-auto"
          >
            Fill in by hand instead
          </Link>
          {/* Anything skipped goes as a placeholder, as the heading's line says. */}
          <button
            type="button"
            onClick={draft}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-brand-hover"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Draft my signup
          </button>
        </div>
      </section>
    </div>
  );
}

interface Part {
  answers: Answers;
  update: (change: (answers: Answers) => Answers) => void;
}

function What({
  asked,
  options,
  answers,
  update,
}: Part & {
  /** False when the description already says what: `options` are its things, picked to start. */
  asked: boolean;
  options: string[];
}) {
  const id = useId();
  // Asked, the model's options are pills to pick and only the organizer's own
  // items are chips. Not asked, everything on the list is a chip to remove.
  const chips = asked ? answers.added : answeredItems(answers);
  const full = isFull(answers);
  // Add and a chip's × go away once used, so each hands focus on rather than
  // dropping it to the page.
  const inputRef = useRef<HTMLInputElement>(null);
  const fullRef = useRef<HTMLSpanElement>(null);
  const removeRefs = useRef(new Map<string, HTMLButtonElement>());
  const add = () => {
    flushSync(() => update((a) => addPending(a, options)));
    // A full list takes the box away; the line saying so stands in its place.
    (inputRef.current ?? fullRef.current)?.focus();
  };
  // To the next chip's ×, or to the box when it was the last chip.
  const remove = (item: string) => {
    const next = chips[chips.indexOf(item) + 1];
    flushSync(() => update((a) => removeItem(a, item)));
    const nextChip = next === undefined ? undefined : removeRefs.current.get(next);
    (nextChip ?? inputRef.current)?.focus();
  };
  const placeholder = chips.length > 0 ? 'Add another' : 'Add your own';
  // Size the box to what it shows, so the pill ends where the words do.
  const chars = Math.min(40, Math.max(answers.pending.length, placeholder.length));

  return (
    <section className="flex flex-col gap-2.5 p-4 sm:gap-3 sm:px-6 sm:py-5">
      <div>
        <p id={id} className={QUESTION}>
          {asked ? 'What do people sign up for?' : 'What people sign up for'}
        </p>
        <p className={`${HINT} mt-0.5`}>
          {asked
            ? 'Pick any that apply, or add your own.'
            : "From your description. Remove any that don't fit, or add your own."}
        </p>
      </div>
      <div
        role="group"
        aria-labelledby={id}
        className="-my-1 flex flex-wrap items-center gap-x-1.5"
      >
        {asked &&
          options.map((option) => {
            const on = answers.picked.includes(option);
            return (
              <button
                key={option}
                type="button"
                aria-pressed={on}
                disabled={!on && full}
                onClick={() => update((a) => togglePick(a, option, options))}
                className="group inline-flex min-h-11 items-center focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span
                  className={`${PILL} ${FOCUS_INSIDE} ${
                    on
                      ? PILL_ON
                      : 'border-surface-sunk bg-white shadow-sm group-hover:bg-surface-raised'
                  }`}
                >
                  {on && <Tick />}
                  {option}
                </span>
              </button>
            );
          })}
        {chips.map((item) => (
          <span key={item} className={`${PILL} ${PILL_ON} my-1 pr-0`}>
            <Tick />
            {item}
            <button
              ref={(button) => {
                if (button) removeRefs.current.set(item, button);
                else removeRefs.current.delete(item);
              }}
              type="button"
              aria-label={`Remove ${item}`}
              onClick={() => remove(item)}
              className="-my-1 inline-flex h-11 w-8 items-center justify-center rounded-full focus-visible:outline-offset-[-6px]"
            >
              <X className="h-[13px] w-[13px]" strokeWidth={2.5} aria-hidden="true" />
            </button>
          </span>
        ))}
        {full ? (
          <span
            ref={fullRef}
            tabIndex={-1}
            className={`${HINT} inline-flex min-h-11 items-center outline-none`}
          >
            {WHAT_ITEMS_MAX} is the most. Remove one to add another.
          </span>
        ) : (
          <span
            className={`my-1 inline-flex h-9 items-center rounded-full border bg-white pl-3 focus-within:border-solid focus-within:border-brand ${
              answers.pending.trim()
                ? 'border-brand pr-1.5'
                : 'border-dashed border-ink-soft/50 pr-3'
            }`}
          >
            {/* The Add button sits outside the label, so it isn't part of the box's name. */}
            <label className="-my-1 inline-flex h-11 cursor-text items-center gap-1.5">
              <Plus
                className="h-[13px] w-[13px] flex-shrink-0 text-ink-muted"
                strokeWidth={2.5}
                aria-hidden="true"
              />
              <span className="sr-only">Add your own, then press Enter</span>
              <input
                ref={inputRef}
                type="text"
                value={answers.pending}
                maxLength={WHAT_ITEM_MAX_LENGTH}
                placeholder={placeholder}
                onChange={(e) => {
                  const pending = e.target.value;
                  update((a) => ({ ...a, pending }));
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  add();
                }}
                style={{ width: `${(chars * 0.55 + 0.5).toFixed(2)}em` }}
                className="min-w-0 max-w-[260px] border-0 bg-transparent p-0 text-base outline-none placeholder:text-ink-soft sm:text-[15px]"
              />
            </label>
            {answers.pending.trim() && (
              <button
                type="button"
                onClick={add}
                className="group -my-1 ml-1.5 inline-flex h-11 items-center focus-visible:outline-none"
              >
                <span
                  className={`inline-flex h-[26px] items-center rounded-full bg-brand px-2.5 text-xs font-semibold text-white ${FOCUS_INSIDE}`}
                >
                  Add
                </span>
              </button>
            )}
          </span>
        )}
      </div>
    </section>
  );
}

function When({ answers, update }: Part) {
  const id = useId();
  const set = (patch: Partial<Answers>) => update((a) => ({ ...a, ...patch }));

  return (
    <section className="flex flex-col gap-2.5 p-4 sm:gap-3 sm:px-6 sm:py-5">
      <p id={`${id}q`} className={QUESTION}>
        When is it?
      </p>
      {/* Native radios, so arrow keys move between them, drawn as a segmented control.
          In a narrow panel or at large text the choices wrap onto more rows, whole,
          rather than run past the panel. */}
      <div
        role="radiogroup"
        aria-labelledby={`${id}q`}
        className="grid min-h-11 grid-cols-[repeat(auto-fit,minmax(min(100%,6.5rem),1fr))] gap-0.5 rounded-lg bg-surface-sunk px-1 sm:inline-flex sm:max-w-full sm:flex-wrap sm:self-start"
      >
        {WHEN_CHOICES.map((choice) => (
          <label
            key={choice.kind}
            className="relative flex min-h-11 min-w-0 cursor-pointer items-center"
          >
            <input
              type="radio"
              name={`${id}when`}
              value={choice.kind}
              checked={answers.when === choice.kind}
              onChange={() => set({ when: choice.kind })}
              className="peer sr-only"
            />
            <span className="inline-flex min-h-9 flex-1 items-center justify-center rounded-[9px] px-2 py-1 text-center text-[15px] font-medium leading-tight text-ink-muted peer-checked:bg-white peer-checked:font-semibold peer-checked:text-ink peer-checked:shadow peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand sm:px-3.5">
              {choice.label}
            </span>
          </label>
        ))}
      </div>

      {answers.when === 'one_day' && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <label htmlFor={`${id}date`} className="sr-only">
            Date
          </label>
          <input
            id={`${id}date`}
            type="date"
            min={`${EARLIEST_DATE_YEAR}-01-01`}
            max="9999-12-31"
            value={answers.date}
            onChange={(e) => set({ date: e.target.value })}
            className={`${BOX} ${BOX_FOCUS} px-3`}
          />
          <div className="flex items-center gap-2">
            <label htmlFor={`${id}from`} className="text-[15px] font-medium">
              Starts
            </label>
            <TimeSelect
              id={`${id}from`}
              value={answers.from}
              // A start at or past the chosen end clears the end, so the pair
              // stays in order.
              onChange={(from) =>
                set(from && answers.to && answers.to <= from ? { from, to: '' } : { from })
              }
              className={`${BOX} ${BOX_FOCUS} min-w-0 flex-1 px-3 sm:flex-none`}
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor={`${id}to`} className="text-[15px] font-medium">
              Ends
            </label>
            <TimeSelect
              id={`${id}to`}
              value={answers.to}
              onChange={(to) => set({ to })}
              {...(answers.from
                ? { after: answers.from, note: (t: string) => timeLength(answers.from, t) }
                : {})}
              className={`${BOX} ${BOX_FOCUS} min-w-0 flex-1 px-3 sm:flex-none`}
            />
          </div>
        </div>
      )}
      {answers.when === 'several' && (
        <div>
          <label htmlFor={`${id}days`} className="sr-only">
            Which days?
          </label>
          <input
            id={`${id}days`}
            type="text"
            value={answers.several}
            maxLength={WHEN_TEXT_MAX_LENGTH}
            onChange={(e) => set({ several: e.target.value })}
            placeholder="Which days? For example: every Saturday in May, 9 to 11"
            className={`${BOX} ${BOX_FOCUS} w-full px-3 placeholder:text-ink-soft`}
          />
        </div>
      )}
      {answers.when === 'not_decided' && (
        <p className={HINT}>The draft will use placeholder dates you can fill in later.</p>
      )}
    </section>
  );
}

function HowMany({ answers, update }: Part) {
  const items = answeredItems(answers);
  const setCount = (item: string, count: string) =>
    update((a) => ({ ...a, counts: { ...a.counts, [item]: count } }));

  return (
    <section className="flex flex-col gap-2 px-4 pb-2.5 pt-4 sm:px-6 sm:pb-3.5 sm:pt-5">
      <div>
        <p className={QUESTION}>How many people do you need?</p>
        <p className={`${HINT} mt-0.5`}>For each thing above. Leave a box empty for no limit.</p>
      </div>
      {items.length === 0 ? (
        <p className="mb-1.5 mt-1 rounded-[10px] border border-dashed border-surface-sunk px-3.5 py-3 text-[13px] text-ink-muted">
          Pick or add something above first.
        </p>
      ) : (
        <ul>
          {items.map((item) => {
            const count = answers.counts[item] ?? '';
            return (
              <li
                key={item}
                className="flex items-center justify-between gap-2.5 border-t border-surface-sunk py-1.5 sm:gap-3"
              >
                <span className="min-w-0 text-[15px]">{item}</span>
                {/* 46px with its border, so −, + and the number are each 44px targets. */}
                <span className="inline-flex h-[46px] flex-shrink-0 items-center overflow-hidden rounded-[10px] border border-surface-sunk bg-white shadow-sm focus-within:border-brand">
                  <button
                    type="button"
                    aria-label={`Fewer people for ${item}`}
                    onClick={() => setCount(item, stepCount(count, -1))}
                    className="inline-flex h-11 w-10 items-center justify-center text-ink-muted hover:bg-surface-raised focus-visible:outline-offset-[-2px] sm:w-[42px]"
                  >
                    <Minus className="h-[15px] w-[15px]" strokeWidth={2.25} aria-hidden="true" />
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={HOW_MANY_MAX}
                    step={1}
                    aria-label={`People for ${item}`}
                    placeholder="No limit"
                    value={count}
                    onChange={(e) => setCount(item, e.target.value)}
                    // Show what will be sent: the number, or empty for no limit. A
                    // fraction stays as typed, for Draft my signup to stop.
                    onBlur={() => setCount(item, String(parseCount(count) ?? ''))}
                    className="h-11 w-[72px] border-x border-surface-sunk bg-transparent px-0.5 text-center text-base tabular-nums outline-none [appearance:textfield] placeholder:text-ink-soft sm:w-[76px] sm:text-[15px] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    aria-label={`More people for ${item}`}
                    onClick={() => setCount(item, stepCount(count, 1))}
                    className="inline-flex h-11 w-10 items-center justify-center text-brand hover:bg-surface-raised focus-visible:outline-offset-[-2px] sm:w-[42px]"
                  >
                    <Plus className="h-[15px] w-[15px]" strokeWidth={2.25} aria-hidden="true" />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Tick() {
  return <Check className="h-[13px] w-[13px] text-brand" strokeWidth={2.5} aria-hidden="true" />;
}
