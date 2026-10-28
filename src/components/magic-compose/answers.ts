import {
  EARLIEST_DATE_YEAR,
  HOW_MANY_MAX,
  WHAT_ITEM_MAX_LENGTH,
  WHAT_ITEMS_MAX,
  WHEN_TEXT_MAX_LENGTH,
} from '@/lib/magic-compose/limits';
import {
  followUpItems,
  tidyText,
  type FollowUp,
  type MagicComposeQuestions,
  type WhenAnswer,
} from '@/lib/magic-compose/questions';

/**
 * The questions screen's boxes, as the organizer left them. Kept by the page
 * rather than the screen, so Cancel and an error come back to every pick,
 * date and number. `buildFollowUp` turns it into what the server gets.
 */
export interface Answers {
  /** Options picked, in the order the model offered them. */
  picked: string[];
  /** The organizer's own items, in the order they added them. */
  added: string[];
  /** Typed into "Add your own" but not added yet. */
  pending: string;
  when: WhenAnswer['kind'];
  date: string;
  from: string;
  to: string;
  several: string;
  /** Each item's count box as typed, by item. Empty means no limit. */
  counts: Record<string, string>;
}

export const NO_ANSWERS: Answers = {
  picked: [],
  added: [],
  pending: '',
  when: 'one_day',
  date: '',
  from: '',
  to: '',
  several: '',
  counts: {},
};

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function answeredItems(answers: Answers): string[] {
  return [...answers.picked, ...answers.added];
}

export function isFull(answers: Answers): boolean {
  return answeredItems(answers).length >= WHAT_ITEMS_MAX;
}

/** Picks or unpicks an option, keeping the picks in the model's order. */
export function togglePick(answers: Answers, option: string, options: string[]): Answers {
  const on = answers.picked.includes(option);
  if (!on && isFull(answers)) return answers;
  const picked = options.filter((o) => (o === option ? !on : answers.picked.includes(o)));
  return { ...answers, picked };
}

/**
 * Adds what's in "Add your own" as an item of the organizer's own. Text that
 * matches an option picks that option instead, and text already on the list
 * is dropped, so nothing appears twice.
 */
export function addPending(answers: Answers, options: string[]): Answers {
  const text = tidyText(answers.pending).slice(0, WHAT_ITEM_MAX_LENGTH);
  const cleared = { ...answers, pending: '' };
  if (!text || answeredItems(answers).some((item) => same(item, text))) return cleared;
  const option = options.find((o) => same(o, text));
  if (option) return togglePick(cleared, option, options);
  if (isFull(answers)) return answers;
  return { ...cleared, added: [...answers.added, text] };
}

export function removeAdded(answers: Answers, item: string): Answers {
  return { ...answers, added: answers.added.filter((a) => a !== item) };
}

/**
 * A count box's number of people, or null for no limit (empty, zero or below,
 * or unreadable). Not rounded: `answersProblem` asks for a whole number instead.
 */
export function parseCount(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  // A fraction is left as typed, however large, for `answersProblem` to stop.
  return Number.isInteger(n) ? Math.min(n, HOW_MANY_MAX) : n;
}

/**
 * What − or + leaves in a count box: the next whole number down or up. From
 * no limit, either one starts at 1.
 */
export function stepCount(raw: string | undefined, by: 1 | -1): string {
  const n = parseCount(raw);
  if (n === null) return '1';
  const next = by > 0 ? Math.floor(n) + 1 : Math.ceil(n) - 1;
  return String(Math.min(HOW_MANY_MAX, Math.max(1, next)));
}

function whenAnswer(answers: Answers): WhenAnswer {
  if (answers.when === 'one_day' && answers.date) {
    return {
      kind: 'one_day',
      date: answers.date,
      ...(answers.from ? { from: answers.from } : {}),
      ...(answers.to ? { to: answers.to } : {}),
    };
  }
  const text = tidyText(answers.several).slice(0, WHEN_TEXT_MAX_LENGTH);
  if (answers.when === 'several' && text) return { kind: 'several', text };
  // "One day" with no date, or "Several days" left empty, says no more than "Not decided".
  return { kind: 'not_decided' };
}

/**
 * The answers as the server takes them (see `FollowUp`): one key per topic
 * that was asked, every value in its tidy or skipped form. `placeholders` is
 * for Draft with placeholders when nothing is answered (see `hasAnswers`): it
 * sends every asked topic skipped, whatever the boxes hold, as the server
 * refuses the flag beside any answer.
 */
export function buildFollowUp(
  questions: MagicComposeQuestions,
  answers: Answers,
  { placeholders = false }: { placeholders?: boolean } = {},
): FollowUp {
  const asks = (topic: MagicComposeQuestions['topics'][number]) => questions.topics.includes(topic);
  if (placeholders) {
    return {
      what: { picked: [], added: [] },
      ...(asks('when') ? { when: { kind: 'not_decided' as const } } : {}),
      placeholders: true,
    };
  }
  const what = {
    picked: answers.picked.filter((p) => questions.whatOptions.includes(p)),
    added: answers.added,
  };
  const items = [...what.picked, ...what.added];
  return {
    what,
    ...(asks('when') ? { when: whenAnswer(answers) } : {}),
    ...(asks('how_many') && items.length > 0
      ? { howMany: items.map((item) => parseCount(answers.counts[item])) }
      : {}),
  };
}

