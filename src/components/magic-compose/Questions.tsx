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
  NO_ANSWERS,
  parseCount,
  removeAdded,
  sameAnswers,
  stepCount,
  togglePick,
  type Answers,
} from './answers';
import { YouWrote } from './YouWrote';

const WHEN_CHOICES: Array<{ kind: WhenAnswer['kind']; label: string }> = [
  { kind: 'one_day', label: 'One day' },
  { kind: 'several', label: 'Several days' },
  { kind: 'not_decided', label: 'Not decided' },
];

// The pills look 34px tall; the button around each one is the 44px target.
const PILL =
  'inline-flex h-[34px] items-center gap-1.5 rounded-full border px-3 text-sm font-medium';
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
 * "A few details first": the questions Magic Compose asks when a description
 * doesn't say what people sign up for. Only the asked topics show. The model
 * offers the "what" options; the date and the counts use the page's own
 * controls, so the answers are exact values. Every box lives in `answers`,
 * held by the page, so nothing typed is lost to Cancel or an error.
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

  const answers = held ?? NO_ANSWERS;
  const update = (change: (a: Answers) => Answers) => {
    // Only a real change: − at 1, or a count box left as it was, isn't one.
    if (!sameAnswers(change(answers), answers)) setEdited(true);
    setAnswers((a) => change(a ?? NO_ANSWERS));
  };
  const asks = (topic: Topic) => questions.topics.includes(topic);
  // Words left in "Add your own" go as an item: nothing typed is dropped.
  const committed = () => addPending(answers, questions.whatOptions);

  const draft = () => {
    const done = committed();
    setAnswers(done);
    const followUp = buildFollowUp(questions, done);
    const problem = answersProblem(followUp);
    if (problem) {
      setEdited(false);
      onInvalid(problem);
    } else onSend(followUp);
  };

  return (
    <div className="mx-auto flex max-w-[680px] flex-col gap-3.5 sm:gap-4">
      <button
        type="button"
        onClick={() => onBack(appendAnswers(prompt, buildFollowUp(questions, committed())))}
        className="-mb-2.5 -ml-1.5 inline-flex min-h-11 items-center gap-1 self-start rounded-[10px] pl-1 pr-2.5 text-[15px] font-medium text-ink-muted hover:text-ink sm:-mb-3 sm:text-sm"
      >
        <ChevronLeft className="h-[18px] w-[18px]" aria-hidden="true" />
        Back
      </button>

      <header className="flex flex-col gap-1 sm:gap-1.5">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-[26px] font-semibold leading-tight tracking-tight outline-none sm:text-[32px]"
        >
          A few details first
        </h1>
        <p className="text-[15px] leading-normal text-ink-muted sm:text-base">
          Pick what fits. Anything you skip becomes a placeholder you can fill in later.
        </p>
      </header>

      <YouWrote prompt={prompt} variant="line" />

      {!edited && error}

      <div className="overflow-hidden rounded-lg border border-surface-sunk bg-white shadow-card">
        <div className="divide-y divide-surface-sunk">
          <What options={questions.whatOptions} answers={answers} update={update} />
          {asks('when') && <When answers={answers} update={update} />}
          {asks('how_many') && <HowMany answers={answers} update={update} />}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-surface-sunk bg-surface-raised/50 px-4 pb-1.5 pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:py-3 sm:pl-5 sm:pr-4">
          <Link
            href="/app/signups/new?manual=1"
            className="inline-flex min-h-11 items-center self-center text-sm text-ink-muted underline hover:text-ink sm:self-auto"
          >
            Fill in by hand instead
          </Link>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={() => onSend(buildFollowUp(questions, answers, { placeholders: true }))}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-surface-sunk bg-white px-4 text-[15px] font-medium text-ink hover:bg-surface-raised sm:text-sm"
            >
              Draft with placeholders
            </button>
            <button
              type="button"
              onClick={draft}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white shadow-sm transition hover:brightness-110 sm:min-h-11 sm:text-sm"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Draft my signup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Part {
  answers: Answers;
  update: (change: (answers: Answers) => Answers) => void;
}

