import { describe, expect, it } from 'vitest';
import { getTestTranslator } from '@/i18n/testing/translator';
import type { Translator } from '@/i18n/translator';
import {
  buildMetaSegments,
  capacityLabel,
  formatGroupLabel,
  pickPrimaryField,
  renderFieldValue,
  slotContext,
  slotDisplayName,
} from './slot-format';
import type { SignupViewField } from './signup-view-types';

const text = (ref: string, label: string): SignupViewField => ({
  ref,
  label,
  fieldType: 'text',
});

const t = getTestTranslator('participant.slot');

/**
 * A translator that answers with the key it was asked for and the values it
 * was given, so a test can see a string came from the catalog.
 */
const standIn = ((key: string, values?: Record<string, unknown>) =>
  `${key} ${JSON.stringify(values)}`) as unknown as Translator<'participant.slot'>;

const fields: SignupViewField[] = [
  text('game', 'Game'),
  text('opponent', 'Opponent'),
  text('field', 'Field'),
];

describe('pickPrimaryField', () => {
  it('returns null when no fields', () => {
    expect(pickPrimaryField([])).toBeNull();
  });

  it('returns the first field when no group is set', () => {
    expect(pickPrimaryField(fields)?.ref).toBe('game');
  });

  it('skips the group field and returns the next', () => {
    expect(pickPrimaryField(fields, 'game')?.ref).toBe('opponent');
  });

  it('returns null when only field is the group field', () => {
    const single = [text('game', 'Game')];
    expect(pickPrimaryField(single, 'game')).toBeNull();
  });
});

describe('renderFieldValue', () => {
  it('returns null for empty/null/undefined values', () => {
    expect(renderFieldValue(text('a', 'A'), undefined, 'en')).toBeNull();
    expect(renderFieldValue(text('a', 'A'), null, 'en')).toBeNull();
    expect(renderFieldValue(text('a', 'A'), '', 'en')).toBeNull();
  });

  it('passes text/number values through as strings', () => {
    expect(renderFieldValue(text('a', 'A'), 'hello', 'en')).toBe('hello');
    const num: SignupViewField = { ref: 'n', label: 'N', fieldType: 'number' };
    expect(renderFieldValue(num, 12, 'en')).toBe('12');
    expect(renderFieldValue(num, 0, 'en')).toBe('0');
  });

  it('formats date fields using slot-date format', () => {
    const date: SignupViewField = { ref: 'd', label: 'D', fieldType: 'date' };
    const out = renderFieldValue(date, '2026-04-25', 'en');
    expect(out).toMatch(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}$/);
  });

  it('falls back to raw string when date value is unparseable', () => {
    const date: SignupViewField = { ref: 'd', label: 'D', fieldType: 'date' };
    expect(renderFieldValue(date, 'not-a-date', 'en')).toBe('not-a-date');
  });
});

describe('buildMetaSegments', () => {
  const slot = { values: { game: 'Game 1', opponent: 'vs Hawks', field: 'Field B' } };

  it('includes every value with no labels', () => {
    expect(buildMetaSegments({ fields, slot, locale: 'en' })).toEqual([
      'Game 1',
      'vs Hawks',
      'Field B',
    ]);
  });

  it('skips the primary field', () => {
    expect(buildMetaSegments({ fields, slot, primaryRef: 'game', locale: 'en' })).toEqual([
      'vs Hawks',
      'Field B',
    ]);
  });

  it('skips the group field', () => {
    expect(buildMetaSegments({ fields, slot, groupRef: 'field', locale: 'en' })).toEqual([
      'Game 1',
      'vs Hawks',
    ]);
  });

  it('skips both primary and group', () => {
    expect(
      buildMetaSegments({ fields, slot, primaryRef: 'game', groupRef: 'field', locale: 'en' }),
    ).toEqual(['vs Hawks']);
  });

  it('omits empty values', () => {
    const partial = { values: { game: 'Game 1', opponent: '', field: null } };
    expect(buildMetaSegments({ fields, slot: partial, locale: 'en' })).toEqual(['Game 1']);
  });

  it('preserves field-definition order regardless of values key order', () => {
    const reordered = { values: { field: 'Field B', opponent: 'vs Hawks', game: 'Game 1' } };
    expect(buildMetaSegments({ fields, slot: reordered, locale: 'en' })).toEqual([
      'Game 1',
      'vs Hawks',
      'Field B',
    ]);
  });
});

