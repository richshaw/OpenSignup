'use client';

import { Eye } from 'lucide-react';
import { SignupViewBody } from '@/app/s/[slug]/signup-view';
import type {
  SignupViewField,
  SignupViewSlot,
} from '@/app/s/[slug]/signup-view-types';
import type { SignupMeta } from './BuildGrid';
import type { GridField, GridRow } from './useGridState';

type SideRailProps = {
  signupMeta: SignupMeta;
  fields: GridField[];
  rows: GridRow[];
  groupByFieldRef: string | null;
};

// Adapter: build-grid edit state → public-page render types.
// Synthetic fields (always-open status, zero commitments) are safe because
// SignupViewBody's slot-row branching only treats slots as closed when the
// signup itself is closed/archived. Title/description/status come from the
// initial server load and don't update live during editing.
function toViewField(f: GridField): SignupViewField {
  return { ref: f.ref, label: f.name, fieldType: f.type };
}

function toViewSlot(r: GridRow): SignupViewSlot {
  return {
    id: r.id,
    ref: r.id,
    values: r.values,
    slotAt: null,
    capacity: r.capacity,
    status: 'open',
    committed: 0,
  };
}

export function SideRail({ signupMeta, fields, rows, groupByFieldRef }: SideRailProps) {
  return (
    <div className="sticky top-5 flex flex-col gap-2.5">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-brand tracking-wide">
        <Eye size={12} className="text-brand" />
        LIVE PREVIEW
      </span>
      <div className="rounded-[22px] bg-[#0b1220] p-2 shadow-[0_8px_32px_rgb(11_18_32/0.12)]">
        <div className="overflow-hidden rounded-[16px] bg-white p-4">
          <div className="flex flex-col gap-7 origin-top-left" style={{ zoom: 0.7 }}>
            <SignupViewBody
              signup={{
                title: signupMeta.title,
                description: signupMeta.description,
                status: signupMeta.status,
              }}
              fields={fields.map(toViewField)}
              groupByRef={groupByFieldRef}
              slots={rows.map(toViewSlot)}
              slug={signupMeta.slug}
              mode="preview"
              showStateBanner={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