/**
 * Whether two sets of boxes hold the same answers. Every change builds the
 * next set from the last by spreading it, so keys keep their order and equal
 * answers serialize the same.
 */
export function sameAnswers(a: Answers, b: Answers): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Whether any box holds an answer: an item (words still in "Add your own"
 * included), a day or days, or a time. Draft with placeholders then drafts
 * from them, as Draft my signup does, rather than dropping them.
 */
export function hasAnswers(questions: MagicComposeQuestions, answers: Answers): boolean {
  if (answeredItems(answers).length > 0 || tidyText(answers.pending)) return true;
  if (!questions.topics.includes('when')) return false;
  if (answers.when === 'one_day') return Boolean(answers.date || answers.from || answers.to);
  return answers.when === 'several' && tidyText(answers.several) !== '';
}

/**
 * Why these answers can't go yet, in the words the screen shows, or null. It
 * reads the boxes rather than `buildFollowUp`, which drops times with no date.
 */
export function answersProblem(questions: MagicComposeQuestions, answers: Answers): string | null {
  const { date, from, to } = answers;
  if (questions.topics.includes('when') && answers.when === 'one_day' && (date || from || to)) {
    // With no date the answer would go as "not decided", and the times with it.
    if (!date) return 'Add a date, or leave the times empty.';
    // A short year is an easy slip in a date box (202 becomes 0202), and the
    // server refuses a year before EARLIEST_DATE_YEAR, or one that isn't four
    // digits, as not a real day.
    const year = date.split('-')[0] ?? '';
    if (year.length !== 4 || Number(year) < EARLIEST_DATE_YEAR) return "Check the date's year.";
    if (from && to && from >= to) return 'The end time must be after the start time.';
  }
  // A count isn't rounded, so 2.5 is stopped here rather than sent as 3.
  if (
    questions.topics.includes('how_many') &&
    answeredItems(answers).some((item) => {
      const count = parseCount(answers.counts[item]);
      return count !== null && !Number.isInteger(count);
    })
  ) {
    return 'Use whole numbers for how many people.';
  }
  return null;
}

/** "9am", "1:30pm", "12pm" for noon. */
function formatTime(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  const hour = h % 12 || 12;
  return `${hour}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

/** How long from `start` to `end`, both "HH:MM": "15 min", "4 hr", "1 hr 30 min". */
export function timeLength(start: string, end: string): string {
  const minutes = (hhmm: string) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3);
  const length = minutes(end) - minutes(start);
  const h = Math.floor(length / 60);
  const m = length % 60;
  return [h && `${h} hr`, m && `${m} min`].filter(Boolean).join(' ');
}

/** "9am to 1pm", "from 9am" or "until 1pm", or null with neither time. */
function formatTimes({ from, to }: { from?: string; to?: string }): string | null {
  if (from && to) return `${formatTime(from)} to ${formatTime(to)}`;
  if (from) return `from ${formatTime(from)}`;
  return to ? `until ${formatTime(to)}` : null;
}

/**
 * A one-day answer's day and times, as the screen and Back write them:
 * "Saturday, November 14" (with the year when it isn't this one) and
 * "9am to 1pm", "from 9am" or "until 1pm".
 */
export function formatOneDay(
  when: Extract<WhenAnswer, { kind: 'one_day' }>,
  now: Date = new Date(),
): { day: string; times: string | null } {
  const [y = 0, m = 1, d = 1] = when.date.split('-').map(Number);
  const at = new Date(0);
  at.setUTCFullYear(y, m - 1, d);
  const day = at.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
    ...(y === now.getFullYear() ? {} : { year: 'numeric' }),
  });
  return { day, times: formatTimes(when) };
}

/**
 * The description with the answers so far added as plain lines, for Back:
 *
 *   Bake sale for the PTA
 *   What: Bake something to sell (no limit), Staff the table (2)
 *   When: Saturday, November 14, 9am to 1pm
 *
 * Items keep their case as typed, so a name like "Maple class" survives, and
 * times with no date yet go alone ("When: 9am to 1pm"). A skipped topic adds
 * no line, so the next draft can ask about it again.
 */
export function appendAnswers(
  prompt: string,
  questions: MagicComposeQuestions,
  answers: Answers,
  now?: Date,
): string {
  const followUp = buildFollowUp(questions, answers);
  const lines: string[] = [];
  const items = followUpItems(followUp);
  if (items.length > 0) {
    const counts = followUp.howMany;
    const described = items.map((item, i) =>
      counts ? `${item} (${counts[i] ?? 'no limit'})` : item,
    );
    lines.push(`What: ${described.join(', ')}`);
  }
  const when = followUp.when;
  if (when?.kind === 'one_day') {
    const { day, times } = formatOneDay(when, now);
    lines.push(`When: ${times ? `${day}, ${times}` : day}`);
  } else if (when?.kind === 'several') {
    lines.push(`When: ${when.text}`);
  } else if (when && answers.when === 'one_day') {
    const times = formatTimes(answers);
    if (times) lines.push(`When: ${times}`);
  }
  if (lines.length === 0) return prompt;
  return [prompt.trimEnd(), ...lines].join('\n');
}