function What({ options, answers, update }: Part & { options: string[] }) {
  const id = useId();
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
    const next = answers.added[answers.added.indexOf(item) + 1];
    flushSync(() => update((a) => removeAdded(a, item)));
    const nextChip = next === undefined ? undefined : removeRefs.current.get(next);
    (nextChip ?? inputRef.current)?.focus();
  };
  const placeholder = answers.added.length > 0 ? 'Add another' : 'Add your own';
  // Size the box to what it shows, so the pill ends where the words do.
  const chars = Math.min(40, Math.max(answers.pending.length, placeholder.length));

  return (
    <section className="flex flex-col gap-2.5 p-4 sm:gap-3 sm:px-6 sm:py-5">
      <div>
        <p id={id} className={QUESTION}>
          What do people sign up for?
        </p>
        <p className={`${HINT} mt-0.5`}>Pick any that apply, or add your own.</p>
      </div>
      <div
        role="group"
        aria-labelledby={id}
        className="-my-[5px] flex flex-wrap items-center gap-x-1.5"
      >
        {options.map((option) => {
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
        {answers.added.map((item) => (
          <span key={item} className={`${PILL} ${PILL_ON} my-[5px] pr-0`}>
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
              className="-my-[5px] inline-flex h-11 w-8 items-center justify-center rounded-full focus-visible:outline-offset-[-6px]"
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
            className={`my-[5px] inline-flex h-[34px] items-center rounded-full border bg-white pl-3 focus-within:border-solid focus-within:border-brand ${
              answers.pending.trim()
                ? 'border-brand pr-1.5'
                : 'border-dashed border-ink-soft/50 pr-3'
            }`}
          >
            {/* The Add button sits outside the label, so it isn't part of the box's name. */}
            <label className="-my-[5px] inline-flex h-11 cursor-text items-center gap-1.5">
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
                className="min-w-0 max-w-[260px] border-0 bg-transparent p-0 text-base outline-none placeholder:text-ink-soft sm:text-sm"
              />
            </label>
            {answers.pending.trim() && (
              <button
                type="button"
                onClick={add}
                className="group -my-[5px] ml-1.5 inline-flex h-11 items-center focus-visible:outline-none"
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
      {/* Native radios, so arrow keys move between them, drawn as a segmented control. */}
      <div
        role="radiogroup"
        aria-labelledby={`${id}q`}
        className="grid h-11 grid-cols-3 gap-0.5 rounded-lg bg-surface-sunk px-1 sm:inline-flex sm:self-start"
      >
        {WHEN_CHOICES.map((choice) => (
          <label key={choice.kind} className="relative flex h-11 cursor-pointer items-center">
            <input
              type="radio"
              name={`${id}when`}
              value={choice.kind}
              checked={answers.when === choice.kind}
              onChange={() => set({ when: choice.kind })}
              className="peer sr-only"
            />
            <span className="inline-flex h-9 flex-1 items-center justify-center whitespace-nowrap rounded-[9px] px-3.5 text-sm font-medium text-ink-muted peer-checked:bg-white peer-checked:font-semibold peer-checked:text-ink peer-checked:shadow peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand">
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
          {/* The times run a pixel past the border each way, so each is a 44px target. */}
          <span
            className={`${BOX} flex items-center gap-1.5 px-3 focus-within:border-brand sm:pl-2.5 sm:pr-1`}
          >
            <label htmlFor={`${id}from`} className="sr-only">
              Start time (optional)
            </label>
            <input
              id={`${id}from`}
              type="time"
              value={answers.from}
              onChange={(e) => set({ from: e.target.value })}
              className="h-11 min-w-0 flex-1 border-0 bg-transparent p-0 outline-none"
            />
            <span aria-hidden="true" className="text-ink-soft">
              –
            </span>
            <label htmlFor={`${id}to`} className="sr-only">
              End time (optional)
            </label>
            <input
              id={`${id}to`}
              type="time"
              value={answers.to}
              onChange={(e) => set({ to: e.target.value })}
              className="h-11 min-w-0 flex-1 border-0 bg-transparent p-0 outline-none"
            />
          </span>
          <span className="text-[13px] text-ink-soft">Times are optional.</span>
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
        <p className="mb-1.5 mt-1 rounded-[10px] border border-dashed border-surface-sunk px-3.5 py-3 text-sm text-ink-muted">
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
                <span className="inline-flex h-[46px] flex-shrink-0 items-center overflow-hidden rounded-[12px] border border-surface-sunk bg-white shadow-sm focus-within:border-brand">
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
                    // Show what will be sent: a whole number, or empty for no limit.
                    onBlur={() => setCount(item, String(parseCount(count) ?? ''))}
                    className="h-11 w-[72px] border-x border-surface-sunk bg-transparent px-0.5 text-center text-[15px] tabular-nums outline-none [appearance:textfield] placeholder:text-ink-soft sm:w-[76px] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
