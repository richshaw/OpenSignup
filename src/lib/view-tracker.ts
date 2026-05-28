import type { ActivityEvent } from '@/db/schema/activity';
import { getDb } from '@/db/client';
import { recordActivity, type ActivityActor } from '@/lib/activity';
import { log } from '@/lib/log';

const BOT_RE =
  /bot|crawler|spider|slurp|facebookexternalhit|whatsapp|telegrambot|discordbot|slackbot|twitterbot|linkedinbot|googlebot|bingbot|preview|headlesschrome|phantomjs|httpie|curl|wget/i;

export type UaClass = 'browser' | 'bot' | 'unknown';

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

async function writeActivity(args: {
  signupId: string | null;
  workspaceId: string | null;
  actor: ActivityActor;
  eventType: ActivityEvent;
  payload?: Record<string, unknown>;
}): Promise<void> {
  // Single insert — no BEGIN/COMMIT wrapper. The activity log writes-in-tx rule
  // applies when the activity row describes a mutation in the same tx; these
  // helpers fire standalone telemetry.
  await recordActivity(getDb(), {
    signupId: args.signupId,
    workspaceId: args.workspaceId,
    actor: args.actor,
    eventType: args.eventType,
    payload: args.payload ?? {},
  });
}

export async function recordPublicView(args: {
  signupId: string;
  workspaceId: string | null;
  signupStatus: string;
  isReturning: boolean;
  signals: RequestSignals;
}): Promise<void> {
  try {
    if (args.signals.dnt) return;
    const uaClass = classifyUa(args.signals.userAgent);
    if (uaClass === 'bot') return;
    await writeActivity({
      signupId: args.signupId,
      workspaceId: args.workspaceId,
      actor: { actorId: null, actorType: 'system' },
      eventType: 'signup.viewed',
      payload: {
        uaClass,
        refererHost: refererHost(args.signals.referer),
        isReturning: args.isReturning,
        signupStatus: args.signupStatus,
      },
    });
  } catch (err) {
    log.warn({ err }, 'recordPublicView failed');
  }
}

export async function recordLandingView(args: {
  signals: RequestSignals;
}): Promise<void> {
  try {
    if (args.signals.dnt) return;
    const uaClass = classifyUa(args.signals.userAgent);
    if (uaClass === 'bot') return;
    await writeActivity({
      signupId: null,
      workspaceId: null,
      actor: { actorId: null, actorType: 'system' },
      eventType: 'landing.viewed',
      payload: {
        uaClass,
        refererHost: refererHost(args.signals.referer),
      },
    });
  } catch (err) {
    log.warn({ err }, 'recordLandingView failed');
  }
}

export async function recordLandingCtaClicked(args: {
  signals: RequestSignals;
}): Promise<void> {
  try {
    if (args.signals.dnt) return;
    const uaClass = classifyUa(args.signals.userAgent);
    if (uaClass === 'bot') return;
    await writeActivity({
      signupId: null,
      workspaceId: null,
      actor: { actorId: null, actorType: 'system' },
      eventType: 'landing.cta_clicked',
      payload: {
        uaClass,
        refererHost: refererHost(args.signals.referer),
      },
    });
  } catch (err) {
    log.warn({ err }, 'recordLandingCtaClicked failed');
  }
}

export async function recordEditLinkFollowed(args: {
  signupId: string;
  workspaceId: string | null;
  commitmentId: string;
  participantId: string | null;
  signals: RequestSignals;
}): Promise<void> {
  try {
    if (args.signals.dnt) return;
    if (classifyUa(args.signals.userAgent) === 'bot') return;
    await writeActivity({
      signupId: args.signupId,
      workspaceId: args.workspaceId,
      actor: { actorId: args.participantId, actorType: 'participant' },
      eventType: 'commitment.edit_link_followed',
      payload: { commitmentId: args.commitmentId },
    });
  } catch (err) {
    log.warn({ err }, 'recordEditLinkFollowed failed');
  }
}

export async function recordOrganizerView(args: {
  actor: ActivityActor;
  signupId: string | null;
  workspaceId: string | null;
  eventType: ActivityEvent;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    await writeActivity({
      signupId: args.signupId,
      workspaceId: args.workspaceId,
      actor: args.actor,
      eventType: args.eventType,
      payload: args.payload,
    });
  } catch (err) {
    log.warn({ err, event: args.eventType }, 'recordOrganizerView failed');
  }
}
