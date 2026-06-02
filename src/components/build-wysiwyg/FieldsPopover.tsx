'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronDown, GripVertical, List, Plus, X } from 'lucide-react';
import { FIELD_TYPE_META } from '../build-grid/fieldTypes';
import { useReorderable } from '../build-grid/useReorderable';
import type { GridField } from '../build-grid/useGridState';
import type { SlotFieldConfig } from '@/schemas/slot-fields';
import { InlineFieldForm, type InlineFieldFormMode } from './InlineFieldForm';

type FieldsPopoverProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: GridField[];
  groupByFieldRef: string | null;
  onAddField: (name: string, config: SlotFieldConfig) => void;
  onUpdateField: (fieldId: string, patch: { name?: string; config?: SlotFieldConfig }) => void;
  onDeleteField: (fieldId: string) => void;
  onMoveField: (fieldId: string, toIdx: number) => void;
  onGroupByChange: (ref: string | null) => void;
};

export function FieldsPopover({
  open,
  onOpenChange,
  fields,
  groupByFieldRef,
  onAddField,
  onUpdateField,
  onDeleteField,
  onMoveField,
  onGroupByChange,
}: FieldsPopoverProps) {
  // null = list view; otherwise inline-edit view (create or edit existing).
  const [formMode, setFormMode] = useState<InlineFieldFormMode | null>(null);

  // Reset back to the list view whenever the modal is closed/reopened so a
  // half-finished create state doesn't leak across mounts.
  useEffect(() => {
    if (!open) setFormMode(null);
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-label="Fields"
          aria-describedby={undefined}
          className="fixed left-1/2 top-[10vh] z-50 w-[420px] max-w-[calc(100%-2rem)] max-h-[80vh] -translate-x-1/2 overflow-y-auto rounded-xl border border-surface-sunk bg-white p-4 shadow-card focus:outline-none"
        >
          <FieldsPopoverHeader
            title={
              formMode?.mode === 'edit'
                ? 'Edit field'
                : formMode?.mode === 'create'
                  ? 'New field'
                  : `Fields · ${fields.length}`
            }
          />

          {formMode ? (
            <InlineFieldForm
              formMode={formMode}
              onCancel={() => setFormMode(null)}
              onSave={({ name, config }) => {
                if (formMode.mode === 'edit') {
                  onUpdateField(formMode.field.id, { name, config });
                } else {
                  onAddField(name, config);
                }
                setFormMode(null);
              }}
              onDelete={
                formMode.mode === 'edit'
                  ? () => {
                      onDeleteField(formMode.field.id);
                      setFormMode(null);
                    }
                  : undefined
              }
            />
          ) : (
            <FieldsListView
              fields={fields}
              groupByFieldRef={groupByFieldRef}
              onDelete={onDeleteField}
              onMoveField={onMoveField}
              onGroupByChange={onGroupByChange}
              onEdit={(field) => setFormMode({ mode: 'edit', field })}
              onStartCreate={() => setFormMode({ mode: 'create' })}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FieldsPopoverHeader({ title }: { title: string }) {
  return (
    <div className="mb-3.5 flex items-center justify-between">
      <Dialog.Title className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-soft">
        {title}
      </Dialog.Title>
      <Dialog.Close asChild>
        <button
          type="button"
          aria-label="Close"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border-none bg-transparent text-ink-soft hover:bg-surface-raised hover:text-ink"
        >
          <X size={13} />
        </button>
      </Dialog.Close>
    </div>
  );
}

type FieldsListViewProps = {
  fields: GridField[];
  groupByFieldRef: string | null;
  onDelete: (fieldId: string) => void;
  onMoveField: (fieldId: string, toIdx: number) => void;
  onGroupByChange: (ref: string | null) => void;
  onEdit: (field: GridField) => void;
  onStartCreate: () => void;
};

function FieldsListView({
  fields,
  groupByFieldRef,
  onDelete,
  onMoveField,
  onGroupByChange,
  onEdit,
  onStartCreate,
}: FieldsListViewProps) {
  const reorder = useReorderable({
    items: fields,
    onReorder: (fromIdx, toIdx) => {
      const field = fields[fromIdx];
      if (!field) return;
      onMoveField(field.id, toIdx);
    },
  });

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2.5 border-b border-surface-sunk pb-3">
        <span className="text-xs font-medium text-ink-muted">Group slots by</span>
        <GroupByInlinePicker
          fields={fields}
          value={groupByFieldRef}
          onChange={onGroupByChange}
        />
      </div>

      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-soft">
          Drag to reorder
        </span>
        <button
          type="button"
          onClick={onStartCreate}
          className="inline-flex items-center gap-1 rounded-md border border-surface-sunk bg-white px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-raised"
        >
          <Plus size={11} />
          Add field
        </button>
      </div>

      <div className="flex flex-col gap-1">
        {fields.length === 0 && (
          <div className="rounded-md bg-surface-raised px-3 py-3 text-center text-[11px] italic text-ink-soft">
            No fields yet — add one to get started.
          </div>
        )}
        {fields.map((f) => {
          const fieldType = f.config.fieldType;
          const TypeIcon = FIELD_TYPE_META[fieldType].icon;
          const isDragging = reorder.dragId === f.id;
          const isDropTarget = reorder.overId === f.id && reorder.dragId && reorder.dragId !== f.id;
          const enumChoiceCount =
            f.config.fieldType === 'enum' ? f.config.choices.length : 0;
          return (
            <div
              key={f.id}
              {...reorder.target(f.id)}
              data-testid={`fields-row-${f.id}`}
              className={
                'flex items-center gap-1.5 rounded-md px-2 py-2 transition-colors duration-180 ' +
                (isDragging
                  ? 'bg-brand-soft opacity-50'
                  : isDropTarget
                    ? 'border border-brand bg-surface-raised'
                    : 'bg-surface-raised border border-transparent')
              }
            >
              <span
                {...reorder.source(f.id)}
                aria-hidden="true"
                className="inline-flex cursor-grab items-center justify-center p-1 text-ink-soft hover:text-ink"
              >
                <GripVertical size={11} />
              </span>
              <span className="inline-flex text-brand">
                <TypeIcon size={13} />
              </span>
              <button
                type="button"
                onClick={() => onEdit(f)}
                className="flex-1 truncate text-left text-[13px] font-medium text-ink border-none bg-transparent cursor-pointer p-0"
              >
                {f.name}
              </button>
              <span className="text-[11px] text-ink-soft">
                {enumChoiceCount > 0
                  ? `${FIELD_TYPE_META[fieldType].label} · ${enumChoiceCount}`
                  : FIELD_TYPE_META[fieldType].label}
              </span>
              <button
                type="button"
                onClick={() => onDelete(f.id)}
                aria-label={`Delete ${f.name}`}
                className="inline-flex h-5 w-5 items-center justify-center rounded border-none bg-transparent text-ink-soft hover:text-danger"
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

type GroupByInlinePickerProps = {
  fields: GridField[];
  value: string | null;
  onChange: (ref: string | null) => void;
};

function GroupByInlinePicker({ fields, value, onChange }: GroupByInlinePickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Time fields are intentionally excluded — every unique HH:MM would become
  // its own group, which defeats the purpose. Mirrors the grid's Toolbar.
  const groupable = useMemo(
    () =>
      fields.filter(
        (f) =>
          f.config.fieldType === 'date' ||
          f.config.fieldType === 'enum' ||
          f.config.fieldType === 'text',
      ),
    [fields],
  );

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        menuRef.current && !menuRef.current.contains(target) &&
        triggerRef.current && !triggerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const activeField = value ? fields.find((f) => f.ref === value) : null;
  const label =
    value === null
      ? 'Don\u2019t group'
      : activeField
        ? activeField.name
        : 'Don\u2019t group';

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-md border border-surface-sunk bg-white px-2 py-1 text-xs font-medium text-ink hover:bg-surface-raised"
      >
        {label}
        <ChevronDown size={11} />
      </button>
      {open && (
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Group slots by"
          className="absolute right-0 top-[calc(100%+4px)] z-50 min-w-[200px] rounded-lg border border-surface-sunk bg-white p-1 shadow-card"
        >
          <PickItem
            active={value === null}
            icon={<List size={12} />}
            label={'Don\u2019t group'}
            onClick={() => { onChange(null); setOpen(false); }}
          />
          {groupable.length > 0 && <div className="my-1 h-px bg-surface-sunk" />}
          {groupable.map((f) => {
            const TypeIcon = FIELD_TYPE_META[f.config.fieldType].icon;
            return (
              <PickItem
                key={f.id}
                active={value === f.ref}
                icon={<TypeIcon size={12} />}
                label={f.name}
                onClick={() => { onChange(f.ref); setOpen(false); }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function PickItem({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={
        'flex w-full items-center gap-2 rounded-md border-none px-2.5 py-1.5 text-left text-xs font-medium cursor-pointer ' +
        (active ? 'bg-brand-soft text-brand' : 'bg-transparent text-ink hover:bg-surface-raised')
      }
    >
      <span className="inline-flex">{icon}</span>
      <span className="flex-1">{label}</span>
    </button>
  );
}

