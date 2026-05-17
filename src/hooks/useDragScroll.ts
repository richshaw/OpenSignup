'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, PointerEventHandler } from 'react';

// Decay is expressed per 16ms reference frame (0.94 ≈ -6%/frame at 60Hz).
// Per-frame decay = MOMENTUM_DECAY ^ (deltaMs / FRAME_MS) so behavior is
// identical on 60Hz, 120Hz, and variable-rate displays.
export const MOMENTUM_DECAY = 0.94;
const MOMENTUM_STOP = 0.05; // px/frame-equivalent
const MOMENTUM_MIN_START = 1.5; // px/frame-equivalent
const FRAME_MS = 16;

export function nextVelocity(vy: number, deltaMs: number = FRAME_MS): number {
  return vy * Math.pow(MOMENTUM_DECAY, deltaMs / FRAME_MS);
}

export function shouldStartMomentum(vy: number): boolean {
  return Math.abs(vy) > MOMENTUM_MIN_START;
}

type DragScrollBind<T extends HTMLElement> = {
  onPointerDown: PointerEventHandler<T>;
  onPointerMove: PointerEventHandler<T>;
  onPointerUp: PointerEventHandler<T>;
  onPointerCancel: PointerEventHandler<T>;
  style: CSSProperties;
};

type UseDragScrollReturn<T extends HTMLElement> = {
  ref: React.RefObject<T | null>;
  pressed: boolean;
  bind: DragScrollBind<T>;
};

/**
 * Mouse-pointer click-and-drag scroll with inertial momentum on release.
 * Touch falls through to native browser scroll (so iOS/Android keep rubber-band).
 * Wheel/trackpad scroll is untouched. Clicks on interactive children are not hijacked.
 */
export function useDragScroll<T extends HTMLElement = HTMLDivElement>(): UseDragScrollReturn<T> {
  const ref = useRef<T | null>(null);
  const [pressed, setPressed] = useState(false);
  const state = useRef({
    dragging: false,
    startY: 0,
    startScroll: 0,
    lastY: 0,
    lastT: 0,
    vy: 0,
    raf: 0,
  });
  const reduceMotion = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduceMotion.current = mql.matches;
    const handler = (e: MediaQueryListEvent) => { reduceMotion.current = e.matches; };
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, []);

  const stopMomentum = useCallback(() => {
    if (state.current.raf) cancelAnimationFrame(state.current.raf);
    state.current.raf = 0;
  }, []);

  const runMomentum = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    let lastT = performance.now();
    const step = (now: number) => {
      const s = state.current;
      if (Math.abs(s.vy) < MOMENTUM_STOP) { s.raf = 0; return; }
      const dt = Math.max(1, now - lastT);
      lastT = now;
      // vy is normalized to px per 16ms reference frame; scale travel by dt/16.
      el.scrollTop += s.vy * (dt / FRAME_MS);
      s.vy = nextVelocity(s.vy, dt);
      s.raf = requestAnimationFrame(step);
    };
    state.current.raf = requestAnimationFrame(step);
  }, []);

  useEffect(() => () => stopMomentum(), [stopMomentum]);

  const onPointerDown: PointerEventHandler<T> = (e: ReactPointerEvent<T>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, textarea, select, [role=button]')) return;
    const el = ref.current;
    if (!el) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* Safari ≤16 */ }
    stopMomentum();
    setPressed(true);
    const s = state.current;
    s.dragging = true;
    s.startY = e.clientY;
    s.startScroll = el.scrollTop;
    s.lastY = e.clientY;
    s.lastT = performance.now();
    s.vy = 0;
  };

  const onPointerMove: PointerEventHandler<T> = (e: ReactPointerEvent<T>) => {
    const s = state.current;
    if (!s.dragging) return;
    const el = ref.current;
    if (!el) return;
    el.scrollTop = s.startScroll - (e.clientY - s.startY);
    const now = performance.now();
    const dt = Math.max(1, now - s.lastT);
    s.vy = -((e.clientY - s.lastY) / dt) * FRAME_MS;
    s.lastY = e.clientY;
    s.lastT = now;
  };

  const onPointerUp: PointerEventHandler<T> = (e: ReactPointerEvent<T>) => {
    const s = state.current;
    if (!s.dragging) return;
    s.dragging = false;
    setPressed(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (!reduceMotion.current && shouldStartMomentum(s.vy)) runMomentum();
  };

  return {
    ref,
    pressed,
    bind: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      style: {
        touchAction: 'pan-y',
        userSelect: pressed ? 'none' : 'auto',
        WebkitUserSelect: pressed ? 'none' : 'auto',
      },
    },
  };
}
