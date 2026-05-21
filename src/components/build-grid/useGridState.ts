import { useReducer, useRef, useEffect, useCallback } from 'react';
import type { SlotFieldDefinition, SlotFieldConfig } from '@/schemas/slot-fields';
import type { SignupSettings } from '@/schemas/signups';
import type { ErrorCode } from '@/lib/errors';

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

export type GridField = {
  id: string;
  ref: string;
  name: string; // field label
  /**
   * Field type + per-type config. `config.fieldType` is the single discriminant —
   * there is no parallel top-level `type` field, so narrowing on `config.fieldType`
   * makes inconsistent state unrepresentable.
   */
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

/**
 * `error` carries the closed `ErrorCode` enum the server returns via the
 * `{ error: { code, message } }` envelope (see `lib/api-response.ts`), so the
 * rail can render code-specific messages instead of a generic "Save failed".
 */
export type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; code: ErrorCode; message?: string };

const SAVING: SaveStatus = { kind: 'saving' };
const SAVED: SaveStatus = { kind: 'saved' };
const IDLE: SaveStatus = { kind: 'idle' };

/** Best-effort parse of `{ error: { code, message } }` from a non-OK Response. */
async function parseErrorEnvelope(res: Response): Promise<{ code: ErrorCode; message?: string }> {
  try {
    const body = (await res.clone().json()) as { error?: { code?: ErrorCode; message?: string } };
    const code = body.error?.code ?? 'internal';
    const message = body.error?.message;
    return message !== undefined ? { code, message } : { code };
  } catch {
    return { code: 'internal' };
  }
}

export type GridState = {
  title: string;
  description: string;
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
  | { type: 'OPTIMISTIC_UPDATE_META'; patch: { title?: string; description?: string } }
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

    case 'OPTIMISTIC_UPDATE_META':
      return {
        ...state,
        ...(action.patch.title !== undefined ? { title: action.patch.title } : {}),
        ...(action.patch.description !== undefined ? { description: action.patch.description } : {}),
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
    config: f.config,
    sortOrder: f.sortOrder,
  }));
}

