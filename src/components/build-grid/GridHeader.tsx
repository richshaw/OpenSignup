'use client';

import { Plus, ChevronDown } from 'lucide-react';
import { buildColsTemplate } from './columnSizing';
import { fieldTypeMeta } from './fieldTypes';
import { ResizeHandle } from './ResizeHandle';
import type { GridField } from './useGridState';

interface GridHeaderProps {
  fields: GridField[];
  onEditField: (field: GridField) => void;
  onAddField: () => void;
  onResize: (fieldId: string, width: number) => void;
  onResetWidth: (fieldId: string) => void;
}

export function GridHeader({
  fields,
  onEditField,
  onAddField,
  onResize,
  onResetWidth,
}: GridHeaderProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: buildColsTemplate(fields),
        borderBottom: '1px solid #eef1f5',
      }}
      className="bg-surface-raised"
    >
      {/* Leading # column — 38px */}
      <div className="flex items-center justify-center px-2 py-2 border-r border-surface-sunk">
        <span className="text-[11px] text-ink-soft font-mono">#</span>
      </div>

      {/* Field columns */}
      {fields.map((f, i) => {
        const meta = fieldTypeMeta(f.type);
        const Icon = meta.icon;
        return (
          <div
            key={f.id}
            style={{ position: 'relative' }}
            className="flex items-center border-r border-surface-sunk"
          >
            <button
              onClick={() => onEditField(f)}
              className="flex flex-1 items-center gap-1.5 px-2 py-2 text-left min-w-0 overflow-hidden text-ellipsis"
            >
              <Icon size={12} className="text-brand flex-shrink-0" />
              <span className="text-[13px] font-medium text-ink truncate">{f.name}</span>
              {f.required && <span className="text-danger text-[11px]">*</span>}
              <ChevronDown size={11} className="text-ink-soft ml-auto flex-shrink-0" />
            </button>
            <ResizeHandle
              field={f}
              fieldIndex={i}
              onResize={(width) => onResize(f.id, width)}
              onReset={() => onResetWidth(f.id)}
            />
          </div>
        );
      })}

      {/* Trailing Capacity header — 90px */}
      <div className="flex items-center justify-center px-2 py-2 border-r border-surface-sunk">
        <span className="text-[13px] font-medium text-ink truncate">Cap.</span>
      </div>

      {/* Trailing + button — 60px */}
      <div className="flex items-center justify-center">
        <button
          onClick={onAddField}
          title="Add column"
          aria-label="Add column"
          className="text-brand hover:text-brand/80 p-1 rounded"
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}
