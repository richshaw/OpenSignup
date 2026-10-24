import { sendTelemetryBeacon } from './telemetry-beacon';

/**
 * An organizer copying a signup's public link, sent from the browser as a
 * beacon so "published but never shared" can be counted. Only the event and
 * where it happened travel: the server reads the rest (who, which workspace,
 * the signup's status) from the session and the signup.
 */
export const SIGNUP_LINK_EVENTS = ['copied'] as const;
export type SignupLinkEvent = (typeof SIGNUP_LINK_EVENTS)[number];

/** Where on the organizer's pages the link was copied or shared from. */
export const SIGNUP_LINK_SURFACES = ['header'] as const;
export type SignupLinkSurface = (typeof SIGNUP_LINK_SURFACES)[number];

export function emitSignupLinkEvent(
  signupId: string,
  event: SignupLinkEvent,
  surface: SignupLinkSurface,
): void {
  sendTelemetryBeacon(
    `/api/signups/${encodeURIComponent(signupId)}/link-events?event=${event}&surface=${surface}`,
  );
}
