'use client';

import { useState, useRef } from 'react';
import { MIN_W, MAX_W, widthFor } from './columnSizing';
import type { GridField } from './useGridState';

interface ResizeHandleProps {
  field: GridField;
  fieldIndex: number;
  onResize: (width: number) => void;
  onReset: () => void;
}

export function ResizeHandle({ field, fieldIndex, onResize, onReset }: ResizeHandleProps) {
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState(false);
  const drag = useRef({ active: false, startX: 0, startWidth: 0 });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      active: true,
      startX: e.clientX,
      startWidth:
        e.currentTarget.parentElement?.getBoundingClientRect().width ??
        widthFor(field, fieldIndex),
    };
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    const next = Math.min(MAX_W, Math.max(MIN_W, drag.current.startWidth + e.clientX - drag.current.startX));
    onResize(next);
  };

  const handlePointerUp = () => {
    drag.current.active = false;
    setDragging(false);
  };

  function resetWidth(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onReset();
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
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