function toLabelRef(label: string, existingRefs: string[]): string {
  const base =
    label
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'field';
  if (!existingRefs.includes(base)) return base;
  let i = 2;
  while (existingRefs.includes(`${base}-${i}`)) i++;
  return `${base}-${i}`;
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
  initialMeta: { title: string; description: string | null } = { title: '', description: '' },
) {
  const [state, dispatch] = useReducer(gridReducer, undefined, () => ({
    title: initialMeta.title,
    description: initialMeta.description ?? '',
    fields: toGridFields(initialFields),
    rows: initialRows.map((r, i) => ({
      id: r.id,
      capacity: r.capacity,
      sortOrder: r.sortOrder ?? i,
      values: toStringValues(r.values),
    })),
    groupByFieldRef: initialSettings.groupByFieldRefs[0] ?? null,
    previewRowIdx: 0,
    showPreview: false,
    saveStatus: IDLE,
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

  // On mount: default the live-preview side rail to ON when the viewport has
  // room for both panels (≥xl breakpoint). One-shot — does not re-evaluate on
  // resize, so a manual toggle off is respected until the next mount.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    if (window.matchMedia('(min-width: 1280px)').matches) {
      dispatch({ type: 'SET_SHOW_PREVIEW', show: true });
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Save status helpers
  // ---------------------------------------------------------------------------

  function markSaving() {
    // Cancel any pending "saved → idle" timer so a stale fire-and-forget
    // doesn't demote an in-flight save back to idle.
    if (savedTimerRef.current !== null) {
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = null;
    }
    dispatch({ type: 'SET_SAVE_STATUS', status: SAVING });
  }

  function markSaved() {
    dispatch({ type: 'SET_SAVE_STATUS', status: SAVED });
    if (savedTimerRef.current !== null) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => dispatch({ type: 'SET_SAVE_STATUS', status: IDLE }), SAVED_CLEAR_MS);
  }

  function markError(err: { code: ErrorCode; message?: string } = { code: 'internal' }) {
    if (savedTimerRef.current !== null) {
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = null;
    }
    dispatch({
      type: 'SET_SAVE_STATUS',
      status: err.message !== undefined
        ? { kind: 'error', code: err.code, message: err.message }
        : { kind: 'error', code: err.code },
    });
  }

  /** Wraps a fetch + parseErrorEnvelope so the catch site has the typed code. */
  async function expectOk(res: Response): Promise<void> {
    if (res.ok) return;
    const err = await parseErrorEnvelope(res);
    throw err;
  }

  function asErr(e: unknown): { code: ErrorCode; message?: string } {
    if (e && typeof e === 'object' && 'code' in e) {
      const obj = e as { code: ErrorCode; message?: string };
      return obj.message !== undefined ? { code: obj.code, message: obj.message } : { code: obj.code };
    }
    return { code: 'internal' };
  }

  // ---------------------------------------------------------------------------
  // Field mutations
  // ---------------------------------------------------------------------------

  const addField = useCallback(
    async (
      name: string,
      config: SlotFieldConfig,
    ): Promise<void> => {
      markSaving();
      try {
        const res = await fetch(`/api/signups/${signupId}/fields`, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({
            ref: toLabelRef(name, stateRef.current.fields.map((f) => f.ref)),
            label: name,
            fieldType: config.fieldType,
            config,
          }),
        });
        await expectOk(res);
        const envelope = (await res.json()) as { data: SlotFieldDefinition };
        const field = toGridFields([envelope.data])[0]!;
        dispatch({ type: 'APPEND_FIELD', field });
        markSaved();
      } catch (e) {
        markError(asErr(e));
      }
    },
    [signupId],
  );

  const updateField = useCallback(
    async (
      fieldId: string,
      patch: { name?: string; config?: SlotFieldConfig },
    ): Promise<void> => {
      markSaving();
      try {
        const body: Record<string, unknown> = {};
        if (patch.name !== undefined) body['label'] = patch.name;
        if (patch.config !== undefined) {
          body['fieldType'] = patch.config.fieldType;
          body['config'] = patch.config;
        }

        const res = await fetch(`/api/signups/${signupId}/fields/${fieldId}`, {
          method: 'PATCH',
          headers: JSON_HEADERS,
          body: JSON.stringify(body),
        });
        await expectOk(res);
        const envelope = (await res.json()) as { data: SlotFieldDefinition };
        const updated = toGridFields([envelope.data])[0]!;
        dispatch({ type: 'REPLACE_FIELD', field: updated });
        markSaved();
      } catch (e) {
        markError(asErr(e));
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
        await expectOk(res);
        dispatch({ type: 'DELETE_FIELD', fieldId, fieldRef });
        markSaved();
      } catch (e) {
        markError(asErr(e));
      }
    },
    [signupId, state.fields],
  );

  // Concurrent reorders by other organizers can race; this client converges via
  // refetch on error but the server has no transactional bulk-reorder endpoint.
  const moveField = useCallback(
    async (fieldId: string, toIdx: number): Promise<void> => {
      const previous = state.fields;
      const fromIdx = previous.findIndex((f) => f.id === fieldId);
      if (fromIdx === -1) return;
      const clamped = Math.max(0, Math.min(previous.length - 1, toIdx));
      if (clamped === fromIdx) return;

      const reordered = previous.slice();
      const [moved] = reordered.splice(fromIdx, 1);
      if (!moved) return;
      reordered.splice(clamped, 0, moved);
      const resequenced = reordered.map((f, i) => ({ ...f, sortOrder: i }));

      // Optimistic update so the UI reorders immediately.
      dispatch({ type: 'SET_FIELDS', fields: resequenced });
      markSaving();
      let failure: { code: ErrorCode; message?: string } | null = null;
      try {
        const changed = resequenced.filter(
          (f, i) => previous[i]?.id !== f.id || previous[i]?.sortOrder !== f.sortOrder,
        );
        for (const f of changed) {
          const res = await fetch(`/api/signups/${signupId}/fields/${f.id}`, {
            method: 'PATCH',
            headers: JSON_HEADERS,
            body: JSON.stringify({ sortOrder: f.sortOrder }),
          });
          await expectOk(res);
        }
        markSaved();
      } catch (e) {
        failure = asErr(e);
      }
      if (failure !== null) {
        // Server may hold a partial reorder; converge on server truth via refetch.
        // `previous` already carries session-only column widths — preserve them on
        // refresh by id, since `toGridFields` cannot populate `width`.
        const widthById = new Map(previous.map((f) => [f.id, f.width]));
        try {
          const res = await fetch(`/api/signups/${signupId}/fields`);
          if (res.ok) {
            const envelope = (await res.json()) as { data: SlotFieldDefinition[] };
            const refreshed = toGridFields(envelope.data).map((f) => ({
              ...f,
              width: widthById.get(f.id),
            }));
            dispatch({ type: 'SET_FIELDS', fields: refreshed });
          } else {
            dispatch({ type: 'SET_FIELDS', fields: previous });
          }
        } catch {
          dispatch({ type: 'SET_FIELDS', fields: previous });
        }
        markError(failure);
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

  const addRow = useCallback(async (
    seed?: { values?: Record<string, unknown>; capacity?: number },
  ): Promise<void> => {
    markSaving();
    try {
      const res = await fetch(`/api/signups/${signupId}/slots`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ values: seed?.values ?? {}, capacity: seed?.capacity ?? 1 }),
      });
      await expectOk(res);
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
    } catch (e) {
      markError(asErr(e));
    }
  }, [signupId]);

  const duplicateRow = useCallback(async (rowId: string): Promise<void> => {
    const source = stateRef.current.rows.find((r) => r.id === rowId);
    if (!source) return;
    // Clone values verbatim (already string-typed; addRow re-serializes for
    // the API). Capacity falls back to 1 when the source was uncapped — the
    // grid uses null to mean "no limit", but new slots ship with capacity 1
    // to stay safe and consistent with the bare addRow contract.
    const seedValues: Record<string, unknown> = { ...source.values };
    await addRow({
      values: seedValues,
      capacity: source.capacity ?? 1,
    });
  }, [addRow]);

  const deleteRow = useCallback(async (rowId: string): Promise<void> => {
    markSaving();
    try {
      const res = await fetch(`/api/slots/${rowId}`, { method: 'DELETE' });
      await expectOk(res);
      dispatch({ type: 'OPTIMISTIC_REMOVE_ROW', rowId });
      markSaved();
    } catch (e) {
      markError(asErr(e));
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
        // Surface whichever side failed; if both, the first non-OK wins.
        if (!r1.ok) await expectOk(r1);
        if (!r2.ok) await expectOk(r2);
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
      } catch (e) {
        markError(asErr(e));
      }
    },
    [state.rows],
  );

  // Concurrent reorders by other organizers can race; this client converges via
  // refetch on error. Mirrors moveField — fine for v1 slot counts (<30 typical).
  const moveRow = useCallback(
    async (fromIdx: number, toIdx: number): Promise<void> => {
      const previous = state.rows;
      if (fromIdx < 0 || fromIdx >= previous.length) return;
      const clamped = Math.max(0, Math.min(previous.length - 1, toIdx));
      if (clamped === fromIdx) return;

      const reordered = previous.slice();
      const [moved] = reordered.splice(fromIdx, 1);
      if (!moved) return;
      reordered.splice(clamped, 0, moved);
      const resequenced = reordered.map((r, i) => ({ ...r, sortOrder: i }));

      dispatch({ type: 'SET_ROWS', rows: resequenced });
      markSaving();
      let failure: { code: ErrorCode; message?: string } | null = null;
      try {
        const changed = resequenced.filter(
          (r, i) => previous[i]?.id !== r.id || previous[i]?.sortOrder !== r.sortOrder,
        );
        for (const r of changed) {
          const res = await fetch(`/api/slots/${r.id}`, {
            method: 'PATCH',
            headers: JSON_HEADERS,
            body: JSON.stringify({ sortOrder: r.sortOrder }),
          });
          await expectOk(res);
        }
        markSaved();
      } catch (e) {
        failure = asErr(e);
      }
      if (failure !== null) {
        try {
          const res = await fetch(`/api/signups/${signupId}/slots`);
          if (res.ok) {
            const envelope = (await res.json()) as {
              data: Array<{ id: string; capacity: number | null; sortOrder: number; values: Record<string, unknown> }>;
            };
            const refreshed = envelope.data.map((s) => ({
              id: s.id,
              capacity: s.capacity,
              sortOrder: s.sortOrder,
              values: toStringValues(s.values ?? {}),
            }));
            dispatch({ type: 'SET_ROWS', rows: refreshed });
          } else {
            dispatch({ type: 'SET_ROWS', rows: previous });
          }
        } catch {
          dispatch({ type: 'SET_ROWS', rows: previous });
        }
        markError(failure);
      }
    },
    [signupId, state.rows],
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
        if (!r1.ok) await expectOk(r1);
        if (!r2.ok) await expectOk(r2);
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
      } catch (e) {
        markError(asErr(e));
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
        markSaving();
        try {
          const fields = stateRef.current.fields;
          // Coerce by field type so numeric cells round-trip as numbers and
          // empty strings on number fields drop out of the patch body.
          const typedValues: Record<string, unknown> = {};
          for (const [ref, strVal] of Object.entries(row.values)) {
            const fld = fields.find((f) => f.ref === ref);
            if (fld?.config.fieldType === 'number') {
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
          await expectOk(res);
          markSaved();
        } catch (e) {
          markError(asErr(e));
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
          await expectOk(res);
          markSaved();
        } catch (e) {
          markError(asErr(e));
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

  const touchedMetaRef = useRef<Set<'title' | 'description'>>(new Set());
  // Last server-accepted meta values. Used to revert the optimistic state when
  // a user edit would fail server validation (e.g. clearing the title), so the
  // input doesn't strand on an invalid value the server never accepted.
  const lastCommittedMetaRef = useRef<{ title: string; description: string }>({
    title: initialMeta.title,
    description: initialMeta.description ?? '',
  });

  const updateSignupMeta = useCallback(
    (patch: { title?: string; description?: string }): void => {
      // Track which keys have been touched across consecutive calls so the
      // debounced PATCH carries every field the user edited in the burst —
      // not just whichever one was passed in the final call.
      if (patch.title !== undefined) touchedMetaRef.current.add('title');
      if (patch.description !== undefined) touchedMetaRef.current.add('description');
      dispatch({ type: 'OPTIMISTIC_UPDATE_META', patch });
      flushTimer('signup-meta', async () => {
        const touched = Array.from(touchedMetaRef.current);
        touchedMetaRef.current = new Set();
        const body: Record<string, string> = {};
        const revert: { title?: string; description?: string } = {};
        let titleTooShort = false;
        for (const key of touched) {
          const raw = stateRef.current[key];
          const trimmed = raw.trim();
          if (key === 'title') {
            if (trimmed.length < 2) {
              // Server requires min(2). Revert the optimistic value and surface
              // the validation error so the user knows why their edit didn't
              // stick — otherwise the title just snaps back with no explanation.
              revert.title = lastCommittedMetaRef.current.title;
              titleTooShort = true;
              continue;
            }
            body['title'] = trimmed.slice(0, 120);
          } else {
            body['description'] = trimmed.slice(0, 2000);
          }
        }
        if (Object.keys(revert).length > 0) {
          dispatch({ type: 'OPTIMISTIC_UPDATE_META', patch: revert });
        }
        if (Object.keys(body).length === 0) {
          if (titleTooShort) {
            markError({ code: 'invalid_input', message: 'Title must be at least 2 characters.' });
          }
          return;
        }
        markSaving();
        try {
          const res = await fetch(`/api/signups/${signupId}`, {
            method: 'PATCH',
            headers: JSON_HEADERS,
            body: JSON.stringify(body),
          });
          await expectOk(res);
          if (body['title'] !== undefined) lastCommittedMetaRef.current.title = body['title'];
          if (body['description'] !== undefined) lastCommittedMetaRef.current.description = body['description'];
          if (titleTooShort) {
            // Description saved but title was rejected client-side — surface
            // the validation message anyway so the user gets the feedback.
            markError({ code: 'invalid_input', message: 'Title must be at least 2 characters.' });
          } else {
            markSaved();
          }
        } catch (e) {
          markError(asErr(e));
        }
      });
    },
    [signupId, flushTimer],
  );

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
        await expectOk(res);
        settingsRef.current = nextSettings;
        dispatch({ type: 'SET_GROUP_BY', ref });
        markSaved();
      } catch (e) {
        markError(asErr(e));
      }
    },
    [signupId],
  );

  return {
    state,
    addField,
    updateField,
    deleteField,
    moveField,
    setFieldWidth,
    addRow,
    duplicateRow,
    deleteRow,
    moveRowUp,
    moveRowDown,
    moveRow,
    editCell,
    setCapacity,
    setPreviewRow,
    setShowPreview,
    setGroupBy,
    updateSignupMeta,
  };
}
