import { describe, expect, it } from 'vitest';
import { timeOptions } from './timeOptions';

describe('timeOptions', () => {
  it('lists every 15 minutes of the day, in order', () => {
    const options = timeOptions('');
    expect(options).toHaveLength(96);
    expect(options.slice(0, 3)).toEqual(['00:00', '00:15', '00:30']);
    expect(options[36]).toBe('09:00');
    expect(options[95]).toBe('23:45');
  });

  it('keeps a value off the grid, in its place', () => {
    const options = timeOptions('09:10');
    expect(options).toHaveLength(97);
    expect(options.slice(36, 39)).toEqual(['09:00', '09:10', '09:15']);
  });

  it('adds nothing for a value on the grid', () => {
    expect(timeOptions('09:15')).toHaveLength(96);
  });

  it('with after, lists only later times', () => {
    const options = timeOptions('', '09:00');
    expect(options[0]).toBe('09:15');
    expect(options.at(-1)).toBe('23:45');
    expect(options).toHaveLength(59);
  });

  it('with an off-grid after, starts at the next step', () => {
    expect(timeOptions('', '09:10')[0]).toBe('09:15');
  });

  it('keeps a chosen value that is no longer after', () => {
    expect(timeOptions('08:00', '09:00')[0]).toBe('08:00');
  });

  it('keeps a value that is not a time', () => {
    expect(timeOptions('noon')).toContain('noon');
  });
});
