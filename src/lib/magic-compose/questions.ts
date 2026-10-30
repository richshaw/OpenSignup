/**
 * The shapes of Magic Compose's questions round, shared by the route and the
 * page. No zod here, so the page can import the topic list and the types
 * without the schemas: those are `QuestionsSchema` in `prompt.ts` (the model's
 * reply) and `FollowUpSchema` in `follow-up.ts` (the organizer's answers).
 *
 * The model words none of the questions. It names which topics the
 * description leaves open and offers a few options for "what"; the page asks
 * in its own words, with its own date and number controls, so nothing can make
 * up a date or a count.
 */

export const QUESTION_TOPICS = ['what', 'when', 'how_many'] as const;
type QuestionTopic = (typeof QUESTION_TOPICS)[number];

/**
 * The model's reply when it can't draft real slots, each topic once. Asking
 * `what` (the description doesn't say what people sign up for),
 * `whatOptions` holds two to four distinct things people could sign up for.
 * Not asking it (the description says what, but every slot would be a "TBD:"
 * placeholder), `topics` includes `when`, and `whatOptions` holds one to four
 * things the description names, which the page shows already picked.
 */
export interface MagicComposeQuestions {
  topics: QuestionTopic[];
  whatOptions: string[];
}

/** "When is it?": a date the app's own controls picked, a few words, or not yet. */
export type WhenAnswer =
  | { kind: 'one_day'; date: string; from?: string; to?: string }
  | { kind: 'several'; text: string }
  | { kind: 'not_decided' };

/**
 * The organizer's answers, sent with the description on the second call. The
 * browser sends answers, never the questions, so nothing it sends can pose as
 * the model's own turn. One key per topic that was asked: `what` always,
 * `when` and `howMany` only when asked.
 */
export interface FollowUp {
  /**
   * The options picked and the organizer's own items, kept apart only so the
   * server can count each; the draft gets them as one list, picked first.
   * Both empty means the question was skipped.
   */
  what: { picked: string[]; added: string[] };
  /** `not_decided` means skipped. */
  when?: WhenAnswer;
  /**
   * One count per item of `[...what.picked, ...what.added]`, in that order: a
   * whole number of people, or null for no limit (an empty box). Sent only
   * when "how many" was asked and there are items to count.
   */
  howMany?: Array<number | null>;
}

/**
 * Text as the questions round compares and sends it: trimmed, with every run
 * of whitespace (newlines too) made one space. The page and the server both
 * use it, so an item that looks the same on screen is the same to both.
 */
export function tidyText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** The items a follow-up drafts from, in the order `howMany` counts them. */
export function followUpItems(followUp: FollowUp): string[] {
  return [...followUp.what.picked, ...followUp.what.added];
}

/**
 * Every answer in its skipped form: nothing to sign up for and no day, so the
 * draft is all placeholders. (`howMany` comes only with items.)
 */
export function answeredNothing(followUp: FollowUp): boolean {
  return (
    followUpItems(followUp).length === 0 && (!followUp.when || followUp.when.kind === 'not_decided')
  );
}
