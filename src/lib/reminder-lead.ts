// No imports, on purpose: the Build tab's client components print
// REMINDER_LEAD_WORDS, and anything this module pulled in would land in that
// page's JavaScript (budgets.json caps it).

/**
 * Hours before a slot that its reminder goes out: the day before.
 *
 * Fixed rather than configurable. `extractSlotAt` pins the organizer's wall
 * clock to UTC because a signup carries no timezone, so every reminder instant
 * is off by the organizer's UTC offset. At a day's lead that is a rounding
 * error nobody notices; at two hours it exceeds the lead itself. A date-only
 * slot anchors at noon UTC for the same reason: a day before noon UTC is still
 * the day before from UTC-11 to UTC+11, where a day before midnight UTC was
 * two days early for everyone west of Greenwich. A day also matches what
 * organizers coming from SignUp.com expect (issue #165). Shorter leads can
 * return once a signup carries a real timezone.
 */
export const REMINDER_LEAD_HOURS = 24;

/**
 * `REMINDER_LEAD_HOURS` in words, for every place that tells people when the
 * reminder goes out (the builder, the confirmation email, the privacy page,
 * help), so they all change together if the lead ever does.
 */
export const REMINDER_LEAD_WORDS =
  REMINDER_LEAD_HOURS === 24 ? 'the day before' : `${REMINDER_LEAD_HOURS} hours before`;
