import type { ComponentType } from 'react';
import type { SharePanelProps } from './SharePanel';
import { ShareUnavailable } from './ShareUnavailable';

/**
 * The share panel's code, loaded on demand. Publish starts it as it's
 * pressed, so it's usually in by the time the panel opens, and the panel's
 * `lazy` asks again (answered from the module cache) when it renders. A
 * load that fails resolves to `ShareUnavailable` rather than rejecting: a
 * rejected `lazy` throws to the nearest error boundary, and there is none
 * under the page, so the organizer would get an error screen right after
 * publishing.
 */
export function loadSharePanel(): Promise<ComponentType<SharePanelProps>> {
  // The QR encoder alongside, rather than once the panel asks for it, so
  // the QR code's place is filled soon after the panel shows. A failure is
  // the QR code's to handle when it asks again.
  import('lean-qr/nano').catch(() => {});
  return import('./SharePanel').then(
    (m) => m.SharePanel,
    () => ShareUnavailable,
  );
}
