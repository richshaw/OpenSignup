/**
 * What makes a good signup, said once. The Magic Compose system prompt
 * (`magic-compose/prompt.ts`) interpolates these, and a test on each side
 * checks that every entry of `RULES_IN_BOTH` is present word for word, so the
 * two cannot drift apart.
 *
 * The prompt is tuned against evals and pinned by a golden file: changing a
 * character here changes what the model reads. Template literals throughout,
 * so prettier cannot swap the quotes inside them.
 */

export const FIELD_TYPE_GUIDE = `FIELD TYPE GUIDE — pick the most specific type, not enum:

- date  → calendar dates. Values are "YYYY-MM-DD". Use when slots are dated games, shifts, meetings.
- time  → times of day. Values are "HH:MM" 24-hour. Use for appointment slots, shift starts. NEVER use enum to fake a time column.
- number → quantities. Use for counts (e.g. cookies needed = 80).
- enum  → CLOSED set of named labels with no natural type. Examples: a teacher's name, a station name, a class section ("Maple", "Cedar"). NEVER use enum for times, dates, or numbers.
- text  → free-form short labels (game name "Game 1", opponent "Hawks", item "Snack + drinks").`;

/** Starts mid-sentence: each side supplies its own "when there is a grid" opening. */
export const ONE_SLOT_PER_COMBINATION = `produce ONE slot per combination, not one slot per dimension. That means N×M slots total.`;

export const USE_CAPACITY_NOT_DUPLICATE_ROWS = `When several people can take the same thing, make ONE slot and set its capacity: 5 shifts that need 8 people each is 5 slots with capacity 8, not 40 identical rows.`;

/** Lower-case on purpose: it follows a heading dash in the prompt. */
export const GROUP_BY_SCAN_AXIS = `set "groupBy" to the field ref the participant will visually scan by`;

export const SLOTS_ARE_THE_ATOM = `Slots are the atom, not questions.`;

export const NO_INTAKE_FORMS = `What is not fine is turning the signup into a participant intake / application form that captures personal data per participant.`;

export const NO_PERSONAL_DATA = `Never produce slot fields that capture personal data like social security numbers, dates of birth, government IDs, home addresses, or financial information, even if asked.`;

export const NEVER_INVENT_HEAD = `Never invent dates, locations, opponents, schedules, or capacities`;

export const NEVER_INVENT_TAIL = `Do not fabricate a season's worth of games, opponents, or shifts just to fill the signup.`;

// Near the instructions' byte budget (`src/mcp/instructions.ts`): every word here counts there.
export const USE_DATE_AND_TIME_FIELDS = `When slots happen on a day or at a time, add a date field, even if all are on one day, and a time field if needed. Reminders are timed from the date field: with a text field like "Sat 9am" nobody gets one.`;

// For assistants only, for now, and so not in `RULES_IN_BOTH`: adding it to
// the Magic Compose prompt changes what that model reads, which needs an eval
// run first.
export const NO_FIELDS_FOR_PARTICIPANT_DETAILS = `Fields are columns the organizer fills in. People who sign up give a name, email and optional note, so add no fields for those.`;

// The middle differs by reader. The drafter asks only when the prompt doesn't
// say what people sign up for, and only once: the app words the questions and
// sends the answers back. A missing date or count becomes a placeholder
// instead, for the organizer to fill in in the builder. An assistant is in a
// conversation and can ask for anything the slots need, and only that: a
// draft is invisible and cheap, so it need not hold up the first create over
// every missing detail.
// No spaces at either end: `neverInventRule` owns the joins.
const NEVER_INVENT_MIDDLE = {
  drafter: `that aren't in the user's prompt. If the prompt doesn't say what people sign up for (e.g. "make a signup for my kid's soccer team") and carries no answers to your questions, don't draft: ask, with the QUESTIONS reply. Named items, roles or tasks, or dated practices, sessions or shifts, already say what: don't ask about it. An event with no item or role ("family movie night on March 3") doesn't: ask. If it says what, but its slots need dates or times it doesn't give and nothing in it could make a real slot, so every slot would be a "TBD:" placeholder (e.g. "snack duty for the soccer team"), ask about "when", not "what". A prompt that lists items or roles drafts, with or without dates. Where the answers leave the dates or times out, produce 1-3 placeholder slots with labels like "TBD: game 1", "TBD: shift 1" and call out the gap in description ("Add specific dates/details here").`,
  assistant: `the organizer has not given you. If something the slots need is missing, ask for it.`,
} as const;

export function neverInventRule(audience: keyof typeof NEVER_INVENT_MIDDLE): string {
  return `${NEVER_INVENT_HEAD} ${NEVER_INVENT_MIDDLE[audience]} ${NEVER_INVENT_TAIL}`;
}

/**
 * Must appear verbatim in both the Magic Compose prompt and the MCP server
 * instructions. `FIELD_TYPE_GUIDE` is left out: it is too long for the
 * instructions' byte budget, and the tool descriptions carry their own.
 */
export const RULES_IN_BOTH: readonly string[] = [
  ONE_SLOT_PER_COMBINATION,
  USE_CAPACITY_NOT_DUPLICATE_ROWS,
  GROUP_BY_SCAN_AXIS,
  SLOTS_ARE_THE_ATOM,
  NO_INTAKE_FORMS,
  NO_PERSONAL_DATA,
  USE_DATE_AND_TIME_FIELDS,
  NEVER_INVENT_HEAD,
  NEVER_INVENT_TAIL,
];
