'use client';

import { Component, type ReactNode } from 'react';

/**
 * Shows `fallback` in place of a lazy part of the screen whose code won't
 * load, as when a deploy has replaced the chunks since the page opened, or
 * that throws while it renders, and calls `onError` once. Without it the error
 * reaches Next's "client-side exception" screen, which takes the page's state
 * with it: the description and every answer. Once tripped it stays tripped,
 * since a lazy import that failed keeps failing until the page is reloaded.
 */
export class ChunkBoundary extends Component<
  { fallback: ReactNode; onError?: () => void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch() {
    this.props.onError?.();
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
