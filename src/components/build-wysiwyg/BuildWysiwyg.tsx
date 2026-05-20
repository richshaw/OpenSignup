'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useGridState, type GridField, type GridRow } from '../build-grid/useGridState';
import { Editable } from './Editable';
import { EditingRail } from './EditingRail';
import { FieldsPopover } from './FieldsPopover';
import { WysiwygGroup, type SlotGroup } from './WysiwygGroup';
import type { SignupMeta } from '../build-grid/BuildGrid';
import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import type { SignupSettings } from '@/schemas/signups';

type BuildWysiwygProps = {
  signupId: string;
  signupMeta: SignupMeta;
  initialFields: SlotFieldDefinition[];
  initialSlots: Array<{
    id: string;
    capacity: number | null;
    sortOrder?: number | null;
    values: Record<string, unknown>;
  }>;
  initialSettings: SignupSettings;
};

const EMPTY_GROUP_KEY = '__empty__';

/** Maximum sheet width grows with field count — keeps small schemas tight, wide ones legible. */
function sheetMaxWidthClass(fieldCount: number): string {
  if (fieldCount <= 3) return 'max-w-[580px]';
  if (fieldCount === 4) return 'max-w-[720px]';
  return 'max-w-[960px]';
}

/** Bucket rows by the group field's value. Empty / missing values go into `__empty__`. */
function partitionRows(rows: GridRow[], groupField: GridField | null): SlotGroup[] {
  if (!groupField) {
    return [{ key: '__flat__', rawValue: '', rows }];
  }
  const ref = groupField.ref;
  const buckets = new Map<string, GridRow[]>();
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
}: BuildWysiwygProps) {
  const {
    state,
    updateSignupMeta,
    addField,
    updateField,
    deleteField,
    moveField,
    setGroupBy,
    addRow,
    editCell,
  } = useGridState(
    signupId,
    initialFields,
    initialSlots.map((s) => ({
      id: s.id,
      capacity: s.capacity,
      sortOrder: s.sortOrder ?? undefined,
      values: s.values,
    })),
    initialSettings,
    { title: signupMeta.title, description: signupMeta.description },
  );

  const [fieldsOpen, setFieldsOpen] = useState(false);
  const publicHref = `/s/${signupMeta.slug}`;

  const groupField = state.groupByFieldRef
    ? state.fields.find((f) => f.ref === state.groupByFieldRef) ?? null
    : null;
  const timeField = state.fields.find((f) => f.type === 'time') ?? null;
  const otherFields = state.fields.filter(
    (f) => f.ref !== groupField?.ref && f.ref !== timeField?.ref,
  );

  const groups = useMemo(() => partitionRows(state.rows, groupField), [state.rows, groupField]);

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

  const handleRenameGroup = (oldKey: string, newKey: string) => {
    if (!groupField) return;
    if (newKey === oldKey) return;
    // Rewrite every row in the group to the new group value. `editCell` is
    // optimistic + debounced, so a burst of rewrites coalesces per row.
    const ref = groupField.ref;
    for (const r of state.rows) {
      const raw = r.values[ref] ?? '';
      const matches =
        oldKey === EMPTY_GROUP_KEY ? raw === '' : raw === oldKey;
      if (matches) editCell(r.id, ref, newKey);
    }
  };

  return (
    <div className="min-h-[calc(100vh-12rem)] bg-surface-raised">
      <div
        className={`mx-auto w-full ${sheetMaxWidthClass(state.fields.length)} my-6 mb-32 rounded-xl border border-surface-sunk border-t-[3px] border-t-brand bg-white shadow-card transition-[max-width] duration-180 ease-emphasized`}
      >
        <EditingRail
          fieldCount={state.fields.length}
          fieldsOpen={fieldsOpen}
          onOpenFields={() => setFieldsOpen((o) => !o)}
          publicHref={publicHref}
          saveStatus={state.saveStatus}
        />

        <div className="px-7 pt-5 pb-6">
          <Editable
            value={state.title}
            onChange={(next) => updateSignupMeta({ title: next })}
            placeholder="Untitled sign-up"
            ariaLabel="Sign-up title"
            className="block text-[22px] font-bold tracking-[-0.02em] text-ink px-1 py-0.5 -mx-1 -my-0.5"
          />

          <div className="mt-2">
            <Editable
              value={state.description}
              onChange={(next) => updateSignupMeta({ description: next })}
              placeholder="Add a short description for volunteers"
              multiline
              ariaLabel="Sign-up description"
              className="block text-[13px] leading-snug text-ink-muted px-1 py-0.5 -mx-1 -my-0.5"
            />
          </div>

          <div className="mt-6 flex flex-col gap-5">
            {groups.map((g) => (
              <WysiwygGroup
                key={g.key}
                group={g}
                groupField={groupField}
                timeField={timeField}
                otherFields={otherFields}
                onAddSlot={handleAddSlot}
                onRenameGroup={handleRenameGroup}
              />
            ))}
          </div>

          {groupField?.type === 'date' && (
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
        onAddField={(type, name, config) => { void addField(type, name, config); }}
        onUpdateField={(fieldId, patch) => { void updateField(fieldId, patch); }}
        onDeleteField={(fieldId) => { void deleteField(fieldId); }}
        onMoveField={(fieldId, toIdx) => { void moveField(fieldId, toIdx); }}
        onGroupByChange={(ref) => { void setGroupBy(ref); }}
      />
    </div>
  );
}
