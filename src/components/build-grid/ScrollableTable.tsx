'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

interface ScrollableTableProps {
  totalWidth: number;
  children: React.ReactNode;
}

export function ScrollableTable({ totalWidth, children }: ScrollableTableProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ left: 0, max: 0 });
  const lastRef = useRef({ left: 0, max: 0 });

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const next = { left: el.scrollLeft, max: el.scrollWidth - el.clientWidth };
    const last = lastRef.current;
    if (Math.abs(next.left - last.left) < 1 && Math.abs(next.max - last.max) < 1) return;
    lastRef.current = next;
    setScrollState(next);
  }, []);

  useEffect(() => {
    onScroll();
    if (!ref.current) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(onScroll);
    });
    ro.observe(ref.current);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [totalWidth, onScroll]);

  const showLeft = scrollState.left > 4;
  const showRight = scrollState.max - scrollState.left > 4;

  return (
    <div style={{ position: 'relative' }}>
      {/* Left fade */}
      {showLeft && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: 24,
            pointerEvents: 'none',
            background: 'linear-gradient(to right, rgb(11 18 32 / 0.08), transparent)',
            zIndex: 10,
          }}
        />
      )}

      {/* Right fade */}
      {showRight && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: 24,
            pointerEvents: 'none',
            background: 'linear-gradient(to left, rgb(11 18 32 / 0.08), transparent)',
            zIndex: 10,
          }}
        />
      )}

      {/* Scrollable inner container */}
      <div
        ref={ref}
        onScroll={onScroll}
        style={{ overflowX: 'auto', overflowY: 'visible' }}
      >
        {/* Content container — stretches to totalWidth minimum */}
        <div style={{ minWidth: totalWidth, width: '100%' }}>{children}</div>
      </div>
    </div>
  );
}
