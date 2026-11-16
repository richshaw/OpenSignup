import { describe, expect, it } from 'vitest';
import type { CatalogLocale } from '@/i18n/config';
import { getPrecompiledTranslator } from '@/i18n/testing/precompiled';
import { getTestTranslator } from '@/i18n/testing/translator';
import { getTranslator, type Translator } from '@/i18n/translator';
import { confirmationSubject, reminderSubject, slotChangedSubject } from './subjects';

const en = getTestTranslator('email.subject');

/** Swedish from its catalog. A translator takes any language with one, shipped or not. */
const sv = getTranslator('sv', 'email.subject', {
  onError: (error) => {
    throw error;
  },
});

describe('email subjects', () => {
  it('leads with the signup title, then the slot values', () => {
    expect(confirmationSubject(en, 'Spring Book Fair Volunteers', 'Wed, Sep 9 · 13:00')).toBe(
      "You're signed up: Spring Book Fair Volunteers · Wed, Sep 9 · 13:00",
    );
    expect(reminderSubject(en, 'Spring Book Fair Volunteers', 'Wed, Sep 9 · 13:00')).toBe(
      'Reminder: Spring Book Fair Volunteers · Wed, Sep 9 · 13:00',
    );
  });

  it('says the time changed on a reminder that follows one for another time', () => {
    expect(reminderSubject(en, 'Spring Book Fair Volunteers', 'Wed, Sep 9 · 13:00', true)).toBe(
      'Time changed: Spring Book Fair Volunteers · Wed, Sep 9 · 13:00',
    );
  });

  it('says the time changed when the organizer moves the slot', () => {
    expect(slotChangedSubject(en, 'Spring Book Fair Volunteers', 'Thu, Sep 10 · 13:00')).toBe(
      'Time changed: Spring Book Fair Volunteers · Thu, Sep 10 · 13:00',
    );
  });

  it('omits the separator when the slot has nothing to summarise', () => {
    expect(confirmationSubject(en, 'Bake Sale', '')).toBe("You're signed up: Bake Sale");
    expect(reminderSubject(en, 'Bake Sale', '')).toBe('Reminder: Bake Sale');
  });

  it('prints a title and slot as they are, whatever characters they hold', () => {
    // Values go into a message, never through ICU's parser: braces, tags, a
    // `#` or an apostrophe come out as typed.
    expect(confirmationSubject(en, "Pat's {big} <b>day</b> #1", "it's 100% {x}")).toBe(
      "You're signed up: Pat's {big} <b>day</b> #1 · it's 100% {x}",
    );
  });

  it('words each subject in Swedish', () => {
    expect(confirmationSubject(sv, 'Vårloppis', 'lör 2 maj · 13:00')).toBe(
      'Du är anmäld: Vårloppis · lör 2 maj · 13:00',
    );
    expect(reminderSubject(sv, 'Vårloppis', 'lör 2 maj · 13:00')).toBe(
      'Påminnelse: Vårloppis · lör 2 maj · 13:00',
    );
    expect(reminderSubject(sv, 'Vårloppis', 'sön 3 maj · 13:00', true)).toBe(
      'Ny tid: Vårloppis · sön 3 maj · 13:00',
    );
    expect(slotChangedSubject(sv, 'Vårloppis', 'sön 3 maj · 13:00')).toBe(
      'Ny tid: Vårloppis · sön 3 maj · 13:00',
    );
    expect(confirmationSubject(sv, 'Vårloppis', '')).toBe('Du är anmäld: Vårloppis');
  });
});

/**
 * The confirmation is sent from the web process, which formats the catalogs
 * Next precompiled; reminders and slot-change emails from the worker, which
 * formats the raw JSON as vitest does. Both must write the same subject, as
 * the worker's own run of these messages under tsx checks for its side
 * (scripts/render-messages.ts).
 */
describe('email subjects from the precompiled catalogs', () => {
  const titles = ['Spring Book Fair Volunteers', "Pat's {big} <b>day</b> #1", ''];
  const summaries = ['Wed, Sep 9 · 1:00\u00a0PM · Front desk', '', "it's 100% {x}"];
  const each = (t: Translator<'email.subject'>) =>
    titles.flatMap((title) =>
      summaries.flatMap((summary) => [
        confirmationSubject(t, title, summary),
        reminderSubject(t, title, summary),
        reminderSubject(t, title, summary, true),
        slotChangedSubject(t, title, summary),
      ]),
    );

  it.each<[CatalogLocale, Translator<'email.subject'>]>([
    ['en', en],
    ['sv', sv],
  ])('are the ones the raw %s catalog gives', async (locale, raw) => {
    const precompiled = await getPrecompiledTranslator(locale, 'email.subject');
    expect(each(precompiled)).toEqual(each(raw));
  });
});
