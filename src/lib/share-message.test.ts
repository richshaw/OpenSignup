import { describe, expect, it } from 'vitest';
import { shareMessage, withLink, type ShareMessageSignup } from './share-message';

const LINK = 'https://your-site.example/s/book-fair-k3x';

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

function slot(date: string | undefined, capacity: number | null = 1) {
  return { values: date === undefined ? { what: 'Setup' } : { what: 'Setup', date }, capacity };
}

describe('shareMessage', () => {
  it('says the title, the dates, the slots and the spots, then the link', () => {
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
      `Fall book fair volunteers\nThu, Nov 12 to Sat, Nov 14 · 8 slots · 21 spots\nSign up here: ${LINK}`,
    );
  });

  it('names the one date when every slot is on the same day', () => {
    const slots = [slot('2026-11-14', 4), slot('2026-11-14', 2)];
    expect(shareMessage(signup({ slots }), LINK)).toBe(
      `Fall book fair volunteers\nSat, Nov 14 · 2 slots · 6 spots\nSign up here: ${LINK}`,
    );
  });

  it('runs from the earliest date to the latest, whatever order the slots are in', () => {
    const slots = [slot('2026-11-14'), slot('2026-11-12'), slot('2026-12-01'), slot('2026-11-13')];
    expect(shareMessage(signup({ slots }), LINK)).toBe(
      `Fall book fair volunteers\nThu, Nov 12 to Tue, Dec 1 · 4 slots · 4 spots\nSign up here: ${LINK}`,
    );
  });

  it('leaves the dates out when the signup has no date field', () => {
    const slots = [{ values: { what: 'Setup' }, capacity: 2 }];
    expect(shareMessage(signup({ fields: [WHAT], slots }), LINK)).toBe(
      `Fall book fair volunteers\n1 slot · 2 spots\nSign up here: ${LINK}`,
    );
  });

  it('ignores blank and impossible dates', () => {
    const slots = [slot(undefined), slot(''), slot('2026-02-30'), slot('2026-11-14')];
    expect(shareMessage(signup({ slots }), LINK)).toBe(
      `Fall book fair volunteers\nSat, Nov 14 · 4 slots · 4 spots\nSign up here: ${LINK}`,
    );
  });

  it('leaves the dates out when no slot has one yet', () => {
    const slots = [slot(undefined), slot('')];
    expect(shareMessage(signup({ slots }), LINK)).toBe(
      `Fall book fair volunteers\n2 slots · 2 spots\nSign up here: ${LINK}`,
    );
  });

  it('reads the date field the reminders use, not just the first one', () => {
    const fields = [
      { ref: 'setup-day', fieldType: 'date', sortOrder: 0 },
      { ref: 'fair-day', fieldType: 'date', sortOrder: 1 },
    ] as const;
    const slots = [
      { values: { 'setup-day': '2026-11-10', 'fair-day': '2026-11-14' }, capacity: 1 },
    ];
    expect(
      shareMessage(signup({ fields, slots, settings: { reminderFromFieldRef: 'fair-day' } }), LINK),
    ).toBe(`Fall book fair volunteers\nSat, Nov 14 · 1 slot · 1 spot\nSign up here: ${LINK}`);
    expect(shareMessage(signup({ fields, slots }), LINK)).toBe(
      `Fall book fair volunteers\nTue, Nov 10 · 1 slot · 1 spot\nSign up here: ${LINK}`,
    );
  });

  it('leaves the spots out when any slot has no limit', () => {
    const slots = [slot('2026-11-14', 3), slot('2026-11-14', null)];
    expect(shareMessage(signup({ slots }), LINK)).toBe(
      `Fall book fair volunteers\nSat, Nov 14 · 2 slots\nSign up here: ${LINK}`,
    );
  });

  it('says one slot and one spot in the singular', () => {
    expect(shareMessage(signup({ slots: [slot('2026-11-14', 1)] }), LINK)).toBe(
      `Fall book fair volunteers\nSat, Nov 14 · 1 slot · 1 spot\nSign up here: ${LINK}`,
    );
  });

  it('leaves the middle line out when there is nothing to say', () => {
    expect(shareMessage(signup({ fields: [WHAT], slots: [] }), LINK)).toBe(
      `Fall book fair volunteers\nSign up here: ${LINK}`,
    );
  });

  it('trims the title', () => {
    expect(shareMessage(signup({ title: '  Bake sale \n', slots: [] }), LINK)).toBe(
      `Bake sale\nSign up here: ${LINK}`,
    );
  });
});

describe('withLink', () => {
  it('sends the message as it is while the link is still in it', () => {
    const edited = `Hi all, can you help at the book fair?\nSign up here: ${LINK}`;
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
