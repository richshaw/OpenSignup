import { headers } from 'next/headers';
import { after } from 'next/server';
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

export type DeviceClass = 'phone' | 'computer' | 'unknown';

/**
 * Whether a request came from a phone or a computer, for organizer page views
 * (a draft abandoned on a phone reads differently from one abandoned at a
 * desk). Chromium says so in the `Sec-CH-UA-Mobile` hint; for the rest, a
 * phone's User-Agent carries "Mobi" (iPhone, Android phones), which Android
 * tablets and desktops leave out. An iPad's Safari can carry it too, so an
 * iPad is a computer first, as tablets are. `uaClass` can't tell phones from
 * computers: it only sorts browsers from bots.
 */
export function classifyDevice(signals: Pick<RequestSignals, 'userAgent' | 'mobileHint'>): DeviceClass {
  if (signals.mobileHint === '?1') return 'phone';
  if (signals.mobileHint === '?0') return 'computer';
  if (!signals.userAgent) return 'unknown';
  if (/iPad/.test(signals.userAgent)) return 'computer';
  return /Mobi/i.test(signals.userAgent) ? 'phone' : 'computer';
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
  /** The `Sec-CH-UA-Mobile` client hint, `?1` on a phone and `?0` elsewhere,
   *  when the browser sends it (Chromium does). */
  mobileHint?: string;
}

export function readRequestSignals(headerMap: {
  get: (name: string) => string | null;
}): RequestSignals {
  const mobileHint = headerMap.get('sec-ch-ua-mobile');
  return {
    userAgent: headerMap.get('user-agent'),
    referer: headerMap.get('referer'),
    dnt: isDoNotTrack(headerMap),
    ...(mobileHint ? { mobileHint } : {}),
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

/**
 * An organizer opening one of their own pages. Signed in, so neither
 * do-not-track nor the bot filter applies; the row says whether the page was
 * opened on a phone or a computer (`device`), never the User-Agent itself.
 */
export async function recordOrganizerView(args: {
  actor: ActivityActor;
  signupId: string | null;
  workspaceId: string | null;
  eventType: ActivityEvent;
  payload?: Record<string, unknown>;
  signals: RequestSignals;
}): Promise<void> {
  const { signals, payload, ...row } = args;
  await recordActivityBestEffort(getDb(), {
    ...row,
    payload: { ...payload, device: classifyDevice(signals) },
  });
}

/**
 * What an organizer page calls to record its view: reads the request's
 * signals now, since `after()` runs outside the request where `headers()`
 * isn't allowed, and writes the row once the page has been sent.
 */
export async function trackOrganizerView(
  args: Omit<Parameters<typeof recordOrganizerView>[0], 'signals'>,
): Promise<void> {
  const signals = readRequestSignals(await headers());
  after(() => recordOrganizerView({ ...args, signals }));
}
