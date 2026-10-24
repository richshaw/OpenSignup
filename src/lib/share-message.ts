import { isRealDate, resolveAnchorRef, type AnchorCandidate } from '@/lib/reminder-fields';
import { formatSlotDate } from '@/lib/slot-label';
import { spotCounts } from '@/lib/spot-counts';

/** What the share message reads from a signup. `SignupWithSlots` has it all. */
export interface ShareMessageSignup {
  title: string;
  settings: { reminderFromFieldRef?: string | undefined };
  fields: readonly AnchorCandidate[];
  slots: readonly {
    id: string;
    values: Record<string, unknown>;
    capacity: number | null;
    status: string;
  }[];
}

/**
 * The message the share panel offers to send with a signup's link, built
 * from the signup's own data and nothing else:
 *
 *     Fall book fair volunteers
 *     Thu, Nov 12 to Sat, Nov 14 · 8 slots · 21 spots
 *     Sign up here: https://…/s/book-fair-k3x
 *
 * The middle line leaves out each part that doesn't apply: the dates when
 * no slot has one, the spots when any slot has no limit, and the line
 * itself when nothing is left. The organizer can change it before sending.
 */
export function shareMessage(signup: ShareMessageSignup, url: string): string {
  const facts = [dateSpan(signup), slotCount(signup), spotCount(signup)].filter(
    (part): part is string => part !== null,
  );
  return [signup.title.trim(), facts.join(' · '), `Sign up here: ${url}`]
    .filter(Boolean)
    .join('\n');
}

/**
 * The days the slots fall on, from the date field the reminders use (or
 * the first date field): "Sat, Nov 14", or "Thu, Nov 12 to Sat, Nov 14".
 */
function dateSpan({ settings, fields, slots }: ShareMessageSignup): string | null {
  const ref = resolveAnchorRef(settings, fields);
  if (!ref) return null;
  // YYYY-MM-DD strings sort as the days they name.
  const days = [
    ...new Set(
      slots
        .map((s) => s.values[ref])
        .filter((v): v is string => typeof v === 'string' && isRealDate(v)),
    ),
  ].sort();
  const first = formatSlotDate(days[0]);
  const last = formatSlotDate(days[days.length - 1]);
  if (!first || !last) return null;
  return days.length === 1 ? first : `${first} to ${last}`;
}

function slotCount({ slots }: ShareMessageSignup): string | null {
  if (slots.length === 0) return null;
  return slots.length === 1 ? '1 slot' : `${slots.length} slots`;
}

/** Every slot's spots added up, or null when any slot has no limit. */
function spotCount({ slots }: ShareMessageSignup): string | null {
  if (slots.length === 0) return null;
  // Only the total matters here, so nothing taken is passed in.
  const { total } = spotCounts(slots, {});
  if (total === null) return null;
  return total === 1 ? '1 spot' : `${total} spots`;
}

/**
 * What the panel sends (copied, shared or emailed): the message as the
 * organizer left it, with the link added on a line of its own if they took
 * it out, since a message without the link can't be signed up from.
 */
export function withLink(message: string, url: string): string {
  const text = message.trim();
  if (text.includes(url)) return text;
  return text ? `${text}\n${url}` : url;
}
