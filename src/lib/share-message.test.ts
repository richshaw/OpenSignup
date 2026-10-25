import { describe, expect, it } from 'vitest';
import { emailBody, shareMessage, withLink, type ShareMessageSignup } from './share-message';

const LINK = 'https://your-site.example/s/book-fair-k3x';
const SIGN_UP = `Sign up here, no account needed: ${LINK}`;

const WHAT = { ref: 'what', fieldType: 'text', sortOrder: 0 } as const;
const DATE = { ref: 'date', fieldType: 'date', sortOrder: 1 } as const;

function signup(overrides: Partial<ShareMessageSignup> = {}): ShareMessageSignup {
  return {
    title: 'Fall book fair volunteers',
    settings: {},
    fields: [WHAT, DATE],
    slots: [],
    ...overrides,
  };
}

let slotIds = 0;
function slot(date: string | undefined, capacity: number | null = 1) {
  const values = date === undefined ? { what: 'Setup' } : { what: 'Setup', date };
  return { id: `slot_${++slotIds}`, values, capacity, status: 'open' };
}

describe('shareMessage', () => {
  it('says the title, the dates and the spots open, then the link and that no account is needed', () => {
    const slots = [
      slot('2026-11-12', 3),
      slot('2026-11-12', 3),
      slot('2026-11-13', 3),
      slot('2026-11-13', 3),
      slot('2026-11-13', 2),
      slot('2026-11-14', 3),
      slot('2026-11-14', 2),
      slot('2026-11-14', 2),
    ];
    expect(shareMessage(signup({ slots }), LINK)).toBe(
      `Fall book fair volunteers\nThu, Nov 12 to Sat, Nov 14 · 21 spots open\n${SIGN_UP}`,
    );
  });

  it('says only the spots for one undated slot, and never how many slots there are', () => {
    const slots = [{ id: 'slot_a', values: { what: 'Litter pick' }, capacity: 20, status: 'open' }];
    expect(shareMessage(signup({ title: 'Litter Pick', fields: [WHAT], slots }), LINK)).toBe(
      `Litter Pick\n20 spots open\n${SIGN_UP}`,
    );
  });

  it('names the one date when every slot is on the same day', () => {
    const slots = [slot('2026-11-14', 4), slot('2026-11-14', 2)];
    expect(shareMessage(signup({ slots }), LINK)).toBe(
      `Fall book fair volunteers\nSat, Nov 14 · 6 spots open\n${SIGN_UP}`,
    );
  });

  it('runs from the earliest date to the latest, whatever order the slots are in', () => {
    const slots = [slot('2026-11-14'), slot('2026-11-12'), slot('2026-12-01'), slot('2026-11-13')];
    expect(shareMessage(signup({ slots }), LINK)).toBe(
      `Fall book fair volunteers\nThu, Nov 12 to Tue, Dec 1 · 4 spots open\n${SIGN_UP}`,
    );
  });

  it('ignores blank and impossible dates', () => {
    const slots = [slot(undefined), slot(''), slot('2026-02-30'), slot('2026-11-14')];
    expect(shareMessage(signup({ slots }), LINK)).toBe(
      `Fall book fair volunteers\nSat, Nov 14 · 4 spots open\n${SIGN_UP}`,
    );
  });

  it('leaves the dates out when no slot has one yet', () => {
    const slots = [slot(undefined), slot('')];
    expect(shareMessage(signup({ slots }), LINK)).toBe(
      `Fall book fair volunteers\n2 spots open\n${SIGN_UP}`,
    );
  });

  it('reads the date field the reminders use, not just the first one', () => {
    const fields = [
      { ref: 'setup-day', fieldType: 'date', sortOrder: 0 },
      { ref: 'fair-day', fieldType: 'date', sortOrder: 1 },
    ] as const;
    const slots = [
      {
        id: 'slot_a',
        values: { 'setup-day': '2026-11-10', 'fair-day': '2026-11-14' },
        capacity: 1,
        status: 'open',
      },
    ];
    expect(
      shareMessage(signup({ fields, slots, settings: { reminderFromFieldRef: 'fair-day' } }), LINK),
    ).toBe(`Fall book fair volunteers\nSat, Nov 14 · 1 spot open\n${SIGN_UP}`);
    expect(shareMessage(signup({ fields, slots }), LINK)).toBe(
      `Fall book fair volunteers\nTue, Nov 10 · 1 spot open\n${SIGN_UP}`,
    );
  });

  it('leaves the spots out when an open slot has no limit', () => {
    const slots = [slot('2026-11-14', 3), slot('2026-11-14', null)];
    expect(shareMessage(signup({ slots }), LINK)).toBe(
      `Fall book fair volunteers\nSat, Nov 14\n${SIGN_UP}`,
    );
  });

  it('says how many spots are left once people have signed up', () => {
    const slots = [slot('2026-11-14', 3), slot('2026-11-14', 4)];
    const [first, second] = slots as [(typeof slots)[0], (typeof slots)[0]];
    expect(shareMessage(signup({ slots }), LINK, { [first.id]: 2, [second.id]: 1 })).toBe(
      `Fall book fair volunteers\nSat, Nov 14 · 4 spots left\n${SIGN_UP}`,
    );
    expect(shareMessage(signup({ slots }), LINK, { [first.id]: 3, [second.id]: 3 })).toBe(
      `Fall book fair volunteers\nSat, Nov 14 · 1 spot left\n${SIGN_UP}`,
    );
  });

  it('leaves the spots out when none are left', () => {
    const slots = [slot('2026-11-14', 2), slot('2026-11-14', 1)];
    const [first, second] = slots as [(typeof slots)[0], (typeof slots)[0]];
    expect(shareMessage(signup({ slots }), LINK, { [first.id]: 2, [second.id]: 1 })).toBe(
      `Fall book fair volunteers\nSat, Nov 14\n${SIGN_UP}`,
    );
  });

  it('offers no spots on a closed slot, and an over-full one takes none from another', () => {
    const slots = [
      slot('2026-11-14', 3),
      { ...slot('2026-11-14', 5), status: 'closed' },
      slot('2026-11-14', 2),
    ];
    const [first, , third] = slots as [(typeof slots)[0], unknown, (typeof slots)[0]];
    expect(shareMessage(signup({ slots }), LINK)).toBe(
      `Fall book fair volunteers\nSat, Nov 14 · 5 spots open\n${SIGN_UP}`,
    );
    expect(shareMessage(signup({ slots }), LINK, { [first.id]: 4, [third.id]: 1 })).toBe(
      `Fall book fair volunteers\nSat, Nov 14 · 1 spot left\n${SIGN_UP}`,
    );
  });

  it('says one spot in the singular', () => {
    expect(shareMessage(signup({ slots: [slot('2026-11-14', 1)] }), LINK)).toBe(
      `Fall book fair volunteers\nSat, Nov 14 · 1 spot open\n${SIGN_UP}`,
    );
  });

  it('is the title and the link alone with no dates and no limit', () => {
    const slots = [{ id: 'slot_a', values: { what: 'Snacks' }, capacity: null, status: 'open' }];
    expect(shareMessage(signup({ fields: [WHAT], slots }), LINK)).toBe(
      `Fall book fair volunteers\n${SIGN_UP}`,
    );
  });

  it('leaves the middle line out when there is nothing to say', () => {
    expect(shareMessage(signup({ fields: [WHAT], slots: [] }), LINK)).toBe(
      `Fall book fair volunteers\n${SIGN_UP}`,
    );
  });

  it('trims the title', () => {
    expect(shareMessage(signup({ title: '  Bake sale \n', slots: [] }), LINK)).toBe(
      `Bake sale\n${SIGN_UP}`,
    );
  });
});

