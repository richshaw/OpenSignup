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
 * from the signup's own data and nothing else, in words the people it's
 * sent to know:
 *
 *     Fall book fair volunteers
 *     Thu, Nov 12 to Sat, Nov 14 · 21 spots open
 *     Sign up here, no account needed: https://…/s/book-fair-k3x
 *
 * No count of slots: that's the organizer's word, and the spots are what
 * tell a reader there's room. The middle line leaves out each part that
 * doesn't apply: the dates when no slot has one (`dateSpan` says how they
 * read), the spots when an open
 * slot has no limit or none are left, and the line itself when nothing is
 * left, so a signup with no dates and no limits gets its title and the
 * link. Once people have signed up, the spots are the ones still open
 * ("18 spots left"), from `committedBySlot` (as the commitments service
 * counts them; none for a draft). The description stays out: a link
 * preview shows it already. The organizer can change it before sending.
 */
export function shareMessage(
  signup: ShareMessageSignup,
  url: string,
  committedBySlot: Record<string, number> = {},
): string {
  const facts = [dateSpan(signup), spotCount(signup, committedBySlot)].filter(
    (part): part is string => part !== null,
  );
  return [signup.title.trim(), facts.join(' · '), `Sign up here, no account needed: ${url}`]
    .filter(Boolean)
    .join('\n');
}

/**
 * The days the slots fall on, from the date field the reminders use (or the
 * first date field): one ("Sat, Nov 14"); days that run on with no gap, as a
 * range ("Thu, Nov 12 to Sat, Nov 14"); two or three with a gap, named
 * ("Sat, Nov 7 and Sat, Nov 14", "Sat, Nov 7, Sat, Nov 14 and Sat, Nov
 * 21"); four or more with a gap, the range again, as a list would run too
 * long. Null when no slot has a date.
 */
function dateSpan({ settings, fields, slots }: ShareMessageSignup): string | null {
  const dateRef = resolveAnchorRef(settings, fields);
  if (!dateRef) return null;
  // YYYY-MM-DD strings sort as the days they name.
  const days = [
    ...new Set(
      slots
        .map((s) => s.values[dateRef])
        .filter((v): v is string => typeof v === 'string' && isRealDate(v)),
    ),
  ].sort();
  return dayList(days);
}

/** The days, sorted and distinct, in words; see `dateSpan`. */
function dayList(days: string[]): string | null {
  const named = days.map((d) => formatSlotDate(d)).filter((d): d is string => d !== null);
  if (named.length !== days.length || named.length === 0) return null;
  const first = named[0]!;
  const last = named[named.length - 1]!;
  if (named.length === 1) return first;
  const runsOn = days.every((d, i) => i === 0 || d === nextDay(days[i - 1]!));
  if (runsOn || named.length >= 4) return `${first} to ${last}`;
  return `${named.slice(0, -1).join(', ')} and ${last}`;
}

/** The calendar day after a YYYY-MM-DD day, in the same form. */
function nextDay(day: string): string {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + 1);
  return at.toISOString().slice(0, 10);
}

/**
 * The spots people can take, added up over the open slots: "21 spots open"
 * before anyone has signed up, "18 spots left" after. Null when an open
 * slot has no limit, or when no spot is left to offer.
 */
function spotCount(
  { slots }: ShareMessageSignup,
  committedBySlot: Record<string, number>,
): string | null {
  const { taken, open } = spotCounts(slots, committedBySlot);
  if (open === null || open === 0) return null;
  const spots = open === 1 ? '1 spot' : `${open} spots`;
  return `${spots} ${taken === 0 ? 'open' : 'left'}`;
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
