// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReorderable } from './useReorderable';

type DT = {
  effectAllowed?: string;
  dropEffect?: string;
  data: Record<string, string>;
  setData: (k: string, v: string) => void;
  getData: (k: string) => string;
};

function makeDataTransfer(): DT {
  const dt: DT = {
    data: {},
    setData(k, v) {
      this.data[k] = v;
    },
    getData(k) {
      return this.data[k] ?? '';
    },
  };
  return dt;
}

function makeEvent(dt: DT) {
  return {
    preventDefault: vi.fn(),
    dataTransfer: dt,
  } as unknown as React.DragEvent<HTMLElement>;
}

const idToIndexMapFromArray = (ids: string[]) => (id: string) => ids.indexOf(id);

describe('useReorderable', () => {
  it('exposes draggable=true and starts a drag via the source handle', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useReorderable({ idToIndex: idToIndexMapFromArray(['a', 'b', 'c']), onReorder }),
    );

    const sourceProps = result.current.source('a');
    expect(sourceProps.draggable).toBe(true);

    const dt = makeDataTransfer();
    act(() => sourceProps.onDragStart(makeEvent(dt)));

    expect(dt.effectAllowed).toBe('move');
    expect(dt.data['text/plain']).toBe('a');
    expect(result.current.dragId).toBe('a');
  });

  it('sets overId on dragOver for a different target and clears it on dragLeave', () => {
    const { result } = renderHook(() =>
      useReorderable({ idToIndex: idToIndexMapFromArray(['a', 'b']), onReorder: vi.fn() }),
    );

    // Start drag.
    const dt = makeDataTransfer();
    act(() => result.current.source('a').onDragStart(makeEvent(dt)));

    // dragOver target 'b' should set overId.
    act(() => result.current.target('b').onDragOver(makeEvent(dt)));
    expect(result.current.overId).toBe('b');

    // dragLeave clears overId.
    act(() => result.current.target('b').onDragLeave(makeEvent(dt)));
    expect(result.current.overId).toBe(null);
  });

  it('does NOT set overId when hovering over the source itself', () => {
    const { result } = renderHook(() =>
      useReorderable({ idToIndex: idToIndexMapFromArray(['a', 'b']), onReorder: vi.fn() }),
    );

    const dt = makeDataTransfer();
    act(() => result.current.source('a').onDragStart(makeEvent(dt)));
    act(() => result.current.target('a').onDragOver(makeEvent(dt)));

    expect(result.current.overId).toBe(null);
  });

  it('fires onReorder(fromIdx, toIdx) on drop and clears state', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useReorderable({ idToIndex: idToIndexMapFromArray(['a', 'b', 'c']), onReorder }),
    );

    const dt = makeDataTransfer();
    act(() => result.current.source('a').onDragStart(makeEvent(dt)));
    act(() => result.current.target('c').onDrop(makeEvent(dt)));

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(0, 2);
    expect(result.current.dragId).toBe(null);
    expect(result.current.overId).toBe(null);
  });

  it('does NOT fire onReorder when dropping on the source itself', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useReorderable({ idToIndex: idToIndexMapFromArray(['a', 'b']), onReorder }),
    );

    const dt = makeDataTransfer();
    act(() => result.current.source('a').onDragStart(makeEvent(dt)));
    act(() => result.current.target('a').onDrop(makeEvent(dt)));

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('clears dragId/overId on dragEnd', () => {
    const { result } = renderHook(() =>
      useReorderable({ idToIndex: idToIndexMapFromArray(['a', 'b']), onReorder: vi.fn() }),
    );

    const dt = makeDataTransfer();
    act(() => result.current.source('a').onDragStart(makeEvent(dt)));
    act(() => result.current.target('b').onDragOver(makeEvent(dt)));
    expect(result.current.overId).toBe('b');
    expect(result.current.dragId).toBe('a');

    act(() => result.current.source('a').onDragEnd(makeEvent(dt)));
    expect(result.current.dragId).toBe(null);
    expect(result.current.overId).toBe(null);
  });

  it('skips onReorder when from === to (e.g. dropped on same index)', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useReorderable({
        // Map both ids to the same index — defensive case.
        idToIndex: () => 0,
        onReorder,
      }),
    );

    const dt = makeDataTransfer();
    act(() => result.current.source('a').onDragStart(makeEvent(dt)));
    act(() => result.current.target('b').onDrop(makeEvent(dt)));

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('skips onReorder when the source id is unknown to idToIndex', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useReorderable({ idToIndex: idToIndexMapFromArray(['b', 'c']), onReorder }),
    );

    const dt = makeDataTransfer();
    act(() => result.current.source('a').onDragStart(makeEvent(dt)));
    act(() => result.current.target('b').onDrop(makeEvent(dt)));

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('calls preventDefault on dragOver so the drop can succeed', () => {
    const { result } = renderHook(() =>
      useReorderable({ idToIndex: idToIndexMapFromArray(['a', 'b']), onReorder: vi.fn() }),
    );

    const dt = makeDataTransfer();
    act(() => result.current.source('a').onDragStart(makeEvent(dt)));

    const evt = makeEvent(dt);
    act(() => result.current.target('b').onDragOver(evt));
    expect(evt.preventDefault).toHaveBeenCalled();
  });
});