describe('shareMessage: when the slots are', () => {
  const TIME = { ref: 'time', fieldType: 'time', sortOrder: 2 } as const;
  const timed = (
    date: string | undefined,
    time: string | undefined,
    capacity: number | null = 1,
  ) => {
    const values: Record<string, string> = { what: 'Litter pick' };
    if (date !== undefined) values.date = date;
    if (time !== undefined) values.time = time;
    return { id: `slot_${++slotIds}`, values, capacity, status: 'open' };
  };
  const line = (slots: ShareMessageSignup['slots'], fields: ShareMessageSignup['fields']) =>
    shareMessage(signup({ fields, slots }), LINK).split('\n')[1];
  const days = (...dates: string[]) => dates.map((d) => slot(d));

  it('names one day', () => {
    expect(line(days('2026-11-14', '2026-11-14'), [WHAT, DATE])).toBe('Sat, Nov 14 · 2 spots open');
  });

  it('gives days that run on with no gap as a range', () => {
    expect(line(days('2026-11-13', '2026-11-12', '2026-11-14'), [WHAT, DATE])).toBe(
      'Thu, Nov 12 to Sat, Nov 14 · 3 spots open',
    );
    expect(line(days('2026-11-13', '2026-11-14'), [WHAT, DATE])).toBe(
      'Fri, Nov 13 to Sat, Nov 14 · 2 spots open',
    );
    // Across a month's end.
    expect(line(days('2026-10-31', '2026-11-01'), [WHAT, DATE])).toBe(
      'Sat, Oct 31 to Sun, Nov 1 · 2 spots open',
    );
  });

  it('names two days with a gap', () => {
    expect(line(days('2026-11-14', '2026-11-07'), [WHAT, DATE])).toBe(
      'Sat, Nov 7 and Sat, Nov 14 · 2 spots open',
    );
  });

  it('names three days with a gap', () => {
    expect(line(days('2026-11-21', '2026-11-07', '2026-11-14'), [WHAT, DATE])).toBe(
      'Sat, Nov 7, Sat, Nov 14 and Sat, Nov 21 · 3 spots open',
    );
    // A gap anywhere is a gap.
    expect(line(days('2026-11-12', '2026-11-13', '2026-11-20'), [WHAT, DATE])).toBe(
      'Thu, Nov 12, Fri, Nov 13 and Fri, Nov 20 · 3 spots open',
    );
  });

  it('gives four days or more with a gap as a range, rather than a long list', () => {
    expect(line(days('2026-11-07', '2026-11-14', '2026-11-21', '2026-11-28'), [WHAT, DATE])).toBe(
      'Sat, Nov 7 to Sat, Nov 28 · 4 spots open',
    );
  });

  it('adds a time every slot shares to its one day', () => {
    const slots = [timed('2026-11-21', '11:00', 10), timed('2026-11-21', '11:00', 9)];
    expect(line(slots, [WHAT, DATE, TIME])).toBe('Sat, Nov 21, 11:00\u00a0AM · 19 spots open');
  });

  it('gives a time several days share as a part of its own, not as the range’s end', () => {
    const slots = [timed('2026-11-12', '11:00'), timed('2026-11-14', '11:00')];
    expect(line(slots, [WHAT, DATE, TIME])).toBe(
      'Thu, Nov 12 and Sat, Nov 14 · 11:00\u00a0AM · 2 spots open',
    );
    const run = [timed('2026-11-12', '11:00'), timed('2026-11-13', '11:00')];
    expect(line(run, [WHAT, DATE, TIME])).toBe(
      'Thu, Nov 12 to Fri, Nov 13 · 11:00\u00a0AM · 2 spots open',
    );
  });

  it('gives the time alone when there are no dates', () => {
    const slots = [timed(undefined, '11:00', 19)];
    expect(line(slots, [WHAT, TIME])).toBe('11:00\u00a0AM · 19 spots open');
  });

  it('leaves the time out when the slots differ, or one has none', () => {
    const mixed = [timed('2026-11-21', '11:00'), timed('2026-11-21', '13:00')];
    expect(line(mixed, [WHAT, DATE, TIME])).toBe('Sat, Nov 21 · 2 spots open');
    const missing = [timed('2026-11-21', '11:00'), timed('2026-11-21', undefined)];
    expect(line(missing, [WHAT, DATE, TIME])).toBe('Sat, Nov 21 · 2 spots open');
    const impossible = [timed(undefined, '25:00')];
    expect(line(impossible, [WHAT, TIME])).toBe('1 spot open');
  });

  it('reads the open slots when any is open, so a closed one adds no day and hides no time', () => {
    const slots = [
      { ...timed('2026-11-07', '09:00', 4), status: 'closed' },
      timed('2026-11-14', '11:00', 3),
    ];
    expect(line(slots, [WHAT, DATE, TIME])).toBe('Sat, Nov 14, 11:00\u00a0AM · 3 spots open');
  });

  it('reads the slots with room, so a full one adds no day and hides no time', () => {
    const full = timed('2026-11-07', '09:00', 1);
    const slots = [full, timed('2026-11-14', '11:00', 3)];
    expect(
      shareMessage(signup({ fields: [WHAT, DATE, TIME], slots }), LINK, { [full.id]: 1 }),
    ).toBe(`Fall book fair volunteers\nSat, Nov 14, 11:00\u00a0AM · 3 spots left\n${SIGN_UP}`);
    // No limit is room.
    const unlimited = [full, timed('2026-11-14', '11:00', null)];
    expect(
      shareMessage(signup({ fields: [WHAT, DATE, TIME], slots: unlimited }), LINK, {
        [full.id]: 1,
      }).split('\n')[1],
    ).toBe('Sat, Nov 14, 11:00\u00a0AM');
  });

  it('reads the open slots when every one is full', () => {
    const first = timed('2026-11-07', '11:00', 1);
    const second = timed('2026-11-14', '11:00', 2);
    const closed = { ...timed('2026-11-21', '09:00', 4), status: 'closed' };
    const committed = { [first.id]: 1, [second.id]: 2 };
    expect(
      shareMessage(
        signup({ fields: [WHAT, DATE, TIME], slots: [first, second, closed] }),
        LINK,
        committed,
      ).split('\n')[1],
    ).toBe('Sat, Nov 7 and Sat, Nov 14 · 11:00\u00a0AM');
  });

  it('reads every slot when none is open', () => {
    const slots = [
      { ...timed('2026-11-07', '11:00', 4), status: 'closed' },
      { ...timed('2026-11-14', '11:00', 3), status: 'closed' },
    ];
    // No spots to offer, but still when it was.
    expect(line(slots, [WHAT, DATE, TIME])).toBe('Sat, Nov 7 and Sat, Nov 14 · 11:00\u00a0AM');
  });

  it('reads the time field paired with the date field, as the reminders do', () => {
    const fields = [
      { ref: 'depart-time', fieldType: 'time', sortOrder: 0 },
      { ref: 'date', fieldType: 'date', sortOrder: 1 },
      { ref: 'return-time', fieldType: 'time', sortOrder: 2 },
    ] as const;
    const slots = [
      {
        id: 'slot_a',
        values: { date: '2026-11-21', 'depart-time': '09:00', 'return-time': '17:30' },
        capacity: 1,
        status: 'open',
      },
    ];
    expect(line(slots, fields)).toBe('Sat, Nov 21, 5:30\u00a0PM · 1 spot open');
  });
});

