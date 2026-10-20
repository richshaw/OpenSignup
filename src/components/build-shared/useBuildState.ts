import { useReducer, useRef, useEffect } from 'react';
import { toFieldRef } from '@/schemas/slot-fields';
import type { SlotFieldDefinition, SlotFieldConfig } from '@/schemas/slot-fields';
import type { SignupSettings } from '@/schemas/signups';
import type { ErrorCode } from '@/lib/errors';
import { resolveAnchorRef } from '@/lib/reminder-fields';

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

export type BuildField = {
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
};

export type BuildRow = {
  id: string;
  capacity: number | null;
  sortOrder: number;
  values: Record<string, string>; // fieldRef → string value
};

/** A slot as the build page loads it and the slot routes return it. */
export type BuildSlot = {
  id: string;
  capacity: number | null;
  sortOrder: number;
  values: Record<string, unknown>;
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

type SaveError = { code: ErrorCode; message?: string };

const SAVING: SaveStatus = { kind: 'saving' };
const SAVED: SaveStatus = { kind: 'saved' };
const IDLE: SaveStatus = { kind: 'idle' };

/** Best-effort parse of `{ error: { code, message } }` from a non-OK Response. */
async function parseErrorEnvelope(res: Response): Promise<SaveError> {
  try {
    const body = (await res.clone().json()) as { error?: { code?: ErrorCode; message?: string } };
    const code = body.error?.code ?? 'internal';
    const message = body.error?.message;
    return message !== undefined ? { code, message } : { code };
  } catch {
    return { code: 'internal' };
  }
}

export type BuildState = {
  title: string;
  description: string;
  fields: BuildField[];
  rows: BuildRow[];
  groupByFieldRef: string | null;
  /**
   * The date field reminders are sent the day before, or null when reminders
   * are off for this signup. Derived from settings — `sendReminders` is the
   * only off switch, and `reminderFromFieldRef` (the slot-instant anchor) stays
   * put even while they are off — so the UI has one value to read.
   */
  reminderFieldRef: string | null;
  saveStatus: SaveStatus;
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type BuildAction =
  | { type: 'SET_FIELDS'; fields: BuildField[] }
  | { type: 'SET_ROWS'; rows: BuildRow[] }
  | { type: 'SET_GROUP_BY'; ref: string | null }
  | { type: 'SET_REMINDER_FIELD'; ref: string | null }
  | { type: 'SET_SAVE_STATUS'; status: SaveStatus }
  | { type: 'OPTIMISTIC_ADD_ROW'; row: BuildRow }
  | { type: 'OPTIMISTIC_REMOVE_ROW'; rowId: string }
  | { type: 'OPTIMISTIC_EDIT_CELL'; rowId: string; fieldRef: string; value: string }
  | { type: 'OPTIMISTIC_SET_CAPACITY'; rowId: string; capacity: number | null }
  | { type: 'OPTIMISTIC_UPDATE_META'; patch: { title?: string; description?: string } }
  | { type: 'APPEND_FIELD'; field: BuildField }
  | { type: 'REPLACE_FIELD'; field: BuildField }
  | { type: 'DELETE_FIELD'; fieldId: string; fieldRef: string };

// ---------------------------------------------------------------------------
// Reducer (exported for testing)
// ---------------------------------------------------------------------------

export function buildReducer(state: BuildState, action: BuildAction): BuildState {
  switch (action.type) {
    case 'SET_FIELDS':
      return { ...state, fields: action.fields };

    case 'SET_ROWS':
      return { ...state, rows: action.rows };

    case 'SET_GROUP_BY':
      return { ...state, groupByFieldRef: action.ref };

    case 'SET_REMINDER_FIELD':
      return { ...state, reminderFieldRef: action.ref };

    case 'SET_SAVE_STATUS':
      return { ...state, saveStatus: action.status };

    case 'OPTIMISTIC_ADD_ROW':
      return { ...state, rows: [...state.rows, action.row] };

    case 'OPTIMISTIC_REMOVE_ROW':
      return { ...state, rows: state.rows.filter((r) => r.id !== action.rowId) };

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
// The reorder route refuses a list that isn't every slot exactly once, which from
// the builder means another window changed the slots. Its own message is for API callers.
const STALE_REORDER_MESSAGE = "The slots changed in another window, so your move wasn't saved. Drag it again.";
const TITLE_TOO_SHORT: SaveError = { code: 'invalid_input', message: 'Title must be at least 2 characters.' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toBuildFields(fields: SlotFieldDefinition[]): BuildField[] {
  return fields.map((f) => ({
    id: f.id,
    ref: f.ref,
    name: f.label,
    config: f.config,
    sortOrder: f.sortOrder,
  }));
}

function toBuildRow(slot: BuildSlot): BuildRow {
  return {
    id: slot.id,
    capacity: slot.capacity,
    sortOrder: slot.sortOrder,
    values: toStringValues(slot.values),
  };
}

function toStringValues(values: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    result[k] = v === null || v === undefined ? '' : String(v);
  }
  return result;
}

/**
 * `list` with the item at `fromIdx` moved to `toIdx` (clamped to the list) and
 * every `sortOrder` renumbered from 0, or null when nothing would move.
 */
function moveItem<T extends { sortOrder: number }>(list: T[], fromIdx: number, toIdx: number): T[] | null {
  if (fromIdx < 0 || fromIdx >= list.length) return null;
  const clamped = Math.max(0, Math.min(list.length - 1, toIdx));
  if (clamped === fromIdx) return null;
  const reordered = list.slice();
  const [moved] = reordered.splice(fromIdx, 1);
  if (!moved) return null;
  reordered.splice(clamped, 0, moved);
  return reordered.map((item, i) => ({ ...item, sortOrder: i }));
}

/** The field reminders are sent for, or null when they are switched off. */
function reminderFieldFrom(settings: SignupSettings): string | null {
  return settings.sendReminders && settings.reminderFromFieldRef
    ? settings.reminderFromFieldRef
    : null;
}

/**
 * The settings a `PATCH /api/signups/[id]` saved, from its `{ data: signup }`
 * body. The server merges what was sent over the stored settings, so these
 * carry any change made in another tab or by an AI assistant since the page
 * opened. Null when the body has none to read.
 */
async function savedSettings(res: Response): Promise<SignupSettings | null> {
  try {
    const body = (await res.json()) as { data?: { settings?: unknown } };
    const settings = body.data?.settings;
    return settings !== null &&
      typeof settings === 'object' &&
      Array.isArray((settings as { groupByFieldRefs?: unknown }).groupByFieldRefs)
      ? (settings as SignupSettings)
      : null;
  } catch {
    return null;
  }
}

/**
 * Sends a request, JSON-encoding `body` when there is one. A non-OK answer
 * throws the server's `{ code, message }`, which `withSave` shows on the rail.
 */
async function send(method: string, url: string, body?: unknown): Promise<Response> {
  const res = await fetch(
    url,
    body === undefined
      ? { method }
      : { method, headers: JSON_HEADERS, body: JSON.stringify(body) },
  );
  if (!res.ok) throw await parseErrorEnvelope(res);
  return res;
}

/** The `data` of a successful request's `{ data }` body. */
async function sendForData<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await send(method, url, body);
  return ((await res.json()) as { data: T }).data;
}

function asErr(e: unknown): SaveError {
  if (e && typeof e === 'object' && 'code' in e) {
    const obj = e as SaveError;
    return obj.message !== undefined ? { code: obj.code, message: obj.message } : { code: obj.code };
  }
  return { code: 'internal' };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBuildState(
  signupId: string,
  initialFields: SlotFieldDefinition[],
  initialSlots: BuildSlot[],
  initialSettings: SignupSettings,
  initialMeta: { title: string; description: string | null } = { title: '', description: '' },
) {
  const [state, dispatch] = useReducer(buildReducer, undefined, () => ({
    title: initialMeta.title,
    description: initialMeta.description ?? '',
    fields: toBuildFields(initialFields),
    rows: initialSlots.map(toBuildRow),
    groupByFieldRef: initialSettings.groupByFieldRefs[0] ?? null,
    reminderFieldRef: reminderFieldFrom(initialSettings),
    saveStatus: IDLE,
  }));

  // Per-slot debounce entries: key = `${rowId}:${fieldRef}` or `${rowId}:capacity`
  type DebounceEntry = { timeoutId: ReturnType<typeof setTimeout>; saveFn: () => Promise<void> };
  const timersRef = useRef<Map<string, DebounceEntry>>(new Map());
  const stateRef = useRef(state);
  stateRef.current = state;
  // This tab's view of the settings, which the group-by and reminder controls
  // are derived from. It falls behind when another tab or an AI assistant
  // changes a setting, so it is never sent back whole, which would undo that
  // change (#314): saves send only the keys they change, the server merges
  // them, and the settings it returns replace this copy.
  const settingsRef = useRef<SignupSettings>(initialSettings);
  // The last settings save queued, which the next one waits for (see
  // saveSettings). Each save settles whether it failed or not, so one failure
  // never holds up the saves behind it.
  const settingsSaveRef = useRef<Promise<void>>(Promise.resolve());
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current !== null) clearTimeout(savedTimerRef.current);
    };
  }, []);

  /**
   * Mirrors what the field services do to settings on a field change: the
   * reminder anchor moves to the first date field once its own is gone (or
   * appears with the first date field), and a deleted field leaves the
   * group-by. Same pure rule as the server (src/lib/reminder-fields.ts), so
   * the copy here moves the way the server's did. A field response carries no
   * settings, though, so a change made elsewhere since the last settings save
   * is not picked up here. Without it the controls would go on showing a
   * group-by or reminder field the server has already dropped or moved.
   */
  function mirrorFieldChange(fields: BuildField[]) {
    const current = settingsRef.current;
    const anchor = resolveAnchorRef(
      current,
      fields.map((f) => ({ ref: f.ref, fieldType: f.config.fieldType, sortOrder: f.sortOrder })),
    );
    const groupBy = current.groupByFieldRefs.filter((ref) => fields.some((f) => f.ref === ref));
    const { reminderFromFieldRef: _stale, ...rest } = current;
    settingsRef.current =
      anchor === null
        ? { ...rest, groupByFieldRefs: groupBy }
        : { ...rest, groupByFieldRefs: groupBy, reminderFromFieldRef: anchor };
    const groupRef = groupBy[0] ?? null;
    if (groupRef !== stateRef.current.groupByFieldRef) {
      dispatch({ type: 'SET_GROUP_BY', ref: groupRef });
    }
    const reminderRef = reminderFieldFrom(settingsRef.current);
    if (reminderRef !== stateRef.current.reminderFieldRef) {
      dispatch({ type: 'SET_REMINDER_FIELD', ref: reminderRef });
    }
  }

  /**
   * Makes `next`, the settings a save returned, this tab's settings, and
   * points the group-by and reminder controls at them.
   */
  function showSettings(next: SignupSettings) {
    settingsRef.current = next;
    dispatch({ type: 'SET_GROUP_BY', ref: next.groupByFieldRefs[0] ?? null });
    dispatch({ type: 'SET_REMINDER_FIELD', ref: reminderFieldFrom(next) });
  }

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

  function markError(err: SaveError = { code: 'internal' }) {
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

  /** Shows "Saving…" while `save` runs, then "Saved" or the error it threw. */
  async function withSave(save: () => Promise<void>): Promise<void> {
    markSaving();
    try {
      await save();
      markSaved();
    } catch (e) {
      markError(asErr(e));
    }
  }

  /**
   * Shows `next` straight away and runs `save`. A failed save may have left
   * the server with part of the move or none of it, so the list then shows
   * what `reload` fetches, or `previous` when that fails too.
   */
  async function saveMove<T>(
    previous: T[],
    next: T[],
    show: (items: T[]) => void,
    save: () => Promise<void>,
    reload: () => Promise<T[]>,
  ): Promise<void> {
    show(next);
    markSaving();
    try {
      await save();
      markSaved();
      return;
    } catch (e) {
      const failure = asErr(e);
      try {
        show(await reload());
      } catch {
        show(previous);
      }
      markError(failure);
    }
  }

  // ---------------------------------------------------------------------------
  // Field mutations
  // ---------------------------------------------------------------------------

  const fieldsUrl = `/api/signups/${signupId}/fields`;
  const showFields = (fields: BuildField[]) => dispatch({ type: 'SET_FIELDS', fields });

  const addField = (name: string, config: SlotFieldConfig): Promise<void> =>
    withSave(async () => {
      const created = await sendForData<SlotFieldDefinition>('POST', fieldsUrl, {
        ref: toFieldRef(name, stateRef.current.fields.map((f) => f.ref)),
        label: name,
        fieldType: config.fieldType,
        config,
      });
      const field = toBuildFields([created])[0]!;
      dispatch({ type: 'APPEND_FIELD', field });
      mirrorFieldChange([...stateRef.current.fields, field]);
    });

  const updateField = (
    fieldId: string,
    patch: { name?: string; config?: SlotFieldConfig },
  ): Promise<void> =>
    withSave(async () => {
      const body: Record<string, unknown> = {};
      if (patch.name !== undefined) body['label'] = patch.name;
      if (patch.config !== undefined) {
        body['fieldType'] = patch.config.fieldType;
        body['config'] = patch.config;
      }
      const saved = await sendForData<SlotFieldDefinition>('PATCH', `${fieldsUrl}/${fieldId}`, body);
      const updated = toBuildFields([saved])[0]!;
      dispatch({ type: 'REPLACE_FIELD', field: updated });
      mirrorFieldChange(stateRef.current.fields.map((f) => (f.id === updated.id ? updated : f)));
    });

  const deleteField = async (fieldId: string): Promise<void> => {
    const field = stateRef.current.fields.find((f) => f.id === fieldId);
    if (!field) return;
    await withSave(async () => {
      await send('DELETE', `${fieldsUrl}/${fieldId}`);
      dispatch({ type: 'DELETE_FIELD', fieldId, fieldRef: field.ref });
      mirrorFieldChange(stateRef.current.fields.filter((f) => f.id !== fieldId));
    });
  };

  // Fields have no bulk-reorder route, so this PATCHes each field whose
  // position changed. A failure part-way can leave the server with some of
  // them moved; the refetch then shows the order it holds.
  const moveField = async (fieldId: string, toIdx: number): Promise<void> => {
    const previous = stateRef.current.fields;
    const next = moveItem(previous, previous.findIndex((f) => f.id === fieldId), toIdx);
    if (!next) return;
    await saveMove(
      previous,
      next,
      showFields,
      async () => {
        const changed = next.filter(
          (f, i) => previous[i]?.id !== f.id || previous[i]?.sortOrder !== f.sortOrder,
        );
        for (const f of changed) {
          await send('PATCH', `${fieldsUrl}/${f.id}`, { sortOrder: f.sortOrder });
        }
      },
      async () => toBuildFields(await sendForData<SlotFieldDefinition[]>('GET', fieldsUrl)),
    );
  };

  // ---------------------------------------------------------------------------
  // Row mutations
  // ---------------------------------------------------------------------------

  const slotsUrl = `/api/signups/${signupId}/slots`;

  const addRow = (seed?: { values?: Record<string, unknown>; capacity?: number }): Promise<void> =>
    withSave(async () => {
      const slot = await sendForData<BuildSlot>('POST', slotsUrl, {
        values: seed?.values ?? {},
        capacity: seed?.capacity ?? 1,
      });
      dispatch({ type: 'OPTIMISTIC_ADD_ROW', row: toBuildRow(slot) });
    });

  const duplicateRow = async (rowId: string): Promise<void> => {
    const source = stateRef.current.rows.find((r) => r.id === rowId);
    if (!source) return;
    // Clone values verbatim (already string-typed; addRow re-serializes for
    // the API). Capacity falls back to 1 when the source was uncapped — the
    // grid uses null to mean "no limit", but new slots ship with capacity 1
    // to stay safe and consistent with the bare addRow contract.
    await addRow({ values: { ...source.values }, capacity: source.capacity ?? 1 });
  };

  const deleteRow = (rowId: string): Promise<void> =>
    withSave(async () => {
      await send('DELETE', `/api/slots/${rowId}`);
      dispatch({ type: 'OPTIMISTIC_REMOVE_ROW', rowId });
    });

  /**
   * Moves the row at `fromIdx` to `toIdx` and, for a drop into another group,
   * gives it that group's value for `group.fieldRef`, as one change (#483).
   * The order goes in one request, which the server applies in one
   * transaction or not at all; if another tab or an AI assistant added or
   * removed a slot meanwhile, it is refused as stale, the refetch shows the
   * slots as they are, and the organizer can drag again. A group value is
   * saved before the order, so a refused order still leaves the row in the
   * group it was dropped into.
   */
  const moveRow = async (
    fromIdx: number,
    toIdx: number,
    group?: { fieldRef: string; value: string },
  ): Promise<void> => {
    const previous = stateRef.current.rows;
    const row = previous[fromIdx];
    if (!row) return;
    const moved = group ? { ...row, values: { ...row.values, [group.fieldRef]: group.value } } : row;
    const edited = previous.map((r) => (r === row ? moved : r));
    const reordered = moveItem(edited, fromIdx, toIdx);
    if (!group && !reordered) return;
    await saveMove(
      previous,
      reordered ?? edited,
      (rows) => dispatch({ type: 'SET_ROWS', rows }),
      async () => {
        if (group) await saveRowValues(moved);
        if (!reordered) return;
        try {
          await send('PUT', `${slotsUrl}/order`, { slotIds: reordered.map((r) => r.id) });
        } catch (e) {
          const err = asErr(e);
          throw err.code === 'invalid_input' ? { code: 'invalid_input', message: STALE_REORDER_MESSAGE } : err;
        }
      },
      async () => (await sendForData<BuildSlot[]>('GET', slotsUrl)).map(toBuildRow),
    );
  };

  // ---------------------------------------------------------------------------
  // Cell / capacity debounced saves
  // ---------------------------------------------------------------------------

  /** PATCHes every value `row` holds, so the slot ends up as the row shows it. */
  async function saveRowValues(row: BuildRow): Promise<void> {
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
    await send('PATCH', `/api/slots/${row.id}`, { values: typedValues });
  }

  function flushTimer(key: string, saveFn: () => Promise<void>) {
    const timers = timersRef.current;
    const existing = timers.get(key);
    if (existing !== undefined) clearTimeout(existing.timeoutId);
    const timeoutId = setTimeout(() => {
      timers.delete(key);
      void saveFn();
    }, DEBOUNCE_MS);
    timers.set(key, { timeoutId, saveFn });
  }

  const editCell = (rowId: string, fieldRef: string, value: string): void => {
    dispatch({ type: 'OPTIMISTIC_EDIT_CELL', rowId, fieldRef, value });
    flushTimer(`${rowId}:${fieldRef}`, async () => {
      const row = stateRef.current.rows.find((r) => r.id === rowId);
      if (!row) return;
      await withSave(() => saveRowValues(row));
    });
  };

  /**
   * Sets `fieldRef` to `value` on every row in `rowIds` (a group header's
   * rows) and saves each one now, not after the cell debounce: a header only
   * calls this once the organizer has finished choosing. A row the server
   * refuses goes back to the value it had. Resolves to whether every row saved.
   */
  const renameGroup = async (fieldRef: string, rowIds: string[], value: string): Promise<boolean> => {
    const rows = stateRef.current.rows.filter((r) => rowIds.includes(r.id));
    for (const r of rows) dispatch({ type: 'OPTIMISTIC_EDIT_CELL', rowId: r.id, fieldRef, value });
    markSaving();
    const results = await Promise.allSettled(
      rows.map((r) => saveRowValues({ ...r, values: { ...r.values, [fieldRef]: value } })),
    );
    let failure: SaveError | null = null;
    for (const [i, result] of results.entries()) {
      const row = rows[i];
      if (result.status === 'fulfilled' || !row) continue;
      failure ??= asErr(result.reason);
      dispatch({ type: 'OPTIMISTIC_EDIT_CELL', rowId: row.id, fieldRef, value: row.values[fieldRef] ?? '' });
    }
    if (failure) {
      markError(failure);
      return false;
    }
    markSaved();
    return true;
  };

  const setCapacity = (rowId: string, capacity: number | null): void => {
    dispatch({ type: 'OPTIMISTIC_SET_CAPACITY', rowId, capacity });
    flushTimer(`${rowId}:capacity`, () =>
      withSave(async () => {
        await send('PATCH', `/api/slots/${rowId}`, { capacity });
      }),
    );
  };

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
  // Signup title, description and settings
  // ---------------------------------------------------------------------------

  const touchedMetaRef = useRef<Set<'title' | 'description'>>(new Set());
  // Last server-accepted meta values. Used to revert the optimistic state when
  // a user edit would fail server validation (e.g. clearing the title), so the
  // input doesn't strand on an invalid value the server never accepted.
  const lastCommittedMetaRef = useRef<{ title: string; description: string }>({
    title: initialMeta.title,
    description: initialMeta.description ?? '',
  });

  const updateSignupMeta = (patch: { title?: string; description?: string }): void => {
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
        if (titleTooShort) markError(TITLE_TOO_SHORT);
        return;
      }
      await withSave(async () => {
        await send('PATCH', `/api/signups/${signupId}`, body);
        if (body['title'] !== undefined) lastCommittedMetaRef.current.title = body['title'];
        if (body['description'] !== undefined) lastCommittedMetaRef.current.description = body['description'];
        // Description saved but title was rejected client-side — surface
        // the validation message anyway so the user gets the feedback.
        if (titleTooShort) throw TITLE_TOO_SHORT;
      });
    });
  };

  /**
   * PATCHes `changed`, only the settings a control changed, and shows the
   * settings the server returns. Saves run one at a time, in the order they
   * were made: each response replaces both the group-by and the reminder
   * control, so with two in flight a slow earlier one could land last and put
   * its older snapshot back, and the server could apply them in either order.
   */
  const saveSettings = (changed: Partial<SignupSettings>): Promise<void> => {
    markSaving();
    // withSave marks the rail saving again: the save this one waited for may
    // have marked it saved already.
    const save = settingsSaveRef.current.then(() =>
      withSave(async () => {
        const res = await send('PATCH', `/api/signups/${signupId}`, { settings: changed });
        const next = (await savedSettings(res)) ?? { ...settingsRef.current, ...changed };
        await catchUpOnFields(next);
        showSettings(next);
      }),
    );
    settingsSaveRef.current = save;
    return save;
  };

  /**
   * Fetches the field list when `next` names a field this tab hasn't loaded,
   * which happens when another tab or an AI assistant added a field and
   * pointed a setting at it (#398). Without it no field would show the
   * reminder bell and every date field's reminder box would be blocked by a
   * field the tab can't name. The save itself has already succeeded, so a
   * failed fetch leaves the list as it was rather than reporting an error.
   */
  async function catchUpOnFields(next: SignupSettings): Promise<void> {
    const named = [...next.groupByFieldRefs, ...(next.reminderFromFieldRef ? [next.reminderFromFieldRef] : [])];
    const loaded = new Set(stateRef.current.fields.map((f) => f.ref));
    if (named.every((ref) => loaded.has(ref))) return;
    try {
      showFields(toBuildFields(await sendForData<SlotFieldDefinition[]>('GET', fieldsUrl)));
    } catch {
      // Keep the list the tab has; a reload catches it up.
    }
  }

  const setGroupBy = (ref: string | null): Promise<void> =>
    saveSettings({ groupByFieldRefs: ref ? [ref] : [] });

  /**
   * Makes `ref` the reminder field, or switches reminders off with null.
   * Off sends only the switch, so the server keeps the current
   * `reminderFromFieldRef`: it still anchors every slot's instant (calendar
   * links, date order), only the switch flips.
   */
  const setReminderField = (ref: string | null): Promise<void> =>
    saveSettings(ref ? { sendReminders: true, reminderFromFieldRef: ref } : { sendReminders: false });

  return {
    state,
    addField,
    updateField,
    deleteField,
    moveField,
    addRow,
    duplicateRow,
    deleteRow,
    moveRow,
    editCell,
    renameGroup,
    setCapacity,
    setGroupBy,
    setReminderField,
    updateSignupMeta,
  };
}
