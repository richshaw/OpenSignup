import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * A yes-or-no question right after a save, offering a change that often goes
 * with it, such as "Use Svenska for your open signups too?". It's a flash: the
 * page the save comes back to shows it for its own `saved` value, from what's
 * stored, so nothing records that it was asked and it's gone on the next
 * visit. Yes sends `fields` to `action`; No is a link to `noHref`, the page
 * without the question. Both are plain HTML, so it adds no script.
 *
 * It appears under the Save that brought it, which on a phone is often at the
 * bottom of the screen or under the signup's Share bar, so Yes takes the
 * focus as it appears (`autoFocus`) and the browser scrolls it into view: clear
 * of the bar, which the page's `scroll-padding-bottom` leaves room for, and
 * with the box's own edge (`scroll-mb-4`). React focuses Yes when the question
 * comes with the page after a save, and the HTML carries `autofocus` for a full
 * page load, so it adds no script. Only a button, input, select or textarea
 * takes focus this way, so it's Yes rather than the group. The save's address
 * can't do it with a fragment: Next drops the fragment from a server action's
 * redirect.
 *
 * The question is a live region, like the "Saved" beside the button that
 * brought it, so a screen reader hears it arrive, and it names the group the
 * answers are in, so it's read out with the focus, as Close signup's question
 * is (`CloseSignupConfirm`), whose buttons these look like.
 */
export function SaveQuestion({
  id,
  question,
  action,
  fields,
  noHref,
}: {
  /** The question's id, unique on the page. */
  id: string;
  question: ReactNode;
  action: (formData: FormData) => void | Promise<void>;
  /** What Yes sends, as hidden fields. */
  fields: Record<string, string>;
  /**
   * The page without the question, with a fragment naming the form whose save
   * asked it, so No keeps the organizer's place there rather than going back
   * to the top of the page.
   */
  noHref: string;
}) {
  return (
    <div
      role="group"
      aria-labelledby={id}
      className="space-y-2 rounded-lg bg-brand/10 px-3 py-2 text-sm"
    >
      <p id={id} role="status" className="font-medium text-ink">
        {question}
      </p>
      {/* Both have a border, so they're the same height. */}
      <div className="flex flex-wrap items-center gap-2">
        <form action={action}>
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <button
            autoFocus
            type="submit"
            className="scroll-mb-4 rounded-lg border border-brand bg-brand px-3 py-1.5 font-medium text-white transition hover:bg-brand-hover"
          >
            Yes
          </button>
        </form>
        <Link
          href={noHref}
          className="rounded-lg border border-surface-sunk bg-white px-3 py-1.5 font-medium text-ink transition hover:bg-surface-raised"
        >
          No
        </Link>
      </div>
    </div>
  );
}
