'use client';

import { useState } from 'react';
import { useGridState } from '../build-grid/useGridState';
import { Editable } from './Editable';
import { EditingRail } from './EditingRail';
import { FieldsPopover } from './FieldsPopover';
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

/** Maximum sheet width grows with field count — keeps small schemas tight, wide ones legible. */
function sheetMaxWidthClass(fieldCount: number): string {
  if (fieldCount <= 3) return 'max-w-[580px]';
  if (fieldCount === 4) return 'max-w-[720px]';
  return 'max-w-[960px]';
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

          {/* Slot list lands in PR 3. */}
          <div className="mt-6 rounded-lg border border-dashed border-surface-sunk bg-surface-raised p-6 text-center text-xs text-ink-soft">
            <p>
              Slot list lands in PR 3.
              {' '}
              {state.fields.length} field{state.fields.length === 1 ? '' : 's'}, {state.rows.length} slot{state.rows.length === 1 ? '' : 's'} loaded.
            </p>
          </div>
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
