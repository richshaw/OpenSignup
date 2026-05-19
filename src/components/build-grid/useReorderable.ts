'use client';

import { useCallback, useState } from 'react';

/**
 * HTML5 drag-and-drop reorder hook.
 *
 * Returns prop builders for drag SOURCE (the visible drag handle) and drop
 * TARGET (the whole row / header cell). The source carries the dragged item's
 * id via `dataTransfer.setData('text/plain', id)` and surfaces it through
 * `dragId` while the drag is in flight. The target highlights as `overId` when
 * a valid drag is hovering over it and calls `onReorder(fromIdx, toIdx)` on
 * drop, where indices come from `idToIndex` — drop is dispatched as a
 * "move from-index to-index" rather than relying on element coordinates.
 *
 * Consumers wire the drop-zone styling (e.g. brand left/top border) on
 * elements that satisfy `overId === id` while `dragId !== id`. Browsers fire
 * `dragover` continuously, so `event.preventDefault()` (done internally) is
 * what allows the drop to succeed.
 */
export type ReorderHandlers<E extends HTMLElement = HTMLElement> = {
  /** id of the item being dragged, or null. */
  dragId: string | null;
  /** id of the item currently hovered over as a drop target, or null. */
  overId: string | null;
  /** Spread on the drag handle element (type icon span / # cell). */
  source: (id: string) => {
    draggable: true;
    onDragStart: (e: React.DragEvent<E>) => void;
    onDragEnd: (e: React.DragEvent<E>) => void;
  };
  /** Spread on the drop target element (whole header cell / whole row). */
  target: (id: string) => {
    onDragOver: (e: React.DragEvent<E>) => void;
    onDragLeave: (e: React.DragEvent<E>) => void;
    onDrop: (e: React.DragEvent<E>) => void;
  };
};

export type UseReorderableArgs = {
  /** Map each item id to its current index in the list. */
  idToIndex: (id: string) => number;
  /** Called when a drop completes with from/to indices (both clamped to range). */
  onReorder: (fromIdx: number, toIdx: number) => void;
};

export function useReorderable<E extends HTMLElement = HTMLElement>({
  idToIndex,
  onReorder,
}: UseReorderableArgs): ReorderHandlers<E> {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const source = useCallback(
    (id: string) => ({
      draggable: true as const,
      onDragStart: (e: React.DragEvent<E>) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
        setDragId(id);
      },
      onDragEnd: () => {
        setDragId(null);
        setOverId(null);
      },
    }),
    [],
  );

  const target = useCallback(
    (id: string) => ({
      onDragOver: (e: React.DragEvent<E>) => {
        // preventDefault is required for `drop` to fire on this element.
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragId !== null && dragId !== id) {
          setOverId((prev) => (prev === id ? prev : id));
        }
      },
      onDragLeave: () => {
        setOverId((prev) => (prev === id ? null : prev));
      },
      onDrop: (e: React.DragEvent<E>) => {
        e.preventDefault();
        const sourceId = e.dataTransfer.getData('text/plain') || dragId;
        setDragId(null);
        setOverId(null);
        if (!sourceId || sourceId === id) return;
        const fromIdx = idToIndex(sourceId);
        const toIdx = idToIndex(id);
        if (fromIdx === -1 || toIdx === -1) return;
        if (fromIdx === toIdx) return;
        onReorder(fromIdx, toIdx);
      },
    }),
    [dragId, idToIndex, onReorder],
  );

  return { dragId, overId, source, target };
}
