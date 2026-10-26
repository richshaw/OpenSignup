'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Plus } from 'lucide-react';
import { useRegisterBuildTab } from '@/components/signup/BuildBridge';
import { useBuildState, type BuildField, type BuildRow, type BuildSlot } from '../build-shared/useBuildState';
import { useReorderable } from '../build-shared/useReorderable';
import { Editable } from './Editable';
import { EditingRail } from './EditingRail';
import { FieldsPopover } from './FieldsPopover';
import { WysiwygGroup, type SlotGroup } from './WysiwygGroup';
import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import type { SignupSettings, SignupStatus } from '@/schemas/signups';

/** Server-loaded chrome snapshot. Title + description are then edited in-place via updateSignupMeta. */
type SignupMeta = {
  title: string;
  description: string | null;
};

type BuildWysiwygProps = {
  signupId: string;
  signupMeta: SignupMeta;
  initialFields: SlotFieldDefinition[];
  initialSlots: BuildSlot[];
  initialSettings: SignupSettings;
  /**
   * The signup's status, which a slot still saying "TBD" is marked by. It
   * follows Publish, which renders the page again.
   */
  status: SignupStatus;
  /**
   * Spots taken per slot id when the page loaded; a slot with none is absent.
   * Slots added in this session start empty, so they read 0 without an entry.
   */
  committedBySlot: Record<string, number>;
};

const EMPTY_GROUP_KEY = '__empty__';

/**
 * Maximum sheet width grows with field count above the `md` breakpoint —
 * keeps small schemas tight, wide ones legible. Below `md` the sheet goes
 * full-bleed so cramped phone screens don't waste margins.
 */
function sheetMaxWidthClass(fieldCount: number): string {
  if (fieldCount <= 3) return 'md:max-w-[580px]';
  if (fieldCount === 4) return 'md:max-w-[720px]';
  return 'md:max-w-[960px]';
}

/** Bucket rows by the group field's value. Empty / missing values go into `__empty__`. */
function partitionRows(rows: BuildRow[], groupField: BuildField | null): SlotGroup[] {
  if (!groupField) {
    return [{ key: '__flat__', rawValue: '', rows }];
  }
  const ref = groupField.ref;
  const buckets = new Map<string, BuildRow[]>();
  for (const r of rows) {
    const raw = r.values[ref] ?? '';
    const key = raw === '' ? EMPTY_GROUP_KEY : raw;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
    }
    bucket.push(r);
  }
  const keys = [...buckets.keys()].sort((a, b) => {
    if (a === EMPTY_GROUP_KEY) return 1;
    if (b === EMPTY_GROUP_KEY) return -1;
    return a.localeCompare(b);
  });
  return keys.map((k) => ({
    key: k,
    rawValue: k === EMPTY_GROUP_KEY ? '' : k,
    rows: buckets.get(k) ?? [],
  }));
}

