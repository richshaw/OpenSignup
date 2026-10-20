import type { ActivityEvent } from '@/db/schema/activity';
import { getDb } from '@/db/client';
import { recordActivityBestEffort, type ActivityActor } from '@/lib/activity';
import type { LandingCta } from '@/lib/landing-cta';

const BOT_RE =
  /bot|crawler|spider|slurp|facebookexternalhit|whatsapp|telegrambot|discordbot|slackbot|twitterbot|linkedinbot|googlebot|bingbot|preview|headlesschrome|phantomjs|httpie|curl|wget/i;

export type UaClass = 'browser' | 'bot' | 'unknown';

const SYSTEM_ACTOR: ActivityActor = { actorId: null, actorType: 'system' };

export function classifyUa(ua: string | null | undefined): UaClass {
  if (!ua) return 'unknown';
  return BOT_RE.test(ua) ? 'bot' : 'browser';
}

export function refererHost(ref: string | null | undefined): string | null {
  if (!ref) return null;
  try {
    return new URL(ref).host || null;
  } catch {
    return null;
  }
}

export function isDoNotTrack(headerMap: {
  get: (name: string) => string | null;
}): boolean {
  return headerMap.get('dnt') === '1' || headerMap.get('sec-gpc') === '1';
}

/**
 * Plain-data view of the request signals these recorders care about.
 * Callers MUST extract these from `headers()` BEFORE scheduling a recorder
 * via `after(...)` — Next.js 15 forbids dynamic APIs (headers/cookies/etc.)
 * inside `after()` callbacks, since `after()` runs outside the request
 * context.
 */
export interface RequestSignals {
  userAgent: string | null;
  referer: string | null;
  dnt: boolean;
}

export function readRequestSignals(headerMap: {
  get: (name: string) => string | null;
}): RequestSignals {
  return {
    userAgent: headerMap.get('user-agent'),
    referer: headerMap.get('referer'),
    dnt: isDoNotTrack(headerMap),
  };
}

type ActivityRow = Parameters<typeof recordActivityBestEffort>[1];

/**
 * Shared path for visitor telemetry: skip do-not-track and bot requests, then
 * write one standalone row. No BEGIN/COMMIT wrapper — the activity log
 * writes-in-tx rule applies when the row describes a mutation in the same tx;
 * these rows are telemetry and must never fail the page that records them.
 */
async function trackVisitor(
  signals: RequestSignals,
  toRow: (uaClass: UaClass, refererHost: string | null) => ActivityRow,
): Promise<void> {
  if (signals.dnt) return;
  const uaClass = classifyUa(signals.userAgent);
  if (uaClass === 'bot') return;
  await recordActivityBestEffort(getDb(), toRow(uaClass, refererHost(signals.referer)));
}

export async function recordPublicView(args: {
  signupId: string;
  workspaceId: string | null;
  signupStatus: string;
  isReturning: boolean;
  signals: RequestSignals;
}): Promise<void> {
  await trackVisitor(args.signals, (uaClass, refererHost) => ({
    signupId: args.signupId,
    workspaceId: args.workspaceId,
    actor: SYSTEM_ACTOR,
    eventType: 'signup.viewed',
    payload: {
      uaClass,
      refererHost,
      isReturning: args.isReturning,
      signupStatus: args.signupStatus,
    },
  }));
}

export async function recordLandingView(args: {
  signals: RequestSignals;
}): Promise<void> {
  await trackVisitor(args.signals, (uaClass, refererHost) => ({
    signupId: null,
    workspaceId: null,
    actor: SYSTEM_ACTOR,
    eventType: 'landing.viewed',
    payload: { uaClass, refererHost },
  }));
}

export async function recordLandingCtaClicked(args: {
  cta: LandingCta;
  signals: RequestSignals;
}): Promise<void> {
  await trackVisitor(args.signals, (uaClass, refererHost) => ({
    signupId: null,
    workspaceId: null,
    actor: SYSTEM_ACTOR,
    eventType: 'landing.cta_clicked',
    payload: { cta: args.cta, uaClass, refererHost },
  }));
}

export async function recordEditLinkFollowed(args: {
  signupId: string;
  workspaceId: string | null;
  commitmentId: string;
  participantId: string | null;
  signals: RequestSignals;
}): Promise<void> {
  await trackVisitor(args.signals, () => ({
    signupId: args.signupId,
    workspaceId: args.workspaceId,
    actor: { actorId: args.participantId, actorType: 'participant' },
    eventType: 'commitment.edit_link_followed',
    payload: { commitmentId: args.commitmentId },
  }));
}

export async function recordOrganizerView(args: {
  actor: ActivityActor;
  signupId: string | null;
  workspaceId: string | null;
  eventType: ActivityEvent;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await recordActivityBestEffort(getDb(), args);
}
