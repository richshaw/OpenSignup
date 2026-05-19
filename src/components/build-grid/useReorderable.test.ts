// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { DragEvent } from 'react';
import { useReorderable } from './useReorderable';

interface Item {
  id: string;
}

const items: Item[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

function makeDragEvent(): DragEvent<HTMLElement> {
  const store = new Map<string, string>();
  const dataTransfer = {
    effectAllowed: 'none' as string,
    setData: vi.fn((type: string, value: string) => store.set(type, value)),
    getData: vi.fn((type: string) => store.get(type) ?? ''),
  };
  return {
    dataTransfer,
    preventDefault: vi.fn(),
  } as unknown as DragEvent<HTMLElement>;
}

describe('useReorderable', () => {
  it('tracks dragId on dragStart and clears it on dragEnd', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useReorderable({ items, onReorder }));

    expect(result.current.dragId).toBeNull();

    act(() => result.current.source('a').onDragStart(makeDragEvent()));
    expect(result.current.dragId).toBe('a');

    act(() => result.current.source('a').onDragEnd());
    expect(result.current.dragId).toBeNull();
    expect(result.current.overId).toBeNull();
  });

  it('sets effectAllowed and dataTransfer payload on dragStart', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useReorderable({ items, onReorder }));

    const event = makeDragEvent();
    act(() => result.current.source('a').onDragStart(event));

    expect(event.dataTransfer.effectAllowed).toBe('move');
    expect(event.dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'a');
  });

  it('swallows setData errors so the drag still starts', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useReorderable({ items, onReorder }));

    const event = makeDragEvent();
    (event.dataTransfer.setData as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('restricted');
    });

    act(() => result.current.source('a').onDragStart(event));
    expect(result.current.dragId).toBe('a');
  });

  it('updates overId on dragOver of a different target', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useReorderable({ items, onReorder }));

    act(() => result.current.source('a').onDragStart(makeDragEvent()));

    const overEvent = makeDragEvent();
    act(() => result.current.target('b').onDragOver(overEvent));
    expect(overEvent.preventDefault).toHaveBeenCalled();
    expect(result.current.overId).toBe('b');
  });

  it('does nothing on dragOver when no drag is in flight', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useReorderable({ items, onReorder }));

    const overEvent = makeDragEvent();
    act(() => result.current.target('b').onDragOver(overEvent));
    expect(overEvent.preventDefault).not.toHaveBeenCalled();
    expect(result.current.overId).toBeNull();
  });

  it('does not set overId when hovering over the source itself', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useReorderable({ items, onReorder }));

    act(() => result.current.source('a').onDragStart(makeDragEvent()));
    act(() => result.current.target('a').onDragOver(makeDragEvent()));
    expect(result.current.overId).toBeNull();
  });

  it('clears prior overId when the pointer moves back over the source', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useReorderable({ items, onReorder }));

    act(() => result.current.source('a').onDragStart(makeDragEvent()));
    act(() => result.current.target('b').onDragOver(makeDragEvent()));
    expect(result.current.overId).toBe('b');

    act(() => result.current.target('a').onDragOver(makeDragEvent()));
    expect(result.current.overId).toBeNull();
  });

  it('fires onReorder with from/to indices on drop', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useReorderable({ items, onReorder }));

    act(() => result.current.source('a').onDragStart(makeDragEvent()));
    act(() => result.current.target('c').onDrop(makeDragEvent()));

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(0, 2);
    expect(result.current.dragId).toBeNull();
    expect(result.current.overId).toBeNull();
  });

  it('no-ops onReorder when dropping on the source itself', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useReorderable({ items, onReorder }));

    act(() => result.current.source('a').onDragStart(makeDragEvent()));
    act(() => result.current.target('a').onDrop(makeDragEvent()));

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('no-ops onReorder when the source id is not in items', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useReorderable({ items, onReorder }));

    act(() => result.current.source('ghost').onDragStart(makeDragEvent()));
    act(() => result.current.target('a').onDrop(makeDragEvent()));

    expect(onReorder).not.toHaveBeenCalled();
    expect(result.current.dragId).toBeNull();
  });

  it('cancels via dragEnd without firing onReorder (Esc path)', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useReorderable({ items, onReorder }));

    act(() => result.current.source('a').onDragStart(makeDragEvent()));
    act(() => result.current.target('b').onDragOver(makeDragEvent()));
    act(() => result.current.source('a').onDragEnd());

    expect(onReorder).not.toHaveBeenCalled();
    expect(result.current.dragId).toBeNull();
    expect(result.current.overId).toBeNull();
  });
});