export function BuildWysiwyg({
  signupId,
  signupMeta,
  initialFields,
  initialSlots,
  initialSettings,
  status,
  committedBySlot,
}: BuildWysiwygProps) {
  const {
    state,
    updateSignupMeta,
    addField,
    updateField,
    deleteField,
    moveField,
    setGroupBy,
    setReminderField,
    addRow,
    duplicateRow,
    deleteRow,
    editCell,
    renameGroup,
    setCapacity,
    moveRow,
    flushPendingSaves,
  } = useBuildState(
    signupId,
    initialFields,
    initialSlots,
    initialSettings,
    { title: signupMeta.title, description: signupMeta.description },
  );

  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  // The slot whose editor gets focus once it's open, and in which field.
  const [focusRequest, setFocusRequest] = useState<{
    rowId: string;
    fieldRef: string | null;
  } | null>(null);
  // The slot Publish's check opened, until any other editor opens or this
  // one closes: Done on it, or Enter, hands focus back to Publish and share.
  const fixRow = useRef<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  // A copy just made by Duplicate, whose editor takes focus when it opens.
  // Cleared once it has: in a signup grouped by date, changing the copy's
  // date remounts its editor in the new group, which must not take focus again.
  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  const clearFocusRow = useCallback(() => setFocusRowId(null), []);
  // Opens a slot's editor, or with null closes the one open, as the
  // organizer's own choice: a fix's slot is a fix's no longer.
  const expandRow = (rowId: string | null) => {
    fixRow.current = null;
    setFocusRowId(null);
    setExpandedRowId(rowId);
  };
  // The group whose header change the server refused; its rows are back
  // under their saved value, so this is that value's key.
  const [failedRenameKey, setFailedRenameKey] = useState<string | null>(null);

  const groupField = state.groupByFieldRef
    ? state.fields.find((f) => f.ref === state.groupByFieldRef) ?? null
    : null;
  // Non-group fields in organizer order. WysiwygSlot treats index 0 as the
  // collapsed row's anchor — order matters, no type-based promotion here.
  const displayFields = state.fields.filter((f) => f.ref !== groupField?.ref);

  const groups = useMemo(() => partitionRows(state.rows, groupField), [state.rows, groupField]);

  const slotReorder = useReorderable<BuildRow>({
    items: state.rows,
    onReorder: (fromIdx, toIdx) => { void moveRow(fromIdx, toIdx); },
    ...(groupField
      ? {
          getGroupKey: (row) => {
            const v = row.values[groupField.ref] ?? '';
            return v === '' ? EMPTY_GROUP_KEY : v;
          },
          onTransfer: (rowId, toGroupKey, toIdx) => {
            const newGroupValue = toGroupKey === EMPTY_GROUP_KEY ? '' : (toGroupKey ?? '');
            const fromIdx = state.rows.findIndex((r) => r.id === rowId);
            void moveRow(fromIdx, toIdx, { fieldRef: groupField.ref, value: newGroupValue });
          },
        }
      : {}),
  });

  const handleAddSlot = (groupKey: string) => {
    const seedValues: Record<string, string> = {};
    if (groupField && groupKey !== EMPTY_GROUP_KEY && groupKey !== '__flat__') {
      seedValues[groupField.ref] = groupKey;
    }
    void addRow({ values: seedValues });
  };

  const handleAddDate = () => {
    // Add date is only rendered for date-typed group fields; empty seed lands
    // the new row in the "Set a date" bucket the user can rename inline.
    void addRow({ values: {} });
  };

  const showSlot = (rowId: string, fieldRef: string | null) => {
    expandRow(rowId);
    fixRow.current = rowId;
    setFocusRequest({ rowId, fieldRef });
  };

  /**
   * Opens a slot's editor (a new slot when `slotId` is null), focus in
   * `fieldRef`, and says whether it could: a slot added elsewhere since the
   * page loaded isn't here to open.
   */
  const openSlot = (slotId: string | null, fieldRef: string | null): boolean => {
    if (slotId === null) {
      void addRow().then((id) => {
        if (id) showSlot(id, null);
      });
      return true;
    }
    if (!state.rows.some((r) => r.id === slotId)) return false;
    showSlot(slotId, fieldRef);
    return true;
  };

  // The header's Publish saves what's pending here first, and a check's fix
  // opens the slot it's about, here or once this tab has loaded.
  const handBack = useRegisterBuildTab({ flushPendingSaves, openSlot });

  // What a row asks for: its own editor, or null when Done closes it, the
  // one that's open. When that's the slot the check opened, Publish and share
  // takes the focus, without waiting for the slot's last edits to save:
  // Publish sends them first. Deleting the slot, or Duplicate opening its
  // copy, closes it some other way and hands nothing back.
  const rowAsks = (rowId: string | null) => {
    if (rowId === null && fixRow.current === expandedRowId) handBack();
    expandRow(rowId);
  };

  // In the editor the check opened, Enter in a one-line box (text, number,
  // date, time) does what Done does, as the design has it, as long as Publish
  // and share takes the focus: once the signup is published there's none, and
  // the editor stays open rather than drop focus on the page. Not while
  // typing a new list item, whose box takes Enter itself, nor while an input
  // method is composing (Safari ends the composition first, then sends Enter
  // as key 229). An editor opened by hand keeps Enter as it was.
  const enterIsDone = (e: KeyboardEvent<HTMLElement>) => {
    const box = e.target as HTMLInputElement;
    if (
      e.key === 'Enter' &&
      !e.defaultPrevented &&
      !e.nativeEvent.isComposing &&
      e.nativeEvent.keyCode !== 229 &&
      /^(text|number|date|time)$/.test(box.type) &&
      box.closest<HTMLElement>('[data-slot-editor]')?.dataset.slotEditor === fixRow.current &&
      handBack()
    ) {
      e.preventDefault();
      expandRow(null);
    }
  };

  // Focus goes in the field asked for, or the slot's first, once its editor
  // is open; with no fields, in Spots.
  useEffect(() => {
    if (!focusRequest) return;
    const editor = Array.from(
      sheetRef.current?.querySelectorAll<HTMLElement>('[data-slot-editor]') ?? [],
    ).find((el) => el.dataset.slotEditor === focusRequest.rowId);
    if (!editor) return;
    const boxes = Array.from(editor.querySelectorAll<HTMLElement>('[data-field-ref]'));
    const box = boxes.find((b) => b.dataset.fieldRef === focusRequest.fieldRef) ?? boxes[0];
    const control = box
      ? box.querySelector<HTMLElement>('input, button')
      : editor.querySelector<HTMLElement>('input');
    editor.scrollIntoView?.({ block: 'center' });
    control?.focus({ preventScroll: true });
  }, [focusRequest]);

  const handleRenameGroup = (oldKey: string, newKey: string) => {
    if (!groupField) return;
    if (newKey === oldKey) return;
    // Every row in the group takes the new group value.
    const ref = groupField.ref;
    const rowIds = state.rows
      .filter((r) => {
        const raw = r.values[ref] ?? '';
        return oldKey === EMPTY_GROUP_KEY ? raw === '' : raw === oldKey;
      })
      .map((r) => r.id);
    setFailedRenameKey(null);
    void renameGroup(ref, rowIds, newKey).then((saved) => {
      if (!saved) setFailedRenameKey(oldKey);
    });
  };

  return (
    <div
      ref={sheetRef}
      onKeyDown={enterIsDone}
      className="-mt-6 -mb-8 min-h-[calc(100vh-12rem)] bg-surface-raised pt-6 pb-24 md:pt-10 md:pb-32"
    >
      <div
        className={`mx-auto w-full rounded-none border border-surface-sunk border-t-[3px] border-t-brand bg-white shadow-card transition-[max-width] duration-180 ease-emphasized md:rounded-xl ${sheetMaxWidthClass(state.fields.length)}`}
      >
        <EditingRail
          fieldCount={state.fields.length}
          fieldsOpen={fieldsOpen}
          onOpenFields={() => setFieldsOpen((o) => !o)}
          saveStatus={state.saveStatus}
        />

        <div className="px-4 pt-4 pb-5 md:px-7 md:pt-5 md:pb-6">
          <Editable
            value={state.title}
            onChange={(next) => updateSignupMeta({ title: next })}
            placeholder="Untitled signup"
            ariaLabel="Signup title"
            className="block text-[22px] font-bold tracking-[-0.02em] text-ink px-1 py-0.5 -mx-1 -my-0.5"
          />

          <div className="mt-2">
            <Editable
              value={state.description}
              onChange={(next) => updateSignupMeta({ description: next })}
              placeholder="Add a short description for volunteers"
              multiline
              ariaLabel="Signup description"
              className="block text-[13px] leading-snug text-ink-muted px-1 py-0.5 -mx-1 -my-0.5"
            />
          </div>

          <div className="mt-5 flex flex-col gap-4 md:mt-6 md:gap-5">
            {groups.map((g) => (
              <WysiwygGroup
                key={g.key}
                group={g}
                groupField={groupField}
                displayFields={displayFields}
                fields={state.fields}
                takenBySlot={committedBySlot}
                remindersOn={state.reminderFieldRef !== null}
                status={status}
                expandedRowId={expandedRowId}
                focusRowId={focusRowId}
                onRowFocused={clearFocusRow}
                onExpandRow={rowAsks}
                onEditCell={editCell}
                onSetCapacity={(rowId, c) => setCapacity(rowId, c)}
                onAddEnumOption={(fieldId, value) => {
                  const field = state.fields.find((f) => f.id === fieldId);
                  if (!field || field.config.fieldType !== 'enum') return;
                  if (field.config.choices.includes(value)) return;
                  // Return the in-flight promise so the EnumPicker can await
                  // it before committing the cell value — keeps the slot PATCH
                  // from racing the field-config update on slow networks.
                  return updateField(fieldId, {
                    config: { fieldType: 'enum', choices: [...field.config.choices, value] },
                  });
                }}
                onDuplicateRow={(rowId) => {
                  // Open the copy: the next thing changed is usually its date (#557).
                  void duplicateRow(rowId).then((copyId) => {
                    if (copyId === null) return;
                    expandRow(copyId);
                    setFocusRowId(copyId);
                  });
                }}
                onDeleteRow={(rowId) => {
                  if (expandedRowId === rowId) expandRow(null);
                  void deleteRow(rowId);
                }}
                onAddSlot={handleAddSlot}
                onRenameGroup={handleRenameGroup}
                renameFailed={failedRenameKey === g.key}
                reorder={slotReorder}
              />
            ))}
          </div>

          {groupField?.config.fieldType === 'date' && (
            <button
              type="button"
              onClick={handleAddDate}
              className="mt-5 inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-surface-sunk bg-transparent px-3.5 py-1.5 text-xs font-medium text-ink-muted transition-colors duration-180 hover:border-brand hover:bg-brand-soft hover:text-brand"
            >
              <Plus size={12} />
              Add date
            </button>
          )}
        </div>
      </div>

      <FieldsPopover
        open={fieldsOpen}
        onOpenChange={setFieldsOpen}
        fields={state.fields}
        groupByFieldRef={state.groupByFieldRef}
        reminderFieldRef={state.reminderFieldRef}
        onAddField={(name, config) => { void addField(name, config); }}
        onUpdateField={(fieldId, patch) => updateField(fieldId, patch)}
        onDeleteField={(fieldId) => { void deleteField(fieldId); }}
        onMoveField={(fieldId, toIdx) => { void moveField(fieldId, toIdx); }}
        onGroupByChange={(ref) => { void setGroupBy(ref); }}
        onSetReminder={(ref) => { void setReminderField(ref); }}
      />
    </div>
  );
}
