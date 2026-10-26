import { lazy, useEffect, type ComponentType } from 'react';
import type { SharePanelProps } from './SharePanel';
import { ShareUnavailable } from './ShareUnavailable';

type PanelModule = { default: ComponentType<SharePanelProps> };

// The panel, once its code is in.
let loaded: PanelModule | null = null;

/**
 * The share panel's code, loaded on demand. Share and Publish and share
 * start it once the page is idle (`usePrefetchSharePanel`), and Publish
 * again as it's pressed, so it's usually in by the time the panel opens. A
 * load that fails resolves to `ShareUnavailable` rather than rejecting: a
 * rejected `lazy` throws to the nearest error boundary, and there is none
 * under the page, so the organizer would get an error screen right after
 * publishing. Only a load that worked is kept, so a failed one is tried
 * again when the panel opens.
 */
export function loadSharePanel(): Promise<ComponentType<SharePanelProps>> {
  return import('./SharePanel').then(
    (m) => {
      loaded = { default: m.SharePanel };
      return m.SharePanel;
    },
    () => ShareUnavailable,
  );
}

// What `SharePanel` loads. A promise answers a turn late even when the code
// is already in, so `lazy` would still show its fallback, and React keeps a
// fallback up for 300 ms once it's shown. So once the code is in this
// answers at once, through a `then` that calls back straight away: `lazy`
// only calls `then`, and takes an answer it gets during the call in the same
// render, so the panel opens at its full height. It's no real promise, so
// nothing else gets it.
function sharePanelModule(): Promise<PanelModule> {
  const panel = loaded;
  if (!panel) return loadSharePanel().then((Panel) => ({ default: Panel }));
  const now = { then: (resolve: (value: PanelModule) => void) => resolve(panel) };
  return now as unknown as Promise<PanelModule>;
}

/**
 * The panel's body, its QR encoder with it, for `ShareButton` to render.
 * React's own lazy rather than next/dynamic, which is the same thing in the
 * App Router plus a runtime of about 1.5 kB in every signup tab's first
 * load; the panel renders only once it's opened, never on the server, so
 * there's no `ssr: false` to want.
 */
export const SharePanel = lazy(sharePanelModule);

/**
 * Starts loading the panel's code once the page is idle, so it's in before
 * the panel first opens. Safari has no `requestIdleCallback`, so there it
 * waits a moment instead.
 */
export function usePrefetchSharePanel(): void {
  useEffect(() => {
    if (typeof requestIdleCallback !== 'function') {
      const id = setTimeout(loadSharePanel, 200);
      return () => clearTimeout(id);
    }
    const id = requestIdleCallback(() => void loadSharePanel(), { timeout: 2000 });
    return () => cancelIdleCallback(id);
  }, []);
}
