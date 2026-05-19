'use client';

import { useState, type DragEvent } from 'react';

interface Reorderable {
  id: string;
}

interface SourceProps {
  draggable: true;
  onDragStart: (e: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

interface TargetProps {
  onDragOver: (e: DragEvent<HTMLElement>) => void;
  onDrop: (e: DragEvent<HTMLElement>) => void;
}

export interface UseReorderableResult {
  dragId: string | null;
  overId: string | null;
  source: (id: string) => SourceProps;
  target: (id: string) => TargetProps;
}

interface UseReorderableArgs<T extends Reorderable> {
  items: readonly T[];
  onReorder: (fromIdx: number, toIdx: number) => void;
}

/**
 * Tiny HTML5 drag-drop helper for column/row reorder. Mirrors the contract
 * from the Edit Sheet Option A design (`shared.jsx:238`):
 * - `source(id)` props go on the drag handle (type-icon span for columns,
 *   `#` cell for rows).
 * - `target(id)` props go on the whole item container so the drop-indicator
 *   border spans the full cell/row.
 * - `dragId` / `overId` let the consumer paint the drag/drop styling.
 *
 * `onReorder(from, to)` is called once on a successful drop where the source
 * and target differ. Same-source drop and missing IDs are no-ops. `Esc`
 * cancellation is handled by the browser (no `drop` event fires).
 */
export function useReorderable<T extends Reorderable>({
  items,
  onReorder,
}: UseReorderableArgs<T>): UseReorderableResult {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  return {
    dragId,
    overId,
    source(id) {
      return {
        draggable: true,
        onDragStart: (e) => {
          e.dataTransfer.effectAllowed = 'move';
          // `setData` can throw under restricted contexts (some test envs,
          // sandboxed iframes). It's a best-effort signal — state is the
          // source of truth, so swallow rather than abort the drag.
          try {
            e.dataTransfer.setData('text/plain', id);
          } catch {
            // ignore
          }
          setDragId(id);
        },
        onDragEnd: () => {
          setDragId(null);
          setOverId(null);
        },
      };
    },
    target(id) {
      return {
        onDragOver: (e) => {
          if (!dragId) return;
          e.preventDefault();
          if (dragId !== id && overId !== id) setOverId(id);
        },
        onDrop: (e) => {
          e.preventDefault();
          const from = items.findIndex((i) => i.id === dragId);
          const to = items.findIndex((i) => i.id === id);
          if (from >= 0 && to >= 0 && from !== to) onReorder(from, to);
          setDragId(null);
          setOverId(null);
        },
      };
    },
  };
}
