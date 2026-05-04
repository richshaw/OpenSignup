import { describe, it, expect } from 'vitest';
import { COL_SIZING, MIN_W, MAX_W, sizingFor, buildColsTemplate, totalGridWidth } from './columnSizing';

describe('sizingFor', () => {
  it('returns fixed sizing for date type', () => {
    expect(sizingFor({ type: 'date' }, false)).toEqual({ mode: 'fixed', px: 150 });
  });

  it('returns fixed sizing for time type', () => {
    expect(sizingFor({ type: 'time' }, false)).toEqual({ mode: 'fixed', px: 110 });
  });

  it('returns fixed sizing for number type', () => {
    expect(sizingFor({ type: 'number' }, false)).toEqual({ mode: 'fixed', px: 110 });
  });

  it('returns fixed sizing for enum type', () => {
    expect(sizingFor({ type: 'enum' }, false)).toEqual({ mode: 'fixed', px: 150 });
  });

  it('returns flex sizing for text type (not first)', () => {
    expect(sizingFor({ type: 'text' }, false)).toEqual({ mode: 'flex', min: 140, weight: 1.5 });
  });

  it('returns flex sizing for text type as first field with +0.5 weight bonus', () => {
    expect(sizingFor({ type: 'text' }, true)).toEqual({ mode: 'flex', min: 140, weight: 2.0 });
  });

  it('returns fixed sizing when explicit width is set (overrides type)', () => {
    expect(sizingFor({ type: 'text', width: 200 }, false)).toEqual({ mode: 'fixed', px: 200 });
  });

  it('clamps explicit width to MIN_W (60) if below', () => {
    expect(sizingFor({ type: 'text', width: 30 }, false)).toEqual({ mode: 'fixed', px: MIN_W });
  });

  it('clamps explicit width to MAX_W (600) if above', () => {
    expect(sizingFor({ type: 'date', width: 800 }, false)).toEqual({ mode: 'fixed', px: MAX_W });
  });

  it('uses width exactly at MIN_W boundary', () => {
    expect(sizingFor({ type: 'text', width: 60 }, false)).toEqual({ mode: 'fixed', px: 60 });
  });

  it('uses width exactly at MAX_W boundary', () => {
    expect(sizingFor({ type: 'text', width: 600 }, false)).toEqual({ mode: 'fixed', px: 600 });
  });
});

describe('buildColsTemplate', () => {
  it('returns fixed header/footer with no fields', () => {
    expect(buildColsTemplate([])).toBe('38px 90px 60px');
  });

  it('inserts fixed px track for a date field', () => {
    expect(buildColsTemplate([{ type: 'date' }])).toBe('38px 150px 90px 60px');
  });

  it('inserts minmax track for a text field (first text gets +0.5 bonus)', () => {
    expect(buildColsTemplate([{ type: 'text' }])).toBe('38px minmax(140px, 2fr) 90px 60px');
  });

  it('handles two text fields: first is 2fr, second is 1.5fr', () => {
    expect(buildColsTemplate([{ type: 'text' }, { type: 'text' }])).toBe(
      '38px minmax(140px, 2fr) minmax(140px, 1.5fr) 90px 60px',
    );
  });

  it('handles mixed fixed and flex fields', () => {
    expect(buildColsTemplate([{ type: 'date' }, { type: 'text' }])).toBe(
      '38px 150px minmax(140px, 1.5fr) 90px 60px',
    );
  });

  it('uses custom width override as fixed track', () => {
    expect(buildColsTemplate([{ type: 'text', width: 220 }])).toBe('38px 220px 90px 60px');
  });
});

describe('totalGridWidth', () => {
  it('returns 188 for no fields (38 + 90 + 60)', () => {
    expect(totalGridWidth([])).toBe(188);
  });

  it('returns 338 for one date field (188 + 150)', () => {
    expect(totalGridWidth([{ type: 'date' }])).toBe(338);
  });

  it('returns 328 for one text field (188 + 140)', () => {
    expect(totalGridWidth([{ type: 'text' }])).toBe(328);
  });

  it('sums min widths for multiple fields', () => {
    // date (150) + text (140) = 290 + 188 = 478
    expect(totalGridWidth([{ type: 'date' }, { type: 'text' }])).toBe(478);
  });
});

describe('COL_SIZING constants', () => {
  it('exports correct defaults', () => {
    expect(COL_SIZING.text).toEqual({ mode: 'flex', min: 140, weight: 1.5 });
    expect(COL_SIZING.date).toEqual({ mode: 'fixed', px: 150 });
    expect(COL_SIZING.time).toEqual({ mode: 'fixed', px: 110 });
    expect(COL_SIZING.number).toEqual({ mode: 'fixed', px: 110 });
    expect(COL_SIZING.enum).toEqual({ mode: 'fixed', px: 150 });
  });

  it('exports MIN_W as 60', () => {
    expect(MIN_W).toBe(60);
  });

  it('exports MAX_W as 600', () => {
    expect(MAX_W).toBe(600);
  });
});
