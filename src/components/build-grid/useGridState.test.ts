import { describe, it, expect } from 'vitest';
import { gridReducer } from './useGridState';
import type { GridState, GridField, GridRow } from './useGridState';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeField = (overrides: Partial<GridField> = {}): GridField => ({
  id: 'field-1',
  ref: 'name',
  name: 'Name',
  type: 'text',
  required: true,
  config: { fieldType: 'text', maxLength: 200 },
  sortOrder: 0,
  ...overrides,
});

const makeRow = (overrides: Partial<GridRow> = {}): GridRow => ({
  id: 'row-1',
  capacity: null,
  sortOrder: 0,
  values: {},
  ...overrides,
});

const makeState = (overrides: Partial<GridState> = {}): GridState => ({
  fields: [],
  rows: [],
  groupByFieldRef: null,
  previewRowIdx: 0,
  showPreview: false,
  saveStatus: 'idle',
  ...overrides,
});

// ---------------------------------------------------------------------------
// SET_FIELD_WIDTH
// ---------------------------------------------------------------------------

describe('gridReducer SET_FIELD_WIDTH', () => {
  it('sets width on the correct field', () => {
    const field1 = makeField({ id: 'f1', ref: 'alpha' });
    const field2 = makeField({ id: 'f2', ref: 'beta' });
    const state = makeState({ fields: [field1, field2] });

    const next = gridReducer(state, { type: 'SET_FIELD_WIDTH', fieldId: 'f1', width: 300 });

    expect(next.fields[0]?.width).toBe(300);
    expect(next.fields[1]?.width).toBeUndefined();
  });

  it('does not mutate other fields', () => {
    const field1 = makeField({ id: 'f1' });
    const field2 = makeField({ id: 'f2', name: 'Other', ref: 'other' });
    const state = makeState({ fields: [field1, field2] });

    const next = gridReducer(state, { type: 'SET_FIELD_WIDTH', fieldId: 'f1', width: 200 });

    expect(next.fields[1]).toEqual(field2);
  });

  it('clears width when undefined is passed', () => {
    const field = makeField({ id: 'f1', width: 300 });
    const state = makeState({ fields: [field] });

    const next = gridReducer(state, { type: 'SET_FIELD_WIDTH', fieldId: 'f1', width: undefined });

    expect(next.fields[0]?.width).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// OPTIMISTIC_ADD_ROW
// ---------------------------------------------------------------------------

describe('gridReducer OPTIMISTIC_ADD_ROW', () => {
  it('appends the new row to the end of rows', () => {
    const row1 = makeRow({ id: 'r1' });
    const row2 = makeRow({ id: 'r2' });
    const state = makeState({ rows: [row1] });

    const next = gridReducer(state, { type: 'OPTIMISTIC_ADD_ROW', row: row2 });

    expect(next.rows).toHaveLength(2);
    expect(next.rows[1]).toEqual(row2);
  });

  it('does not mutate existing rows', () => {
    const row1 = makeRow({ id: 'r1' });
    const state = makeState({ rows: [row1] });

    const next = gridReducer(state, {
      type: 'OPTIMISTIC_ADD_ROW',
      row: makeRow({ id: 'r2' }),
    });

    expect(next.rows[0]).toEqual(row1);
  });
});

// ---------------------------------------------------------------------------
// OPTIMISTIC_REMOVE_ROW
// ---------------------------------------------------------------------------

describe('gridReducer OPTIMISTIC_REMOVE_ROW', () => {
  it('removes the correct row', () => {
    const row1 = makeRow({ id: 'r1' });
    const row2 = makeRow({ id: 'r2' });
    const state = makeState({ rows: [row1, row2] });

    const next = gridReducer(state, { type: 'OPTIMISTIC_REMOVE_ROW', rowId: 'r1' });

    expect(next.rows).toHaveLength(1);
    expect(next.rows[0]?.id).toBe('r2');
  });

  it('leaves other rows unchanged', () => {
    const row1 = makeRow({ id: 'r1', capacity: 5 });
    const row2 = makeRow({ id: 'r2', capacity: 10 });
    const state = makeState({ rows: [row1, row2] });

    const next = gridReducer(state, { type: 'OPTIMISTIC_REMOVE_ROW', rowId: 'r1' });

    expect(next.rows[0]).toEqual(row2);
  });

  it('returns empty rows when last row removed', () => {
    const row1 = makeRow({ id: 'r1' });
    const state = makeState({ rows: [row1] });

    const next = gridReducer(state, { type: 'OPTIMISTIC_REMOVE_ROW', rowId: 'r1' });

    expect(next.rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// OPTIMISTIC_EDIT_CELL
// ---------------------------------------------------------------------------

describe('gridReducer OPTIMISTIC_EDIT_CELL', () => {
  it('updates the correct cell value', () => {
    const row = makeRow({ id: 'r1', values: { name: 'Alice', date: '2026-01-01' } });
    const state = makeState({ rows: [row] });

    const next = gridReducer(state, {
      type: 'OPTIMISTIC_EDIT_CELL',
      rowId: 'r1',
      fieldRef: 'name',
      value: 'Bob',
    });

    expect(next.rows[0]?.values['name']).toBe('Bob');
    expect(next.rows[0]?.values['date']).toBe('2026-01-01');
  });

  it('does not mutate other rows', () => {
    const row1 = makeRow({ id: 'r1', values: { name: 'Alice' } });
    const row2 = makeRow({ id: 'r2', values: { name: 'Carol' } });
    const state = makeState({ rows: [row1, row2] });

    const next = gridReducer(state, {
      type: 'OPTIMISTIC_EDIT_CELL',
      rowId: 'r1',
      fieldRef: 'name',
      value: 'Bob',
    });

    expect(next.rows[1]?.values['name']).toBe('Carol');
  });

  it('adds a new field ref to existing values if not present', () => {
    const row = makeRow({ id: 'r1', values: { name: 'Alice' } });
    const state = makeState({ rows: [row] });

    const next = gridReducer(state, {
      type: 'OPTIMISTIC_EDIT_CELL',
      rowId: 'r1',
      fieldRef: 'role',
      value: 'Captain',
    });

    expect(next.rows[0]?.values['role']).toBe('Captain');
    expect(next.rows[0]?.values['name']).toBe('Alice');
  });
});

// ---------------------------------------------------------------------------
// OPTIMISTIC_SET_CAPACITY
// ---------------------------------------------------------------------------

describe('gridReducer OPTIMISTIC_SET_CAPACITY', () => {
  it('updates capacity for the correct row', () => {
    const row1 = makeRow({ id: 'r1', capacity: null });
    const row2 = makeRow({ id: 'r2', capacity: 5 });
    const state = makeState({ rows: [row1, row2] });

    const next = gridReducer(state, { type: 'OPTIMISTIC_SET_CAPACITY', rowId: 'r1', capacity: 10 });

    expect(next.rows[0]?.capacity).toBe(10);
    expect(next.rows[1]?.capacity).toBe(5);
  });

  it('sets capacity to null', () => {
    const row = makeRow({ id: 'r1', capacity: 10 });
    const state = makeState({ rows: [row] });

    const next = gridReducer(state, { type: 'OPTIMISTIC_SET_CAPACITY', rowId: 'r1', capacity: null });

    expect(next.rows[0]?.capacity).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SET_SAVE_STATUS
// ---------------------------------------------------------------------------

describe('gridReducer SET_SAVE_STATUS', () => {
  it('updates saveStatus to saving', () => {
    const state = makeState({ saveStatus: 'idle' });
    const next = gridReducer(state, { type: 'SET_SAVE_STATUS', status: 'saving' });
    expect(next.saveStatus).toBe('saving');
  });

  it('updates saveStatus to saved', () => {
    const state = makeState({ saveStatus: 'saving' });
    const next = gridReducer(state, { type: 'SET_SAVE_STATUS', status: 'saved' });
    expect(next.saveStatus).toBe('saved');
  });

  it('updates saveStatus to error', () => {
    const state = makeState({ saveStatus: 'saving' });
    const next = gridReducer(state, { type: 'SET_SAVE_STATUS', status: 'error' });
    expect(next.saveStatus).toBe('error');
  });

  it('updates saveStatus back to idle', () => {
    const state = makeState({ saveStatus: 'saved' });
    const next = gridReducer(state, { type: 'SET_SAVE_STATUS', status: 'idle' });
    expect(next.saveStatus).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// SET_SHOW_PREVIEW
// ---------------------------------------------------------------------------

describe('gridReducer SET_SHOW_PREVIEW', () => {
  it('sets showPreview to true', () => {
    const state = makeState({ showPreview: false });
    const next = gridReducer(state, { type: 'SET_SHOW_PREVIEW', show: true });
    expect(next.showPreview).toBe(true);
  });

  it('sets showPreview to false', () => {
    const state = makeState({ showPreview: true });
    const next = gridReducer(state, { type: 'SET_SHOW_PREVIEW', show: false });
    expect(next.showPreview).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SET_GROUP_BY
// ---------------------------------------------------------------------------

describe('gridReducer SET_GROUP_BY', () => {
  it('sets groupByFieldRef to a ref string', () => {
    const state = makeState({ groupByFieldRef: null });
    const next = gridReducer(state, { type: 'SET_GROUP_BY', ref: 'date' });
    expect(next.groupByFieldRef).toBe('date');
  });

  it('clears groupByFieldRef to null', () => {
    const state = makeState({ groupByFieldRef: 'date' });
    const next = gridReducer(state, { type: 'SET_GROUP_BY', ref: null });
    expect(next.groupByFieldRef).toBeNull();
  });
});
