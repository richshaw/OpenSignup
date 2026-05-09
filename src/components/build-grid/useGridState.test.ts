// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { gridReducer, useGridState } from './useGridState';
import type { GridState, GridField, GridRow } from './useGridState';
import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import type { SignupSettings } from '@/schemas/signups';

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

  it('clamps previewRowIdx when the highlighted row is deleted', () => {
    const row1 = makeRow({ id: 'r1' });
    const row2 = makeRow({ id: 'r2' });
    const state = makeState({ rows: [row1, row2], previewRowIdx: 1 });

    const next = gridReducer(state, { type: 'OPTIMISTIC_REMOVE_ROW', rowId: 'r2' });

    expect(next.rows).toHaveLength(1);
    expect(next.previewRowIdx).toBe(0);
  });

  it('clamps previewRowIdx to 0 when all rows are deleted', () => {
    const row1 = makeRow({ id: 'r1' });
    const state = makeState({ rows: [row1], previewRowIdx: 0 });

    const next = gridReducer(state, { type: 'OPTIMISTIC_REMOVE_ROW', rowId: 'r1' });

    expect(next.rows).toHaveLength(0);
    expect(next.previewRowIdx).toBe(0);
  });

  it('clamps previewRowIdx when deletion shrinks the list below the current index', () => {
    const row1 = makeRow({ id: 'r1' });
    const row2 = makeRow({ id: 'r2' });
    const row3 = makeRow({ id: 'r3' });
    const state = makeState({ rows: [row1, row2, row3], previewRowIdx: 2 });

    const next = gridReducer(state, { type: 'OPTIMISTIC_REMOVE_ROW', rowId: 'r1' });

    expect(next.rows).toHaveLength(2);
    expect(next.previewRowIdx).toBe(1);
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

// ---------------------------------------------------------------------------
// SET_FIELDS (used by moveField to apply a re-sequenced order)
// ---------------------------------------------------------------------------

describe('gridReducer SET_FIELDS', () => {
  it('replaces the fields array in order', () => {
    const a = makeField({ id: 'a', ref: 'a', sortOrder: 0 });
    const b = makeField({ id: 'b', ref: 'b', sortOrder: 1 });
    const c = makeField({ id: 'c', ref: 'c', sortOrder: 2 });
    const state = makeState({ fields: [a, b, c] });

    const next = gridReducer(state, {
      type: 'SET_FIELDS',
      fields: [
        { ...c, sortOrder: 0 },
        { ...a, sortOrder: 1 },
        { ...b, sortOrder: 2 },
      ],
    });

    expect(next.fields.map((f) => f.id)).toEqual(['c', 'a', 'b']);
    expect(next.fields.map((f) => f.sortOrder)).toEqual([0, 1, 2]);
  });

  it('does not touch rows when fields are reordered', () => {
    const a = makeField({ id: 'a', ref: 'a' });
    const b = makeField({ id: 'b', ref: 'b' });
    const row = makeRow({ id: 'r1', values: { a: '1', b: '2' } });
    const state = makeState({ fields: [a, b], rows: [row] });

    const next = gridReducer(state, { type: 'SET_FIELDS', fields: [b, a] });

    expect(next.rows).toEqual([row]);
  });
});

// ---------------------------------------------------------------------------
// APPEND_FIELD
// ---------------------------------------------------------------------------

describe('gridReducer APPEND_FIELD', () => {
  it('appends the new field to the end of fields', () => {
    const field1 = makeField({ id: 'f1', ref: 'alpha' });
    const field2 = makeField({ id: 'f2', ref: 'beta' });
    const state = makeState({ fields: [field1] });

    const next = gridReducer(state, { type: 'APPEND_FIELD', field: field2 });

    expect(next.fields).toHaveLength(2);
    expect(next.fields[1]).toEqual(field2);
  });

  it('does not mutate existing fields', () => {
    const field1 = makeField({ id: 'f1', ref: 'alpha' });
    const field2 = makeField({ id: 'f2', ref: 'beta' });
    const state = makeState({ fields: [field1] });

    const next = gridReducer(state, { type: 'APPEND_FIELD', field: field2 });

    expect(next.fields[0]).toEqual(field1);
  });

  it('works when fields is empty', () => {
    const field = makeField({ id: 'f1', ref: 'alpha' });
    const state = makeState({ fields: [] });

    const next = gridReducer(state, { type: 'APPEND_FIELD', field });

    expect(next.fields).toHaveLength(1);
    expect(next.fields[0]).toEqual(field);
  });
});

// ---------------------------------------------------------------------------
// REPLACE_FIELD
// ---------------------------------------------------------------------------

describe('gridReducer REPLACE_FIELD', () => {
  it('replaces the matching field by id', () => {
    const field1 = makeField({ id: 'f1', ref: 'alpha', name: 'Alpha' });
    const field2 = makeField({ id: 'f2', ref: 'beta', name: 'Beta' });
    const updatedField1 = makeField({ id: 'f1', ref: 'alpha', name: 'Alpha Updated' });
    const state = makeState({ fields: [field1, field2] });

    const next = gridReducer(state, { type: 'REPLACE_FIELD', field: updatedField1 });

    expect(next.fields[0]?.name).toBe('Alpha Updated');
    expect(next.fields[1]).toEqual(field2);
  });

  it('does not change fields if id is not found', () => {
    const field1 = makeField({ id: 'f1', ref: 'alpha' });
    const ghost = makeField({ id: 'f99', ref: 'ghost', name: 'Ghost' });
    const state = makeState({ fields: [field1] });

    const next = gridReducer(state, { type: 'REPLACE_FIELD', field: ghost });

    expect(next.fields).toHaveLength(1);
    expect(next.fields[0]).toEqual(field1);
  });

  it('does not mutate other fields', () => {
    const field1 = makeField({ id: 'f1', ref: 'alpha' });
    const field2 = makeField({ id: 'f2', ref: 'beta', name: 'Beta' });
    const updatedField1 = makeField({ id: 'f1', ref: 'alpha', name: 'Alpha Updated' });
    const state = makeState({ fields: [field1, field2] });

    const next = gridReducer(state, { type: 'REPLACE_FIELD', field: updatedField1 });

    expect(next.fields[1]).toEqual(field2);
  });
});

// ---------------------------------------------------------------------------
// DELETE_FIELD
// ---------------------------------------------------------------------------

describe('gridReducer DELETE_FIELD', () => {
  it('removes the field with the given id from fields', () => {
    const field1 = makeField({ id: 'f1', ref: 'alpha' });
    const field2 = makeField({ id: 'f2', ref: 'beta' });
    const state = makeState({ fields: [field1, field2] });

    const next = gridReducer(state, { type: 'DELETE_FIELD', fieldId: 'f1', fieldRef: 'alpha' });

    expect(next.fields).toHaveLength(1);
    expect(next.fields[0]?.id).toBe('f2');
  });

  it('strips the fieldRef from all rows values', () => {
    const field1 = makeField({ id: 'f1', ref: 'alpha' });
    const row1 = makeRow({ id: 'r1', values: { alpha: 'hello', beta: 'world' } });
    const row2 = makeRow({ id: 'r2', values: { alpha: 'foo', beta: 'bar' } });
    const state = makeState({ fields: [field1], rows: [row1, row2] });

    const next = gridReducer(state, { type: 'DELETE_FIELD', fieldId: 'f1', fieldRef: 'alpha' });

    expect(next.rows[0]?.values).toEqual({ beta: 'world' });
    expect(next.rows[1]?.values).toEqual({ beta: 'bar' });
  });

  it('does not affect rows that do not have the fieldRef', () => {
    const field1 = makeField({ id: 'f1', ref: 'alpha' });
    const row1 = makeRow({ id: 'r1', values: { beta: 'world' } });
    const state = makeState({ fields: [field1], rows: [row1] });

    const next = gridReducer(state, { type: 'DELETE_FIELD', fieldId: 'f1', fieldRef: 'alpha' });

    expect(next.rows[0]?.values).toEqual({ beta: 'world' });
  });

  it('atomically removes field and strips rows in one action', () => {
    const field1 = makeField({ id: 'f1', ref: 'alpha' });
    const field2 = makeField({ id: 'f2', ref: 'beta' });
    const row1 = makeRow({ id: 'r1', values: { alpha: 'a', beta: 'b' } });
    const state = makeState({ fields: [field1, field2], rows: [row1] });

    const next = gridReducer(state, { type: 'DELETE_FIELD', fieldId: 'f1', fieldRef: 'alpha' });

    expect(next.fields).toHaveLength(1);
    expect(next.fields[0]?.id).toBe('f2');
    expect(next.rows[0]?.values).toEqual({ beta: 'b' });
  });
});

// ---------------------------------------------------------------------------
// useGridState moveField (renderHook + mocked fetch)
// ---------------------------------------------------------------------------

const makeApiField = (overrides: Partial<SlotFieldDefinition> = {}): SlotFieldDefinition => ({
  id: 'f1',
  ref: 'alpha',
  label: 'Alpha',
  fieldType: 'text',
  required: false,
  sortOrder: 0,
  config: { fieldType: 'text', maxLength: 200 },
  ...overrides,
});

const defaultSettings: SignupSettings = {
  requireEmail: true,
  allowNotes: true,
  showWhoSignedUp: true,
  lockoutHoursBeforeSlot: 0,
  sendReminders: true,
  groupByFieldRefs: [],
};

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  const status = init.status ?? (init.ok === false ? 500 : 200);
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fieldIdFromUrl(url: string): string | undefined {
  return url.match(/\/fields\/([^/]+)$/)?.[1];
}

function renderGrid(initialFields: SlotFieldDefinition[]) {
  return renderHook(() => useGridState('sig_test', initialFields, [], defaultSettings));
}

describe('useGridState moveField', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reorders fields and PATCHes each changed field with its new sortOrder', async () => {
    const a = makeApiField({ id: 'a', ref: 'a', label: 'A', sortOrder: 0 });
    const b = makeApiField({ id: 'b', ref: 'b', label: 'B', sortOrder: 1 });
    const c = makeApiField({ id: 'c', ref: 'c', label: 'C', sortOrder: 2 });

    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: {} }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderGrid([a, b, c]);
    await act(async () => {
      await result.current.moveField('c', 0);
    });

    expect(result.current.state.fields.map((f) => f.id)).toEqual(['c', 'a', 'b']);
    expect(result.current.state.fields.map((f) => f.sortOrder)).toEqual([0, 1, 2]);

    // Inspect PATCH bodies by id, not call count.
    const sentPatches = new Map<string, number>();
    for (const call of fetchMock.mock.calls) {
      const url = String(call[0]);
      const init = call[1] as RequestInit | undefined;
      if (init?.method !== 'PATCH') continue;
      const id = fieldIdFromUrl(url);
      const body = JSON.parse(String(init.body)) as { sortOrder: number };
      if (id !== undefined) sentPatches.set(id, body.sortOrder);
    }
    expect(sentPatches.get('c')).toBe(0);
    expect(sentPatches.get('a')).toBe(1);
    expect(sentPatches.get('b')).toBe(2);
    expect(result.current.state.saveStatus).toBe('saved');
  });

  it('refetches server truth on PATCH failure and preserves session widths', async () => {
    const a = makeApiField({ id: 'a', ref: 'a', label: 'A', sortOrder: 0 });
    const b = makeApiField({ id: 'b', ref: 'b', label: 'B', sortOrder: 1 });
    const c = makeApiField({ id: 'c', ref: 'c', label: 'C', sortOrder: 2 });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'PATCH') {
        const priorPatches = fetchMock.mock.calls.filter(
          (c) => (c[1] as RequestInit | undefined)?.method === 'PATCH',
        ).length;
        // First PATCH succeeds, second fails. Third should not fire.
        if (priorPatches <= 1) return jsonResponse({ data: {} });
        return jsonResponse({}, { ok: false });
      }
      if (url.endsWith('/fields')) {
        return jsonResponse({ data: [a, b, c] });
      }
      throw new Error(`unexpected fetch ${url} ${init?.method ?? 'GET'}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderGrid([a, b, c]);

    // Set a session-only width on field "a" before the failing reorder so we can
    // verify it survives the refetch.
    act(() => {
      result.current.setFieldWidth('a', 321);
    });
    expect(result.current.state.fields.find((f) => f.id === 'a')?.width).toBe(321);

    await act(async () => {
      await result.current.moveField('c', 0);
    });

    const patchCalls = fetchMock.mock.calls.filter(
      (c) => (c[1] as RequestInit | undefined)?.method === 'PATCH',
    );
    const getCalls = fetchMock.mock.calls.filter(
      (c) => (c[1] as RequestInit | undefined)?.method !== 'PATCH',
    );
    expect(patchCalls.length).toBe(2); // aborted after the failing second PATCH
    expect(getCalls.length).toBe(1); // single refetch
    expect(result.current.state.fields.map((f) => f.id)).toEqual(['a', 'b', 'c']);
    expect(result.current.state.fields.find((f) => f.id === 'a')?.width).toBe(321);
    expect(result.current.state.saveStatus).toBe('error');
  });

  it('falls back to snapshot with sticky error when refetch also fails', async () => {
    const a = makeApiField({ id: 'a', ref: 'a', label: 'A', sortOrder: 0 });
    const b = makeApiField({ id: 'b', ref: 'b', label: 'B', sortOrder: 1 });

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return jsonResponse({}, { ok: false });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderGrid([a, b]);
    await act(async () => {
      await result.current.moveField('b', 0);
    });

    // The contract is "sticky error, refresh converges them" — the snapshot
    // is not necessarily server-correct, only that the user sees `error`.
    expect(result.current.state.fields.map((f) => f.id)).toEqual(['a', 'b']);
    expect(result.current.state.saveStatus).toBe('error');
  });

  it("clears the pending 'saved → idle' timer when a new save begins", async () => {
    vi.useFakeTimers();
    try {
      const a = makeApiField({ id: 'a', ref: 'a', label: 'A', sortOrder: 0 });
      const b = makeApiField({ id: 'b', ref: 'b', label: 'B', sortOrder: 1 });

      let resolveDeferredPatch: ((res: Response) => void) | null = null;
      let patchCalls = 0;
      const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method !== 'PATCH') throw new Error('unexpected non-PATCH');
        patchCalls++;
        // Defer only the first PATCH of the second moveField (call #3) so the
        // second save stays in-flight while we advance fake time past
        // SAVED_CLEAR_MS. Other PATCHes resolve immediately.
        if (patchCalls === 3) {
          return new Promise<Response>((resolve) => {
            resolveDeferredPatch = resolve;
          });
        }
        return Promise.resolve(jsonResponse({ data: {} }));
      });
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderGrid([a, b]);

      // First move completes synchronously (relative to fake time) and arms
      // the 3000ms "saved → idle" timer.
      await act(async () => {
        await result.current.moveField('b', 0);
      });
      expect(result.current.state.saveStatus).toBe('saved');

      // Kick off the second move; its first PATCH is deferred, so the hook
      // sits in `saving` until we resolve the promise below.
      let secondMove!: Promise<void>;
      await act(async () => {
        secondMove = result.current.moveField('a', 0);
      });
      expect(result.current.state.saveStatus).toBe('saving');

      // Advance past SAVED_CLEAR_MS (3000ms). Without the markSaving fix,
      // the stale timer from the first move fires here and demotes the
      // in-flight save back to `idle`.
      await act(async () => {
        vi.advanceTimersByTime(3500);
      });
      expect(result.current.state.saveStatus).toBe('saving');

      // Resolve the deferred PATCH so the second move completes cleanly.
      await act(async () => {
        resolveDeferredPatch!(jsonResponse({ data: {} }));
        await secondMove;
      });
      expect(result.current.state.saveStatus).toBe('saved');
    } finally {
      vi.useRealTimers();
    }
  });

  it('is a no-op when toIdx clamps to fromIdx or fieldId is unknown', async () => {
    const a = makeApiField({ id: 'a', ref: 'a', label: 'A', sortOrder: 0 });
    const b = makeApiField({ id: 'b', ref: 'b', label: 'B', sortOrder: 1 });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderGrid([a, b]);

    // toIdx -1 clamps to 0; fromIdx of 'a' is 0 — no-op.
    await act(async () => {
      await result.current.moveField('a', -1);
    });
    // unknown fieldId — no-op.
    await act(async () => {
      await result.current.moveField('missing', 0);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.state.fields.map((f) => f.id)).toEqual(['a', 'b']);
  });
});
