import {
  isRealDate,
  isRealTime,
  pairedTimeField,
  resolveAnchorRef,
  type AnchorCandidate,
} from '@/lib/reminder-fields';
import { formatSlotDate, formatSlotTime } from '@/lib/slot-label';
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
 *     Thu, Nov 12 to Sat, Nov 14 · 11:00 AM · 21 spots open
 *     Sign up here, no account needed: https://…/s/book-fair-k3x
 *
 * No count of slots: that's the organizer's word, and the spots are what
 * tell a reader there's room. The middle line leaves out each part that
 * doesn't apply: the dates when no slot has one, the time when the slots
 * don't share one (`dateSpan` says how both read), the spots when an open
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
  const facts = [dateSpan(signup, committedBySlot), spotCount(signup, committedBySlot)].filter(
    (part): part is string => part !== null,
  );
  return [signup.title.trim(), facts.join(' · '), `Sign up here, no account needed: ${url}`]
    .filter(Boolean)
    .join('\n');
}

/**
 * When the slots are, from the date field the reminders use (or the first
 * date field) and the time field paired with it, as the reminders pair them.
 * It reads the slots people can still take, the ones the spots count: open,
 * with a spot left or no limit. The message asks people to sign up, so a
 * closed or full slot doesn't add a day or hide a time the others share.
 * When none has room, it reads the open slots, and when none is open, every
 * slot.
 *
 * - the days: one ("Sat, Nov 14"); days that run on with no gap, as a range
 *   ("Thu, Nov 12 to Sat, Nov 14"); two or three with a gap, named ("Sat,
 *   Nov 7 and Sat, Nov 14", "Sat, Nov 7, Sat, Nov 14 and Sat, Nov 21"); four
 *   or more with a gap, the range again, as a list would run too long;
 * - the time, only when every dated slot (every slot, without dates) has the
 *   same one: after a single day ("Sat, Nov 21, 11:00 AM"), as a part of its
 *   own after several (a time after a range would read as the end's), or on
 *   its own when there are no dates. Formatted as the signup page shows it.
 *
 * Null when there's neither.
 */
function dateSpan(
  { settings, fields, slots: all }: ShareMessageSignup,
  committedBySlot: Record<string, number>,
): string | null {
  const open = all.filter((s) => s.status === 'open');
  const withRoom = open.filter(
    (s) => s.capacity === null || s.capacity - (committedBySlot[s.id] ?? 0) > 0,
  );
  const slots = withRoom.length > 0 ? withRoom : open.length > 0 ? open : all;
  const dateRef = resolveAnchorRef(settings, fields);
  const timeRef = pairedTimeField(fields.find((f) => f.ref === dateRef) ?? null, fields)?.ref;
  const dated = dateRef
    ? slots.filter((s) => {
        const v = s.values[dateRef];
        return typeof v === 'string' && isRealDate(v);
      })
    : [];
  // YYYY-MM-DD strings sort as the days they name.
  const days = [...new Set(dated.map((s) => s.values[dateRef ?? ''] as string))].sort();
  const time = timeRef ? sharedTime(dated.length > 0 ? dated : slots, timeRef) : null;
  const when = dayList(days);
  if (!when) return time;
  if (!time) return when;
  return days.length === 1 ? `${when}, ${time}` : `${when} · ${time}`;
}

/** The time every one of `slots` has in `timeRef`, formatted, or null. */
function sharedTime(slots: ShareMessageSignup['slots'], timeRef: string): string | null {
  const times = new Set(slots.map((s) => s.values[timeRef]));
  const [only] = times;
  if (slots.length === 0 || times.size !== 1 || typeof only !== 'string' || !isRealTime(only)) {
    return null;
  }
  return formatSlotTime(only);
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

/**
 * The body of the email Email it opens. Its subject is the signup's title,
 * so the body starts after the message's first line when that line is the
 * title, as the message starts out; a first line the organizer changed is
 * kept. The link goes back in if an edit took it out, as `withLink` does.
 */
export function emailBody(message: string, title: string, url: string): string {
  const [first = '', ...rest] = message.trim().split('\n');
  const body = first.trim() === title.trim() ? rest.join('\n') : message;
  return withLink(body, url);
}
