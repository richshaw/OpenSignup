'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Editable } from './Editable';
import { EnumPicker } from './EnumPicker';
import { WysiwygSlot } from './WysiwygSlot';
import { prettyHeader, emptyHeaderCopy } from './prettyHeader';
import { useSignupLanguage } from './signup-language';
import { fieldValueControl } from '../build-shared/fieldTypes';
import { TimeSelect } from '../build-shared/TimeSelect';
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
  /** Opens a row's editor (`byKeyboard` as `WysiwygSlot`'s `onExpand`), or closes it with null. */
  onExpandRow: (rowId: string | null, byKeyboard?: boolean) => void;
  onEditCell: (rowId: string, fieldRef: string, value: string) => void;
  onSetCapacity: (rowId: string, capacity: number | null) => void;
  /** Threaded through to EnumPicker. */
  onAddEnumOption: (fieldId: string, value: string) => void;
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
  const t = useTranslations('organizer.build');
  const { locale } = useSignupLanguage();
  const showHeader = groupField !== null;
  const display = groupField
    ? prettyHeader(t, group.rawValue, groupField.config.fieldType, locale, groupField.name)
    : '';
  const placeholder = groupField
    ? emptyHeaderCopy(t, groupField.config.fieldType, groupField.name)
    : '';

  return (
    <div>
      {showHeader && groupField && (
        <div className="-ml-1.5 mb-2">
          <GroupHeader
            group={group}
            groupField={groupField}
            display={display}
            placeholder={placeholder}
            onRenameGroup={onRenameGroup}
            onAddEnumOption={onAddEnumOption}
          />
          {renameFailed && (
            <p role="alert" className="ml-1.5 mt-1 text-[11px] text-danger">
              {t('group.renameFailed')}
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
            onExpand={(byKeyboard) => onExpandRow(row.id, byKeyboard)}
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
            'inline-flex w-full items-center gap-1.5 rounded-b-[11px] px-3.5 py-2.5 text-left text-xs font-medium text-ink-muted first:rounded-t-[11px] ' +
            'transition-colors duration-180 hover:bg-brand-soft hover:text-brand ' +
            (group.rows.length > 0 ? 'border-t border-dashed border-surface-sunk' : '')
          }
        >
          <Plus size={12} />
          {t('group.addSlot')}
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
 * that field (`fieldValueControl`), so it can only be set to a value the server
 * takes: the list's choices for a List field, the time list for a Time field,
 * a date or number input for a Date or Number field, free text for Text.
 */
function GroupHeader({
  group,
  groupField,
  display,
  placeholder,
  onRenameGroup,
  onAddEnumOption,
}: GroupHeaderProps) {
  const t = useTranslations('organizer.build.group');
  const { lang, locale } = useSignupLanguage();
  const ariaLabel = t('header', { heading: display });
  const rename = (next: string) => onRenameGroup(group.key, next);
  const control = fieldValueControl(groupField.config);

  if (control.kind === 'enum') {
    return (
      <EnumPicker
        triggerClassName={`${HEADER_CLASSES} inline-flex items-center gap-1 hover:bg-brand-soft focus:bg-brand-soft focus:outline-none`}
        value={group.rawValue}
        options={control.choices}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        lang={lang}
        onChange={(next) => {
          if (next !== group.rawValue) rename(next);
        }}
        onAddOption={(v) => onAddEnumOption(groupField.id, v)}
      />
    );
  }

  if (control.kind === 'time') {
    return (
      <TimeSelect
        value={group.rawValue}
        // The empty choice prompts for a time in a group that has none. A
        // header is never cleared from here, as a date header isn't.
        onChange={(next) => {
          if (next !== '' && next !== group.rawValue) rename(next);
        }}
        noTimeLabel={placeholder}
        locale={locale}
        aria-label={ariaLabel}
        className={`${HEADER_CLASSES} cursor-pointer border-none bg-transparent hover:bg-brand-soft focus:bg-brand-soft focus:outline-none`}
      />
    );
  }

  // Plain text keeps the header's own small-caps box; a typed value is edited
  // in the slot editor's input for its type.
  const typed = control.fieldType !== 'text';
  return (
    <Editable
      value={group.rawValue}
      display={display}
      // A date or number input reports '' until it holds a whole date or a
      // number, so an empty commit is half-typed, not a request to clear the
      // header.
      onChange={(next) => {
        if (typed && next === '') return;
        rename(next);
      }}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      lang={lang}
      className={`${HEADER_CLASSES} inline-block`}
      {...(typed ? { input: control.input } : {})}
      {...(control.input.maxLength !== undefined ? { maxLength: control.input.maxLength } : {})}
    />
  );
}
