import { describe, expect, it } from 'vitest';
import { SlotTypeDataSchema, parseSlotData } from './slot-types';

describe('SlotTypeDataSchema', () => {
  it('accepts a valid date slot', () => {
    const r = parseSlotData('date', { date: '2026-09-12' });
    expect(r.slotType).toBe('date');
  });

  it('rejects a date slot with a bad date', () => {
    expect(() => parseSlotData('date', { date: 'not-a-date' })).toThrow();
  });

  it('accepts a time slot', () => {
    const r = parseSlotData('time', {
      start: '2026-09-12T18:00:00Z',
      end: '2026-09-12T20:00:00Z',
    });
    expect(r.slotType).toBe('time');
  });

  it('rejects cross-type payloads', () => {
    expect(() => parseSlotData('date', { start: 'x', end: 'y' })).toThrow();
  });

  it('accepts role slot with skills', () => {
    const r = SlotTypeDataSchema.parse({
      slotType: 'role',
      data: { skills: ['bring chairs', 'set up'] },
    });
    expect(r.slotType).toBe('role');
  });
});
