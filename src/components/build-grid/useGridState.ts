import { useReducer, useRef, useEffect, useCallback } from 'react';
import type { SlotFieldDefinition, SlotFieldConfig, FieldType } from '@/schemas/slot-fields';
import type { SignupSettings } from '@/schemas/signups';

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

export type GridField = {
  id: string;
  ref: string;
  name: string; // field label
  type: FieldType;
  required: boolean;
  config: SlotFieldConfig;
  sortOrder: number;
  width?: number; // session-only resize override; not sent to API
};

export type GridRow = {
  id: string;
  capacity: number | null;
  sortOrder: number;
  values: Record<string, string>; // fieldRef → string value
};

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export type GridState = {
  fields: GridField[];
  rows: GridRow[];
  groupByFieldRef: string | null;
  previewRowIdx: number;
  showPreview: boolean;
  saveStatus: SaveStatus;
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type GridAction =
  | { type: 'SET_FIELDS'; fields: GridField[] }
  | { type: 'SET_ROWS'; rows: GridRow[] }
  | { type: 'SET_FIELD_WIDTH'; fieldId: string; width: number | undefined }
  | { type: 'SET_PREVIEW_ROW'; idx: number }
  | { type: 'SET_SHOW_PREVIEW'; show: boolean }
  | { type: 'SET_GROUP_BY'; ref: string | null }
  | { type: 'SET_SAVE_STATUS'; status: SaveStatus }
  | { type: 'OPTIMISTIC_ADD_ROW'; row: GridRow }
  | { type: 'OPTIMISTIC_REMOVE_ROW'; rowId: string }
  | { type: 'OPTIMISTIC_EDIT_CELL'; rowId: string; fieldRef: string; value: string }
  | { type: 'OPTIMISTIC_SET_CAPACITY'; rowId: string; capacity: number | null }
  | { type: 'APPEND_FIELD'; field: GridField }
  | { type: 'REPLACE_FIELD'; field: GridField }
  | { type: 'DELETE_FIELD'; fieldId: string; fieldRef: string };

// ---------------------------------------------------------------------------
// Reducer (exported for testing)
// ---------------------------------------------------------------------------

export function gridReducer(state: GridState, action: GridAction): GridState {
  switch (action.type) {
    case 'SET_FIELDS':
      return { ...state, fields: action.fields };

    case 'SET_ROWS':
      return { ...state, rows: action.rows };

    case 'SET_FIELD_WIDTH':
      return {
        ...state,
        fields: state.fields.map((f) =>
          f.id === action.fieldId ? { ...f, width: action.width } : f,
        ),
      };

    case 'SET_PREVIEW_ROW':
      return { ...state, previewRowIdx: action.idx };

    case 'SET_SHOW_PREVIEW':
      return { ...state, showPreview: action.show };

    case 'SET_GROUP_BY':
      return { ...state, groupByFieldRef: action.ref };

    case 'SET_SAVE_STATUS':
      return { ...state, saveStatus: action.status };

    case 'OPTIMISTIC_ADD_ROW':
      return { ...state, rows: [...state.rows, action.row] };

    case 'OPTIMISTIC_REMOVE_ROW': {
      const nextRows = state.rows.filter((r) => r.id !== action.rowId);
      return {
        ...state,
        rows: nextRows,
        previewRowIdx: Math.min(state.previewRowIdx, Math.max(0, nextRows.length - 1)),
      };
    }

    case 'OPTIMISTIC_EDIT_CELL':
      return {
        ...state,
        rows: state.rows.map((r) =>
          r.id === action.rowId
            ? { ...r, values: { ...r.values, [action.fieldRef]: action.value } }
            : r,
        ),
      };

    case 'OPTIMISTIC_SET_CAPACITY':
      return {
        ...state,
        rows: state.rows.map((r) =>
          r.id === action.rowId ? { ...r, capacity: action.capacity } : r,
        ),
      };

    case 'APPEND_FIELD':
      return { ...state, fields: [...state.fields, action.field] };

    case 'REPLACE_FIELD':
      return {
        ...state,
        fields: state.fields.map((f) => (f.id === action.field.id ? action.field : f)),
      };

    case 'DELETE_FIELD':
      return {
        ...state,
        fields: state.fields.filter((f) => f.id !== action.fieldId),
        rows: state.rows.map((r) => {
          const { [action.fieldRef]: _, ...rest } = r.values;
          return { ...r, values: rest };
        }),
      };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Module-level constants (stable, no need to be inside the hook)
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 800;
const SAVED_CLEAR_MS = 3000;
const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toGridFields(fields: SlotFieldDefinition[]): GridField[] {
  return fields.map((f) => ({
    id: f.id,
    ref: f.ref,
    name: f.label,
    type: f.fieldType,
    required: f.required,
    config: f.config,
    sortOrder: f.sortOrder,
  }));
}

function toLabelRef(label: string): string {
  return (
    label
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'field'
  );
}

function toStringValues(values: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    result[k] = v === null || v === undefined ? '' : String(v);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGridState(
  signupId: string,
  initialFields: SlotFieldDefinition[],
  initialRows: Array<{ id: string; capacity: number | null; sortOrder?: number; values: Record<string, unknown> }>,
  initialSettings: SignupSettings,
) {
  const [state, dispatch] = useReducer(gridReducer, undefined, () => ({
    fields: toGridFields(initialFields),
    rows: initialRows.map((r, i) => ({
      id: r.id,
      capacity: r.capacity,
      sortOrder: r.sortOrder ?? i,
      values: toStringValues(r.values),
    })),
    groupByFieldRef: null,
    previewRowIdx: 0,
    showPreview: false,
    saveStatus: 'idle' as SaveStatus,
  }));

  // Per-slot debounce entries: key = `${rowId}:${fieldRef}` or `${rowId}:capacity`
  type DebounceEntry = { timeoutId: ReturnType<typeof setTimeout>; saveFn: () => Promise<void> };
  const timersRef = useRef<Map<string, DebounceEntry>>(new Map());
  const stateRef = useRef(state);
  stateRef.current = state;
  const settingsRef = useRef<SignupSettings>(initialSettings);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current !== null) clearTimeout(savedTimerRef.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Save status helpers
  // ---------------------------------------------------------------------------

  function markSaving() {
    dispatch({ type: 'SET_SAVE_STATUS', status: 'saving' });
  }

  function markSaved() {
    dispatch({ type: 'SET_SAVE_STATUS', status: 'saved' });
    if (savedTimerRef.current !== null) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => dispatch({ type: 'SET_SAVE_STATUS', status: 'idle' }), SAVED_CLEAR_MS);
  }

  function markError() {
    dispatch({ type: 'SET_SAVE_STATUS', status: 'error' });
  }

  // ---------------------------------------------------------------------------
  // Field mutations
  // ---------------------------------------------------------------------------

  const addField = useCallback(
    async (
      type: FieldType,
      name: string,
      config: SlotFieldConfig,
      required: boolean,
    ): Promise<void> => {
      markSaving();
      try {
        const res = await fetch(`/api/signups/${signupId}/fields`, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ ref: toLabelRef(name), label: name, fieldType: type, config, required }),
        });
        if (!res.ok) throw new Error(await res.text());
        const envelope = (await res.json()) as { data: SlotFieldDefinition };
        const field = toGridFields([envelope.data])[0]!;
        dispatch({ type: 'APPEND_FIELD', field });
        markSaved();
      } catch {
        markError();
      }
    },
    [signupId],
  );

  const updateField = useCallback(
    async (
      fieldId: string,
      patch: { name?: string; type?: FieldType; required?: boolean; config?: SlotFieldConfig },
    ): Promise<void> => {
      markSaving();
      try {
        const body: Record<string, unknown> = {};
        if (patch.name !== undefined) body['label'] = patch.name;
        if (patch.type !== undefined) body['fieldType'] = patch.type;
        if (patch.required !== undefined) body['required'] = patch.required;
        if (patch.config !== undefined) body['config'] = patch.config;

        const res = await fetch(`/api/signups/${signupId}/fields/${fieldId}`, {
          method: 'PATCH',
          headers: JSON_HEADERS,
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await res.text());
        const envelope = (await res.json()) as { data: SlotFieldDefinition };
        const updated = toGridFields([envelope.data])[0]!;
        dispatch({ type: 'REPLACE_FIELD', field: updated });
        markSaved();
      } catch {
        markError();
      }
    },
    [signupId],
  );

  const deleteField = useCallback(
    async (fieldId: string): Promise<void> => {
      const field = state.fields.find((f) => f.id === fieldId);
      if (!field) return;
      const fieldRef = field.ref;
      markSaving();
      try {
        const res = await fetch(`/api/signups/${signupId}/fields/${fieldId}`, {
          method: 'DELETE',
        });
        if (!res.ok) throw new Error(await res.text());
        dispatch({ type: 'DELETE_FIELD', fieldId, fieldRef });
        markSaved();
      } catch {
        markError();
      }
    },
    [signupId, state.fields],
  );

  const moveFieldUp = useCallback(
    async (fieldId: string): Promise<void> => {
      const idx = state.fields.findIndex((f) => f.id === fieldId);
      if (idx <= 0) return;
      const above = state.fields[idx - 1]!;
      const current = state.fields[idx]!;
      const newAboveSortOrder = current.sortOrder;
      const newCurrentSortOrder = above.sortOrder;

      markSaving();
      try {
        const [r1, r2] = await Promise.all([
          fetch(`/api/signups/${signupId}/fields/${above.id}`, {
            method: 'PATCH',
            headers: JSON_HEADERS,
            body: JSON.stringify({ sortOrder: newAboveSortOrder }),
          }),
          fetch(`/api/signups/${signupId}/fields/${current.id}`, {
            method: 'PATCH',
            headers: JSON_HEADERS,
            body: JSON.stringify({ sortOrder: newCurrentSortOrder }),
          }),
        ]);
        if (!r1.ok || !r2.ok) throw new Error('reorder failed');
        const updatedFields = state.fields.map((f) => {
          if (f.id === above.id) return { ...f, sortOrder: newAboveSortOrder };
          if (f.id === current.id) return { ...f, sortOrder: newCurrentSortOrder };
          return f;
        });
        dispatch({
          type: 'SET_FIELDS',
          fields: [...updatedFields].sort((a, b) => a.sortOrder - b.sortOrder),
        });
        markSaved();
      } catch {
        markError();
      }
    },
    [signupId, state.fields],
  );

  const moveFieldDown = useCallback(
    async (fieldId: string): Promise<void> => {
      const idx = state.fields.findIndex((f) => f.id === fieldId);
      if (idx < 0 || idx >= state.fields.length - 1) return;
      const current = state.fields[idx]!;
      const below = state.fields[idx + 1]!;
      const newCurrentSortOrder = below.sortOrder;
      const newBelowSortOrder = current.sortOrder;

      markSaving();
      try {
        const [r1, r2] = await Promise.all([
          fetch(`/api/signups/${signupId}/fields/${current.id}`, {
            method: 'PATCH',
            headers: JSON_HEADERS,
            body: JSON.stringify({ sortOrder: newCurrentSortOrder }),
          }),
          fetch(`/api/signups/${signupId}/fields/${below.id}`, {
            method: 'PATCH',
            headers: JSON_HEADERS,
            body: JSON.stringify({ sortOrder: newBelowSortOrder }),
          }),
        ]);
        if (!r1.ok || !r2.ok) throw new Error('reorder failed');
        const updatedFields = state.fields.map((f) => {
          if (f.id === current.id) return { ...f, sortOrder: newCurrentSortOrder };
          if (f.id === below.id) return { ...f, sortOrder: newBelowSortOrder };
          return f;
        });
        dispatch({
          type: 'SET_FIELDS',
          fields: [...updatedFields].sort((a, b) => a.sortOrder - b.sortOrder),
        });
        markSaved();
      } catch {
        markError();
      }
    },
    [signupId, state.fields],
  );

  const setFieldWidth = useCallback(
    (fieldId: string, width: number | undefined): void => {
      dispatch({ type: 'SET_FIELD_WIDTH', fieldId, width });
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Row mutations
  // ---------------------------------------------------------------------------

  const addRow = useCallback(async (): Promise<void> => {
    markSaving();
    try {
      const res = await fetch(`/api/signups/${signupId}/slots`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ values: {}, capacity: 1 }),
      });
      if (!res.ok) throw new Error(await res.text());
      const envelope = (await res.json()) as {
        data: { id: string; capacity: number | null; sortOrder: number; values: Record<string, unknown> };
      };
      const slot = envelope.data;
      dispatch({
        type: 'OPTIMISTIC_ADD_ROW',
        row: {
          id: slot.id,
          capacity: slot.capacity,
          sortOrder: slot.sortOrder,
          values: toStringValues(slot.values ?? {}),
        },
      });
      markSaved();
    } catch {
      markError();
    }
  }, [signupId]);

  const deleteRow = useCallback(async (rowId: string): Promise<void> => {
    markSaving();
    try {
      const res = await fetch(`/api/slots/${rowId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      dispatch({ type: 'OPTIMISTIC_REMOVE_ROW', rowId });
      markSaved();
    } catch {
      markError();
    }
    // markSaving/Saved/Error are stable (inline fns, not deps); rowId is a param
  }, []);

  const moveRowUp = useCallback(
    async (rowId: string): Promise<void> => {
      const idx = state.rows.findIndex((r) => r.id === rowId);
      if (idx <= 0) return;
      const above = state.rows[idx - 1]!;
      const current = state.rows[idx]!;
      const newAboveSortOrder = current.sortOrder;
      const newCurrentSortOrder = above.sortOrder;

      markSaving();
      try {
        const [r1, r2] = await Promise.all([
          fetch(`/api/slots/${above.id}`, {
            method: 'PATCH',
            headers: JSON_HEADERS,
            body: JSON.stringify({ sortOrder: newAboveSortOrder }),
          }),
          fetch(`/api/slots/${current.id}`, {
            method: 'PATCH',
            headers: JSON_HEADERS,
            body: JSON.stringify({ sortOrder: newCurrentSortOrder }),
          }),
        ]);
        if (!r1.ok || !r2.ok) throw new Error('reorder failed');
        const updatedRows = state.rows.map((r) => {
          if (r.id === above.id) return { ...r, sortOrder: newAboveSortOrder };
          if (r.id === current.id) return { ...r, sortOrder: newCurrentSortOrder };
          return r;
        });
        dispatch({
          type: 'SET_ROWS',
          rows: [...updatedRows].sort((a, b) => a.sortOrder - b.sortOrder),
        });
        markSaved();
      } catch {
        markError();
      }
    },
    [state.rows],
  );

  const moveRowDown = useCallback(
    async (rowId: string): Promise<void> => {
      const idx = state.rows.findIndex((r) => r.id === rowId);
      if (idx < 0 || idx >= state.rows.length - 1) return;
      const current = state.rows[idx]!;
      const below = state.rows[idx + 1]!;
      const newCurrentSortOrder = below.sortOrder;
      const newBelowSortOrder = current.sortOrder;

      markSaving();
      try {
        const [r1, r2] = await Promise.all([
          fetch(`/api/slots/${current.id}`, {
            method: 'PATCH',
            headers: JSON_HEADERS,
            body: JSON.stringify({ sortOrder: newCurrentSortOrder }),
          }),
          fetch(`/api/slots/${below.id}`, {
            method: 'PATCH',
            headers: JSON_HEADERS,
            body: JSON.stringify({ sortOrder: newBelowSortOrder }),
          }),
        ]);
        if (!r1.ok || !r2.ok) throw new Error('reorder failed');
        const updatedRows = state.rows.map((r) => {
          if (r.id === current.id) return { ...r, sortOrder: newCurrentSortOrder };
          if (r.id === below.id) return { ...r, sortOrder: newBelowSortOrder };
          return r;
        });
        dispatch({
          type: 'SET_ROWS',
          rows: [...updatedRows].sort((a, b) => a.sortOrder - b.sortOrder),
        });
        markSaved();
      } catch {
        markError();
      }
    },
    [state.rows],
  );

  // ---------------------------------------------------------------------------
  // Cell / capacity debounced saves
  // ---------------------------------------------------------------------------

  const flushTimer = useCallback((key: string, saveFn: () => Promise<void>) => {
    const timers = timersRef.current;
    const existing = timers.get(key);
    if (existing !== undefined) clearTimeout(existing.timeoutId);
    const timeoutId = setTimeout(() => {
      timers.delete(key);
      void saveFn();
    }, DEBOUNCE_MS);
    timers.set(key, { timeoutId, saveFn });
  }, []);

  const editCell = useCallback(
    (rowId: string, fieldRef: string, value: string): void => {
      dispatch({ type: 'OPTIMISTIC_EDIT_CELL', rowId, fieldRef, value });
      const key = `${rowId}:${fieldRef}`;
      flushTimer(key, async () => {
        const row = stateRef.current.rows.find((r) => r.id === rowId);
        if (!row) return;
        const fields = stateRef.current.fields;
        const typedValues: Record<string, unknown> = {};
        for (const [ref, raw] of Object.entries(row.values)) {
          if (!raw) continue;
          const field = fields.find((f) => f.ref === ref);
          if (field?.type === 'number') {
            const n = Number(raw);
            if (Number.isFinite(n)) typedValues[ref] = n;
          } else {
            typedValues[ref] = raw;
          }
        }
        markSaving();
        try {
          const fields = stateRef.current.fields;
          const typedValues: Record<string, unknown> = {};
          for (const [ref, strVal] of Object.entries(row.values)) {
            const fld = fields.find((f) => f.ref === ref);
            if (fld?.type === 'number') {
              const n = Number(strVal);
              if (strVal !== '' && Number.isFinite(n)) typedValues[ref] = n;
            } else {
              typedValues[ref] = strVal;
            }
          }
          const res = await fetch(`/api/slots/${rowId}`, {
            method: 'PATCH',
            headers: JSON_HEADERS,
            body: JSON.stringify({ values: typedValues }),
          });
          if (!res.ok) throw new Error(await res.text());
          markSaved();
        } catch {
          markError();
        }
      });
    },
    [flushTimer],
  );

  const setCapacity = useCallback(
    (rowId: string, capacity: number | null): void => {
      dispatch({ type: 'OPTIMISTIC_SET_CAPACITY', rowId, capacity });
      const key = `${rowId}:capacity`;
      flushTimer(key, async () => {
        markSaving();
        try {
          const res = await fetch(`/api/slots/${rowId}`, {
            method: 'PATCH',
            headers: JSON_HEADERS,
            body: JSON.stringify({ capacity }),
          });
          if (!res.ok) throw new Error(await res.text());
          markSaved();
        } catch {
          markError();
        }
      });
    },
    [flushTimer],
  );

  // Flush all pending saves on unmount — call each pending saveFn immediately,
  // then cancel the timer so it doesn't double-fire.
  // Capture timersRef.current in a variable so the cleanup uses the same Map
  // reference that was set at effect-run time (avoids the exhaustive-deps warning).
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const [, { timeoutId, saveFn }] of timers) {
        clearTimeout(timeoutId);
        void saveFn();
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // UI state
  // ---------------------------------------------------------------------------

  const setPreviewRow = useCallback((idx: number): void => {
    dispatch({ type: 'SET_PREVIEW_ROW', idx });
  }, []);

  const setShowPreview = useCallback((show: boolean): void => {
    dispatch({ type: 'SET_SHOW_PREVIEW', show });
  }, []);

  const setGroupBy = useCallback(
    async (ref: string | null): Promise<void> => {
      markSaving();
      const nextSettings: SignupSettings = { ...settingsRef.current, groupByFieldRefs: ref ? [ref] : [] };
      try {
        const res = await fetch(`/api/signups/${signupId}`, {
          method: 'PATCH',
          headers: JSON_HEADERS,
          body: JSON.stringify({ settings: nextSettings }),
        });
        if (!res.ok) throw new Error(await res.text());
        settingsRef.current = nextSettings;
        dispatch({ type: 'SET_GROUP_BY', ref });
        markSaved();
      } catch {
        markError();
      }
    },
    [signupId],
  );

  return {
    state,
    addField,
    updateField,
    deleteField,
    moveFieldUp,
    moveFieldDown,
    setFieldWidth,
    addRow,
    deleteRow,
    moveRowUp,
    moveRowDown,
    editCell,
    setCapacity,
    setPreviewRow,
    setShowPreview,
    setGroupBy,
  };
}
