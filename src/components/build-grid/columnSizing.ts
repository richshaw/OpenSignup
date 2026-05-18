// Column sizing model for the build grid.
// Keep this module pure — no React, no imports from schemas.

export type FieldSizing =
  | { mode: 'flex'; min: number; weight: number }
  | { mode: 'fixed'; px: number };

// A minimal field interface for sizing (only what's needed).
export interface SizableField {
  type: string;
  width?: number;
}

export const MIN_W = 60;
export const MAX_W = 600;

export const COL_SIZING: Record<string, FieldSizing> = {
  text: { mode: 'flex', min: 140, weight: 1.5 },
  date: { mode: 'fixed', px: 150 },
  time: { mode: 'fixed', px: 110 },
  number: { mode: 'fixed', px: 110 },
  enum: { mode: 'fixed', px: 150 },
};

/**
 * Returns the sizing descriptor for a single field.
 *
 * Priority:
 * 1. If `field.width` is set → fixed mode with px clamped to [MIN_W, MAX_W].
 * 2. Otherwise → lookup COL_SIZING[field.type]; for flex types add +0.5 weight
 *    bonus when `isFirst` is true (first flex column gets extra weight).
 */
export function sizingFor(field: SizableField, isFirst: boolean): FieldSizing {
  if (field.width !== undefined) {
    return { mode: 'fixed', px: Math.min(MAX_W, Math.max(MIN_W, field.width)) };
  }

  const base = COL_SIZING[field.type] ?? COL_SIZING['text']!;

  if (base.mode === 'flex' && isFirst) {
    return { mode: 'flex', min: base.min, weight: base.weight + 0.5 };
  }

  return base;
}

/**
 * Builds a CSS `grid-template-columns` string for the build grid.
 *
 * Layout: 38px <field tracks…> 90px 130px
 * - 38px = leading row-index column
 * - 90px = trailing Capacity column (fixed)
 * - 130px = trailing actions column (fixed) — sized for the labeled
 *   "+ Add field" link in the header and the slot delete `×` in the body.
 * - fixed fields → "${px}px"
 * - flex fields  → "minmax(${min}px, ${weight}fr)"
 *
 * The +0.5 weight bonus is given only when the field is at index 0 in the
 * fields array (i.e. it is the first field overall, not just the first flex).
 */
export function buildColsTemplate(fields: SizableField[]): string {
  const tracks = fields.map((f, idx) => {
    const isFirst = idx === 0;
    const s = sizingFor(f, isFirst);
    if (s.mode === 'fixed') return `${s.px}px`;
    return `minmax(${s.min}px, ${s.weight}fr)`;
  });

  return ['38px', ...tracks, '90px', '130px'].join(' ');
}

/**
 * Returns the effective pixel width for a field, resolving flex min or fixed px.
 * Used by ResizeHandle to determine the starting width before a drag.
 */
export function widthFor(field: SizableField, fieldIndex: number): number {
  const s = sizingFor(field, fieldIndex === 0);
  return s.mode === 'fixed' ? s.px : s.min;
}

/**
 * Returns the sum of minimum column widths for the full grid.
 *
 * = 38 (index) + 90 (capacity) + 130 (actions) + Σ each field's min/fixed width
 */
export function totalGridWidth(fields: SizableField[]): number {
  const FIXED_COLS = 38 + 90 + 130;
  const fieldsWidth = fields.reduce((sum, f) => {
    const s = sizingFor(f, false); // isFirst doesn't affect width for totalGridWidth
    return sum + (s.mode === 'fixed' ? s.px : s.min);
  }, 0);
  return FIXED_COLS + fieldsWidth;
}
