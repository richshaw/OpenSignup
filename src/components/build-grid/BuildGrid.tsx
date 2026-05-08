'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useGridState } from './useGridState';
import type { GridField } from './useGridState';
import { totalGridWidth } from './columnSizing';
import { FIELD_TYPE_META } from './fieldTypes';
import { Toolbar } from './Toolbar';
import { ScrollableTable } from './ScrollableTable';
import { GridHeader } from './GridHeader';
import { GridBody } from './GridBody';
import { SideRail } from './SideRail';
import { FieldPicker } from './FieldPicker';
import { FieldEditor } from './FieldEditor';
import type { SlotFieldDefinition, SlotFieldConfig, FieldType } from '@/schemas/slot-fields';
import type { SignupSettings } from '@/schemas/signups';

type BuildGridProps = {
  signupId: string;
  initialFields: SlotFieldDefinition[];
  initialSlots: Array<{
    id: string;
    capacity: number | null;
    sortOrder?: number | null;
    values: Record<string, unknown>;
  }>;
  initialSettings: SignupSettings;
};

function buildDefaultConfig(type: Exclude<FieldType, 'enum'>): SlotFieldConfig {
  switch (type) {
    case 'text':   return { fieldType: 'text', maxLength: 200 };
    case 'date':   return { fieldType: 'date' };
    case 'time':   return { fieldType: 'time' };
    case 'number': return { fieldType: 'number' };
  }
}

function AddRowAffordance({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      aria-label="Add another slot"
      className="w-full bg-surface-raised border-t border-surface-sunk cursor-pointer text-left font-[inherit] hover:bg-surface-sunk/50"
    >
      <span className="flex items-center gap-1.5 px-3 py-3 text-sm text-ink-soft">
        <Plus size={13} />
        Add another slot
      </span>
    </button>
  );
}

export function BuildGrid({ signupId, initialFields, initialSlots, initialSettings }: BuildGridProps) {
  const {
    state,
    addField,
    updateField,
    deleteField,
    moveField,
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
  );

  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [editingField, setEditingField] = useState<GridField | null>(null);
  const [showFieldEditorCreate, setShowFieldEditorCreate] = useState(false);

  return (
    <>
      <div
        className={`grid gap-5 items-start ${state.showPreview ? 'grid-cols-[1fr_320px]' : 'grid-cols-[1fr]'}`}
      >
        {/* Build Grid panel */}
        <div className="border border-surface-sunk rounded-2xl bg-white overflow-hidden min-w-0">
          <Toolbar
            fields={state.fields}
            rows={state.rows}
            groupByFieldRef={state.groupByFieldRef}
            onGroupByChange={(ref) => { void setGroupBy(ref); }}
            showPreview={state.showPreview}
            onTogglePreview={() => setShowPreview(!state.showPreview)}
            saveStatus={state.saveStatus}
            onAddField={() => setShowFieldPicker(true)}
          />
          <ScrollableTable totalWidth={totalGridWidth(state.fields)}>
            <GridHeader
              fields={state.fields}
              onEditField={(field) => setEditingField(field)}
              onAddField={() => setShowFieldPicker(true)}
              onDeleteField={(fieldId) => { void deleteField(fieldId); }}
              onMoveField={(fieldId, toIdx) => { void moveField(fieldId, toIdx); }}
              onResize={(fieldId, width) => setFieldWidth(fieldId, width)}
              onResetWidth={(fieldId) => setFieldWidth(fieldId, undefined)}
            />
            <GridBody
              fields={state.fields}
              rows={state.rows}
              highlightedRowIdx={state.previewRowIdx}
              onEditCell={(rowId, fieldRef, value) => editCell(rowId, fieldRef, value)}
              onSetCapacity={(rowId, cap) => { void setCapacity(rowId, cap); }}
              onDeleteRow={(rowId) => { void deleteRow(rowId); }}
              onMoveRowUp={(rowId) => { void moveRowUp(rowId); }}
              onMoveRowDown={(rowId) => { void moveRowDown(rowId); }}
              onSelectRow={(idx) => setPreviewRow(idx)}
            />
          </ScrollableTable>
          <AddRowAffordance onAdd={() => { void addRow(); }} />
        </div>

        {/* Side Rail */}
        {state.showPreview && (
          <SideRail
            fields={state.fields}
            rows={state.rows}
            previewRowIdx={state.previewRowIdx}
            onSelectRow={(idx) => setPreviewRow(idx)}
          />
        )}
      </div>

      {/* Modals */}
      {showFieldPicker && (
        <FieldPicker
          onPick={(type) => {
            const config = buildDefaultConfig(type);
            const name = FIELD_TYPE_META[type].defaultName;
            void addField(type, name, config, true);
            setShowFieldPicker(false);
          }}
          onPickEnum={() => {
            setShowFieldPicker(false);
            setShowFieldEditorCreate(true);
          }}
          onClose={() => setShowFieldPicker(false)}
        />
      )}

      {editingField && (
        <FieldEditor
          editorMode={{ mode: 'edit', field: editingField }}
          onSave={(type, name, config, required) => {
            void updateField(editingField.id, { name, type, config, required });
            setEditingField(null);
          }}
          onDelete={() => {
            void deleteField(editingField.id);
            setEditingField(null);
          }}
          onClose={() => setEditingField(null)}
        />
      )}

      {showFieldEditorCreate && (
        <FieldEditor
          editorMode={{ mode: 'create', type: 'enum' }}
          onSave={(type, name, config, required) => {
            void addField(type, name, config, required);
            setShowFieldEditorCreate(false);
          }}
          onClose={() => setShowFieldEditorCreate(false)}
        />
      )}
    </>
  );
}
