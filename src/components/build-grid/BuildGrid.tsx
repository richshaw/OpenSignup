'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useGridState } from './useGridState';
import type { GridField } from './useGridState';
import { totalGridWidth } from './columnSizing';
import { Toolbar } from './Toolbar';
import { ScrollableTable } from './ScrollableTable';
import { GridHeader } from './GridHeader';
import { GroupedBody } from './GroupedBody';
import { SideRail } from './SideRail';
import { FieldEditor } from './FieldEditor';
import { MobileBuildGrid } from './mobile/MobileBuildGrid';
import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import type { SignupSettings, SignupStatus } from '@/schemas/signups';

/** Server-loaded signup chrome snapshot; not updated live during editing. */
export type SignupMeta = {
  title: string;
  description: string | null;
  status: SignupStatus;
  slug: string;
};

type BuildGridProps = {
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

function AddRowAffordance({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      aria-label="Add slot"
      className="w-full bg-surface-raised border-t border-surface-sunk cursor-pointer text-left font-[inherit] hover:bg-surface-sunk/50"
    >
      <span className="flex items-center gap-1 px-3 py-3 text-[13px] text-ink-muted font-medium">
        <Plus size={13} className="shrink-0" />
        Add slot
      </span>
    </button>
  );
}

export function BuildGrid({ signupId, signupMeta, initialFields, initialSlots, initialSettings }: BuildGridProps) {
  const {
    state,
    addField,
    updateField,
    deleteField,
    moveField,
    setFieldWidth,
    addRow,
    deleteRow,
    moveRow,
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
    { title: signupMeta.title, description: signupMeta.description },
  );

  const [editingField, setEditingField] = useState<GridField | null>(null);
  const [showFieldEditorCreate, setShowFieldEditorCreate] = useState(false);

  return (
    <>
      {/* Mobile tree — <md only */}
      <div className="md:hidden">
        <MobileBuildGrid
          signupMeta={signupMeta}
          fields={state.fields}
          rows={state.rows}
          groupByFieldRef={state.groupByFieldRef}
          saveStatus={state.saveStatus}
          onEditField={(field) => setEditingField(field)}
          onAddField={() => setShowFieldEditorCreate(true)}
          onGroupByChange={(ref) => { void setGroupBy(ref); }}
          onEditCell={(rowId, fieldRef, value) => editCell(rowId, fieldRef, value)}
          onSetCapacity={(rowId, cap) => { void setCapacity(rowId, cap); }}
          onDeleteRow={(rowId) => { void deleteRow(rowId); }}
          onAddRow={() => { void addRow(); }}
        />
      </div>

      {/* Desktop tree — ≥md only */}
      <div
        className={`hidden md:grid gap-5 items-start ${state.showPreview ? 'md:grid-cols-[minmax(720px,1fr)_minmax(320px,360px)]' : 'md:grid-cols-[1fr]'}`}
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
          />
          <ScrollableTable totalWidth={totalGridWidth(state.fields)}>
            <GridHeader
              fields={state.fields}
              onEditField={(field) => setEditingField(field)}
              onAddField={() => setShowFieldEditorCreate(true)}
              onMoveField={(fieldId, toIdx) => { void moveField(fieldId, toIdx); }}
              onResize={(fieldId, width) => setFieldWidth(fieldId, width)}
              onResetWidth={(fieldId) => setFieldWidth(fieldId, undefined)}
            />
            <GroupedBody
              fields={state.fields}
              rows={state.rows}
              groupByFieldRef={state.groupByFieldRef}
              highlightedRowIdx={state.previewRowIdx}
              onEditCell={(rowId, fieldRef, value) => editCell(rowId, fieldRef, value)}
              onSetCapacity={(rowId, cap) => { void setCapacity(rowId, cap); }}
              onDeleteRow={(rowId) => { void deleteRow(rowId); }}
              onMoveRow={(from, to) => { void moveRow(from, to); }}
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
            signupMeta={signupMeta}
            fields={state.fields}
            rows={state.rows}
            groupByFieldRef={state.groupByFieldRef}
          />
        )}
      </div>

      {/* Modals */}
      {editingField && (
        <FieldEditor
          editorMode={{ mode: 'edit', field: editingField }}
          onSave={(type, name, config) => {
            void updateField(editingField.id, { name, type, config });
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
          editorMode={{ mode: 'create' }}
          onSave={(type, name, config) => {
            void addField(type, name, config);
            setShowFieldEditorCreate(false);
          }}
          onClose={() => setShowFieldEditorCreate(false)}
        />
      )}
    </>
  );
}
