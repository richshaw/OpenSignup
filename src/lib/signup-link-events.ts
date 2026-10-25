import { sendTelemetryBeacon } from './telemetry-beacon';

/**
 * An organizer copying a signup's public link, or sending it from the share
 * panel, sent from the browser as a beacon so "published but never shared"
 * can be counted. Only the event and where it happened travel: the server
 * reads the rest (who, which workspace, the signup's status) from the
 * session and the signup. Nothing about who the link went to.
 */

/**
 * Where a copy happened: the header's public link chip; the share panel's
 * Copy link (or, when the panel couldn't load, the chip it shows instead);
 * the share panel's Copy message, which copies the message with the link.
 */
export const SIGNUP_LINK_COPY_SURFACES = ['header', 'share_panel', 'share_message'] as const;
export type SignupLinkCopySurface = (typeof SIGNUP_LINK_COPY_SURFACES)[number];

/**
 * How the share panel sent the link on: the phone's own share menu (once it
 * says it sent), Email it (the click that opens the email app) and the QR
 * code's Download (the click that saves the picture).
 */
export const SIGNUP_LINK_SHARE_SURFACES = ['share_menu', 'email', 'qr_code'] as const;
type SignupLinkShareSurface = (typeof SIGNUP_LINK_SHARE_SURFACES)[number];

export function emitSignupLinkEvent(
  signupId: string,
  event: 'copied',
  surface: SignupLinkCopySurface,
): void;
export function emitSignupLinkEvent(
  signupId: string,
  event: 'shared',
  surface: SignupLinkShareSurface,
): void;
export function emitSignupLinkEvent(signupId: string, event: string, surface: string): void {
  sendTelemetryBeacon(
    `/api/signups/${encodeURIComponent(signupId)}/link-events?event=${event}&surface=${surface}`,
  );
}
