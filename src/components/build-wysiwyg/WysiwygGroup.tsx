'use client';

import { Plus } from 'lucide-react';
import { Editable } from './Editable';
import { EnumPicker } from './EnumPicker';
import { WysiwygSlot } from './WysiwygSlot';
import { prettyHeader, emptyHeaderCopy } from './prettyHeader';
import { FIELD_VALUE_INPUTS } from '../build-shared/fieldTypes';
import type { UseReorderableResult } from '../build-shared/useReorderable';
import type { BuildField, BuildRow } from '../build-shared/useBuildState';

export type SlotGroup = {
  /** Stable key — group field value, or `'__empty__'` for the no-value bucket. */
  key: string;
  /** Raw group-field value at the time of partitioning ('' for empty bucket). */
  rawValue: string;
  rows: BuildRow[];
};

type WysiwygGroupProps = {
  group: SlotGroup;
  groupField: BuildField | null;
  /**
   * All non-group fields in organizer-chosen order. The first becomes the
   * collapsed row's primary anchor; the rest form the summary.
   */
  displayFields: BuildField[];
  fields: BuildField[];
  /** Spots taken per slot id; a slot with none is absent. */
  takenBySlot: Record<string, number>;
  /** Whether the signup sends reminders, and so emails about a moved slot. */
  remindersOn: boolean;
  expandedRowId: string | null;
  /** The row whose editor takes focus when it opens: a copy just made by Duplicate. */
  focusRowId?: string | null;
  /** Called once that row's editor has taken focus. */
  onRowFocused?: () => void;
  onExpandRow: (rowId: string | null) => void;
  onEditCell: (rowId: string, fieldRef: string, value: string) => void;
  onSetCapacity: (rowId: string, capacity: number | null) => void;
  /** Threaded through to EnumPicker; may return a promise the picker awaits. */
  onAddEnumOption: (fieldId: string, value: string) => void | Promise<void>;
  onDuplicateRow: (rowId: string) => void;
  onDeleteRow: (rowId: string) => void;
  onAddSlot: (groupKey: string) => void;
  onRenameGroup: (oldKey: string, newKey: string) => void;
  /** The last change to this header didn't save, and it is back to its saved value. */
  renameFailed?: boolean;
  /** Shared drag-reorder bindings for slot rows. */
  reorder?: UseReorderableResult;
};

export function WysiwygGroup({
  group,
  groupField,
  displayFields,
  fields,
  takenBySlot,
  remindersOn,
  expandedRowId,
  focusRowId = null,
  onRowFocused,
  onExpandRow,
  onEditCell,
  onSetCapacity,
  onAddEnumOption,
  onDuplicateRow,
  onDeleteRow,
  onAddSlot,
  onRenameGroup,
  renameFailed = false,
  reorder,
}: WysiwygGroupProps) {
  const showHeader = groupField !== null;
  const display = groupField
    ? prettyHeader(group.rawValue, groupField.config.fieldType, groupField.name)
    : '';
  const placeholder = groupField
    ? emptyHeaderCopy(groupField.config.fieldType, groupField.name)
    : '';

  return (
    <div>
      {showHeader && groupField && (
        <div className="mb-2 -ml-1.5">
          <GroupHeader
            group={group}
            groupField={groupField}
            display={display}
            placeholder={placeholder}
            onRenameGroup={onRenameGroup}
            onAddEnumOption={onAddEnumOption}
          />
          {renameFailed && (
            <p role="alert" className="mt-1 ml-1.5 text-[11px] text-danger">
              That change didn&rsquo;t save, so this heading is back to what it was. Try again.
            </p>
          )}
        </div>
      )}
      {/* No overflow-hidden: it cut off a List field's menu at the group's
          bottom edge, hiding "Add to list". The rows and the button below round
          their own corners instead, at 11px: rounded-xl less the 1px border. */}
      <div className="flex flex-col gap-0 rounded-xl border border-surface-sunk bg-white">
        {group.rows.map((row) => (
          <WysiwygSlot
            key={row.id}
            row={row}
            taken={takenBySlot[row.id] ?? 0}
            remindersOn={remindersOn}
            fields={fields}
            displayFields={displayFields}
            expanded={expandedRowId === row.id}
            focusOnOpen={focusRowId === row.id}
            {...(onRowFocused ? { onFocused: onRowFocused } : {})}
            onExpand={() => onExpandRow(row.id)}
            onCollapse={() => onExpandRow(null)}
            onEditCell={(ref, v) => onEditCell(row.id, ref, v)}
            onSetCapacity={(c) => onSetCapacity(row.id, c)}
            onAddEnumOption={onAddEnumOption}
            onDuplicate={() => onDuplicateRow(row.id)}
            onDelete={() => onDeleteRow(row.id)}
            {...(reorder ? { reorder } : {})}
          />
        ))}
        <button
          type="button"
          onClick={() => onAddSlot(group.key)}
          className={
            'inline-flex w-full items-center gap-1.5 rounded-b-[11px] first:rounded-t-[11px] px-3.5 py-2.5 text-left text-xs font-medium text-ink-muted ' +
            'transition-colors duration-180 hover:bg-brand-soft hover:text-brand ' +
            (group.rows.length > 0 ? 'border-t border-dashed border-surface-sunk' : '')
          }
        >
          <Plus size={12} />
          Add a slot
        </button>
      </div>
    </div>
  );
}

const HEADER_CLASSES =
  'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-soft';

type GroupHeaderProps = Pick<WysiwygGroupProps, 'group' | 'onRenameGroup' | 'onAddEnumOption'> & {
  groupField: BuildField;
  display: string;
  placeholder: string;
};

/**
 * A group's header, edited with the same control as the slot editor's cell for
 * that field, so it can only be set to a value the server takes: a date picker
 * for a Date field, the list's choices for a List field, free text otherwise.
 */
function GroupHeader({
  group,
  groupField,
  display,
  placeholder,
  onRenameGroup,
  onAddEnumOption,
}: GroupHeaderProps) {
  const ariaLabel = `Group header \u2014 ${display}`;
  const rename = (next: string) => onRenameGroup(group.key, next);

  if (groupField.config.fieldType === 'enum') {
    return (
      <EnumPicker
        triggerClassName={`${HEADER_CLASSES} inline-flex items-center gap-1 hover:bg-brand-soft focus:bg-brand-soft focus:outline-none`}
        value={group.rawValue}
        options={groupField.config.choices}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        onChange={(next) => {
          if (next !== group.rawValue) rename(next);
        }}
        onAddOption={(v) => onAddEnumOption(groupField.id, v)}
      />
    );
  }

  const isDate = groupField.config.fieldType === 'date';
  return (
    <Editable
      value={group.rawValue}
      display={display}
      // A date input reports '' until a whole date is typed, so an empty
      // commit is a half-typed date, not a request to clear the header.
      onChange={(next) => {
        if (isDate && next === '') return;
        rename(next);
      }}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      className={`${HEADER_CLASSES} inline-block`}
      {...(isDate ? { input: FIELD_VALUE_INPUTS.date } : {})}
      {...(groupField.config.fieldType === 'text' ? { maxLength: groupField.config.maxLength } : {})}
    />
  );
}
