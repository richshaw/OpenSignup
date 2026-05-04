'use client';

import { useState } from 'react';
import { MIN_W, MAX_W, widthFor } from './columnSizing';
import type { GridField } from './useGridState';

interface ResizeHandleProps {
  field: GridField;
  isFirst: boolean;
  onResize: (fieldId: string, width: number) => void;
  onReset: (fieldId: string) => void;
}

export function ResizeHandle({ field, isFirst, onResize, onReset }: ResizeHandleProps) {
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState(false);

  function startDrag(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startW = widthFor(field, isFirst);

    setDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onPointerMove(moveEvent: PointerEvent) {
      const delta = moveEvent.clientX - startX;
      const next = Math.min(MAX_W, Math.max(MIN_W, startW + delta));
      onResize(field.id, next);
    }

    function onPointerUp() {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setDragging(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  function resetWidth(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onReset(field.id);
  }

  return (
    <div
      onPointerDown={startDrag}
      onDoubleClick={resetWidth}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'absolute',
        top: 0,
        right: -3,
        bottom: 0,
        width: 6,
        cursor: 'col-resize',
        zIndex: 5,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 6,
          bottom: 6,
          left: 2,
          width: 2,
          borderRadius: 2,
          background: dragging ? '#1f6feb' : hover ? '#dbe7ff' : 'transparent',
          transition: 'background 0.12s',
        }}
      />
    </div>
  );
}
