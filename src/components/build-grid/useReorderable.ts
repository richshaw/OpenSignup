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
  /**
   * Optional group key extractor. When supplied alongside `onTransfer`, a drop
   * onto an item in a *different* group fires `onTransfer` instead of
   * `onReorder` — letting the caller rewrite the dragged item's group value
   * in addition to repositioning it. Within-group drops still fire `onReorder`.
   *
   * Omitting both keeps the hook in single-array mode (existing behaviour).
   */
  getGroupKey?: (item: T) => string | undefined;
  /**
   * Fires when an item is dropped onto a target in a different group. The
   * receiver is responsible for both the group rewrite (e.g. patching the
   * row's group-field value) and the positional reorder.
   */
  onTransfer?: (itemId: string, toGroupKey: string | undefined, toIdx: number) => void;
}

/**
 * HTML5 drag-drop helper. Item reorder within a flat list (default); when
 * the optional `getGroupKey` + `onTransfer` pair is supplied, drops across
 * groups route to `onTransfer` so callers can update both the row's group
 * value and its sort position.
 *
 * - `source(id)` props go on the drag handle.
 * - `target(id)` props go on the whole item container.
 * - `dragId` / `overId` let the consumer paint drag/drop styling.
 */
export function useReorderable<T extends Reorderable>({
  items,
  onReorder,
  getGroupKey,
  onTransfer,
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
          try {
            e.dataTransfer.setData('text/plain', id);
          } catch {
            // ignore — restricted contexts; state is the source of truth.
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
          if (dragId === id) {
            if (overId !== null) setOverId(null);
            return;
          }
          if (overId !== id) setOverId(id);
        },
        onDrop: (e) => {
          e.preventDefault();
          const from = items.findIndex((i) => i.id === dragId);
          const to = items.findIndex((i) => i.id === id);
          if (from < 0 || to < 0 || from === to) {
            setDragId(null);
            setOverId(null);
            return;
          }
          const source = items[from];
          const target = items[to];
          const transferAllowed =
            typeof getGroupKey === 'function' && typeof onTransfer === 'function';
          const sourceGroup = transferAllowed && source ? getGroupKey(source) : undefined;
          const targetGroup = transferAllowed && target ? getGroupKey(target) : undefined;
          const crossGroup = transferAllowed && sourceGroup !== targetGroup;
          if (crossGroup && onTransfer && dragId) {
            onTransfer(dragId, targetGroup, to);
          } else {
            onReorder(from, to);
          }
          setDragId(null);
          setOverId(null);
        },
      };
    },
  };
}