describe('formatGroupLabel', () => {
  it('formats the value via renderFieldValue (date stays a date)', () => {
    const date: SignupViewField = { ref: 'd', label: 'Date', fieldType: 'date' };
    expect(formatGroupLabel(date, '2026-04-25', 'en', t)).toMatch(
      /^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}$/,
    );
  });

  it('passes text values through', () => {
    expect(formatGroupLabel(text('g', 'Game'), 'GAME 1', 'en', t)).toBe('GAME 1');
  });

  it('falls back to "(no <label>)" for empty/null/undefined', () => {
    const game = text('g', 'Game');
    expect(formatGroupLabel(game, undefined, 'en', t)).toBe('(no game)');
    expect(formatGroupLabel(game, null, 'en', t)).toBe('(no game)');
    expect(formatGroupLabel(game, '', 'en', t)).toBe('(no game)');
  });

  it('takes "(no <label>)" from the catalog, with the label whole in it', () => {
    expect(formatGroupLabel(text('g', 'Game Day'), undefined, 'en', standIn)).toBe(
      'noValue {"label":"game day"}',
    );
  });
});

describe('capacityLabel', () => {
  it('shows nothing for a capacity-1 slot, where the action column says it all', () => {
    expect(capacityLabel(0, 1, t)).toEqual({ text: '', sr: null });
    expect(capacityLabel(1, 1, t)).toEqual({ text: '', sr: null });
  });

  it('counts the spots left, as the sign-up sheet does', () => {
    expect(capacityLabel(0, 2, t)).toEqual({ text: '2 left', sr: '2 of 2 spots left' });
    expect(capacityLabel(1, 2, t)).toEqual({ text: '1 left', sr: '1 of 2 spots left' });
    expect(capacityLabel(10, 12, t)).toEqual({ text: '2 left', sr: '2 of 12 spots left' });
  });

  it('shows nothing for a full slot, where the action column says "Full"', () => {
    expect(capacityLabel(4, 4, t)).toEqual({ text: '', sr: null });
    // The organizer can lower a slot's capacity under its sign-ups.
    expect(capacityLabel(5, 3, t)).toEqual({ text: '', sr: null });
  });

  it('shows nothing for a non-positive capacity rather than a meaningless "0/0"', () => {
    // CapacitySchema is `.positive()`, so no validated write produces this;
    // the type still admits it, and the function should be total.
    expect(capacityLabel(0, 0, t)).toEqual({ text: '', sr: null });
  });

  it('writes a count of a thousand or more without grouping, as before', () => {
    expect(capacityLabel(0, 1500, t)).toEqual({ text: '1500 left', sr: '1500 of 1500 spots left' });
    expect(capacityLabel(1234, null, t)).toEqual({ text: '1234', sr: '1234 signed up' });
  });

  it('takes its words from the catalog', () => {
    expect(capacityLabel(1, 3, standIn)).toEqual({
      text: 'left {"left":2}',
      sr: 'leftOf {"left":2,"capacity":3}',
    });
    expect(capacityLabel(3, null, standIn)).toEqual({ text: '3', sr: 'signedUp {"count":3}' });
  });

  it('hides a bare count on an unlimited slot until someone has signed up', () => {
    // A lone "0" has no denominator to anchor it and reads as noise.
    expect(capacityLabel(0, null, t)).toEqual({ text: '', sr: null });
    expect(capacityLabel(3, null, t)).toEqual({ text: '3', sr: '3 signed up' });
  });
});

describe('slotDisplayName', () => {
  it('names the group, then the slot, then the rest, as the page reads', () => {
    expect(slotDisplayName('Sat, Nov 7', 'Sort and pack food', ['9:00 AM', '12:00 PM'])).toBe(
      'Sat, Nov 7 · Sort and pack food · 9:00 AM · 12:00 PM',
    );
  });

  it('names an ungrouped slot by its title and the rest', () => {
    expect(slotDisplayName(null, 'Bring a dish', ['Sat, Nov 14'])).toBe(
      'Bring a dish · Sat, Nov 14',
    );
  });

  it('is the title alone when there is nothing else', () => {
    expect(slotDisplayName(null, 'Cookies', [])).toBe('Cookies');
  });
});

describe('slotContext', () => {
  it('is everything but the title: the group, then the rest', () => {
    expect(slotContext('Sat, Nov 7', ['9:00 AM', '12:00 PM'])).toBe(
      'Sat, Nov 7 · 9:00 AM · 12:00 PM',
    );
    expect(slotContext(null, ['Sat, Nov 14'])).toBe('Sat, Nov 14');
  });

  it('is empty when the slot has nothing but its title', () => {
    expect(slotContext(null, [])).toBe('');
  });
});
