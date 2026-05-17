'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Eye } from 'lucide-react';
import { SignupViewBody } from '@/app/s/[slug]/signup-view';
import type {
  SignupViewField,
  SignupViewSlot,
} from '@/app/s/[slug]/signup-view-types';
import { useDragScroll } from '@/hooks/useDragScroll';
import { useScrollbarFade } from '@/hooks/useScrollbarFade';
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
  const { ref: scrollRef, pressed, bind } = useDragScroll<HTMLDivElement>();
  const fadeActive = useScrollbarFade(scrollRef);

  // The inner content uses `transform: scale(0.7)` to shrink visual size,
  // which leaves its layout box unscaled. We mirror the post-transform height
  // onto the wrapper so the scroll container measures visual (not layout)
  // height — otherwise a phantom scrollbar appears even when content fits.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const scaledRef = useRef<HTMLDivElement | null>(null);
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const inner = scaledRef.current;
    const scroller = scrollRef.current;
    if (!wrapper || !inner || !scroller) return;

    let raf = 0;
    const measure = () => {
      raf = 0;
      const visualHeight = inner.getBoundingClientRect().height;
      wrapper.style.height = `${visualHeight}px`;
      setScrollable(scroller.scrollHeight > scroller.clientHeight + 1);
    };
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(measure);
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(inner);
    schedule();

    return () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [scrollRef]);

  return (
    <div className="sticky top-5 flex flex-col gap-2.5">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-brand tracking-wide">
        <Eye size={12} className="text-brand" />
        LIVE PREVIEW
      </span>
      <div className="rounded-[28px] bg-[#0b1220] p-2 shadow-[0_8px_32px_rgb(11_18_32/0.12)]">
        <div className="flex h-[560px] flex-col overflow-hidden rounded-[22px] bg-surface">
          <div className="flex h-7 flex-shrink-0 items-center justify-between bg-white px-4 text-[10px] font-semibold text-ink">
            <span>9:41</span>
            <span>••• Wi-Fi 100%</span>
          </div>
          <div
            ref={scrollRef}
            {...bind}
            className={clsx(
              'live-preview-scroll flex-1 overflow-y-auto p-4',
              scrollable && (pressed ? 'cursor-grabbing' : 'cursor-grab'),
              fadeActive && 'live-preview-scroll-active',
            )}
            style={{ ...bind.style }}
          >
            <div ref={wrapperRef} className="min-h-full">
              <div
                ref={scaledRef}
                className="flex flex-col gap-7 origin-top-left"
                style={{ transform: 'scale(0.7)', width: 'calc(100% / 0.7)' }}
              >
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
      </div>
    </div>
  );
}