describe('withLink', () => {
  it('sends the message as it is while the link is still in it', () => {
    const edited = `Hi all, can you help at the book fair?\n${SIGN_UP}`;
    expect(withLink(edited, LINK)).toBe(edited);
  });

  it('adds the link on its own line when the organizer took it out', () => {
    expect(withLink('Hi all, can you help at the book fair?', LINK)).toBe(
      `Hi all, can you help at the book fair?\n${LINK}`,
    );
  });

  it('is the link alone when the message was cleared', () => {
    expect(withLink('  \n ', LINK)).toBe(LINK);
  });

  it('trims space left at either end', () => {
    expect(withLink(`\n  See you there ${LINK}  \n`, LINK)).toBe(`See you there ${LINK}`);
  });
});

describe('emailBody', () => {
  const TITLE = 'Fall book fair volunteers';

  it('starts after the title, which is the email’s subject', () => {
    const message = `${TITLE}\nThu, Nov 12 to Sat, Nov 14 · 21 spots open\n${SIGN_UP}`;
    expect(emailBody(message, TITLE, LINK)).toBe(
      `Thu, Nov 12 to Sat, Nov 14 · 21 spots open\n${SIGN_UP}`,
    );
  });

  it('knows the title with stray space around it', () => {
    expect(emailBody(`  ${TITLE} \n${SIGN_UP}`, ` ${TITLE}`, LINK)).toBe(SIGN_UP);
  });

  it('keeps the whole message when the first line was changed', () => {
    const message = `Hi all, can you help at the book fair?\n${SIGN_UP}`;
    expect(emailBody(message, TITLE, LINK)).toBe(message);
  });

  it('puts the link back when the edit took it out', () => {
    expect(emailBody(`${TITLE}\nCan you help on Saturday?`, TITLE, LINK)).toBe(
      `Can you help on Saturday?\n${LINK}`,
    );
  });
});
