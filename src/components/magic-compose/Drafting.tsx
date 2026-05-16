'use client';

import { useEffect, useState } from 'react';
import type { DraftPreview } from '@/app/api/signups/magic-compose/preview';
import { useTypewriter } from '@/hooks/useTypewriter';

export interface DraftStep {
  id: string;
  label: string;
  duration: number;
}

export const DRAFT_STEPS: DraftStep[] = [
  { id: 'read', label: 'Reading your description', duration: 700 },
  { id: 'title', label: 'Drafting a title', duration: 700 },
  { id: 'desc', label: 'Writing a short blurb', duration: 900 },
  { id: 'fields', label: 'Choosing columns for each slot', duration: 1500 },
  { id: 'slots', label: 'Generating slots', duration: 1800 },
  { id: 'check', label: 'Tidying up', duration: 600 },
];

export const VISIBLE_FIELD_CAP = 4;
export const VISIBLE_SLOT_CAP = 10;

function fieldsStepDuration(n: number): number {
  return Math.min(1500, Math.max(600, Math.min(n, VISIBLE_FIELD_CAP) * 220));
}

function slotsStepDuration(n: number): number {
  return Math.min(1800, Math.max(600, Math.min(n, VISIBLE_SLOT_CAP) * 180));
}

function clampDuration(text: string, min: number, max: number): number {
  return Math.min(max, Math.max(min, text.length * 14));
}

function formatPreviewValue(raw: unknown): string {
  if (raw == null || raw === '') return '—';
  return String(raw);
}

export function Drafting({
  prompt,
  draft,
  onCancel,
  onAnimationDone,
}: {
  prompt: string;
  draft: DraftPreview | null;
  onCancel: () => void;
  onAnimationDone: () => void;
}) {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (!draft) return;
    const steps = DRAFT_STEPS.map((s) => {
      if (s.id === 'fields') return { ...s, duration: fieldsStepDuration(draft.fields.length) };
      if (s.id === 'slots') return { ...s, duration: slotsStepDuration(draft.slots.length) };
      return s;
    });
    let i = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const next = () => {
      setStepIdx(i);
      if (i >= steps.length) {
        onAnimationDone();
        return;
      }
      timer = setTimeout(() => {
        i += 1;
        next();
      }, steps[i]!.duration);
    };
    next();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [draft, onAnimationDone]);

  const reached = (id: string) =>
    DRAFT_STEPS.findIndex((s) => s.id === id) <= stepIdx;
  const passed = (id: string) =>
    DRAFT_STEPS.findIndex((s) => s.id === id) < stepIdx;

  const titleText = useTypewriter(
    draft?.title ?? '',
    DRAFT_STEPS[stepIdx]?.id === 'title',
    clampDuration(draft?.title ?? '', 400, 1200),
  );
  const descText = useTypewriter(
    draft?.description ?? '',
    DRAFT_STEPS[stepIdx]?.id === 'desc',
    clampDuration(draft?.description ?? '', 400, 1200),
  );

  const fields = draft?.fields ?? [];
  const slots = draft?.slots ?? [];
  const visibleFields = fields.slice(0, VISIBLE_FIELD_CAP);
  const overflowFields = Math.max(0, fields.length - visibleFields.length);
  const visibleSlots = slots.slice(0, VISIBLE_SLOT_CAP);
  const overflowSlots = Math.max(0, slots.length - visibleSlots.length);

  const [fieldsRevealed, setFieldsRevealed] = useState(0);
  useEffect(() => {
    if (DRAFT_STEPS[stepIdx]?.id !== 'fields') {
      setFieldsRevealed(passed('fields') ? visibleFields.length : 0);
      return;
    }
    if (visibleFields.length === 0) return;
    setFieldsRevealed(0);
    const dur = fieldsStepDuration(fields.length);
    const step = dur / visibleFields.length;
    const ts = visibleFields.map((_, i) =>
      setTimeout(() => setFieldsRevealed((n) => Math.max(n, i + 1)), step * (i + 0.2)),
    );
    return () => ts.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, visibleFields.length, fields.length]);

  const [slotsCount, setSlotsCount] = useState(0);
  useEffect(() => {
    if (DRAFT_STEPS[stepIdx]?.id !== 'slots') {
      setSlotsCount(passed('slots') ? visibleSlots.length : 0);
      return;
    }
    if (visibleSlots.length === 0) return;
    setSlotsCount(0);
    const dur = slotsStepDuration(slots.length);
    const step = dur / visibleSlots.length;
    const ts = visibleSlots.map((_, i) =>
      setTimeout(() => setSlotsCount((n) => Math.max(n, i + 1)), step * (i + 0.2)),
    );
    return () => ts.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, visibleSlots.length, slots.length]);

  const titleDone = passed('title');
  const descShown = reached('desc');
  const descDone = passed('desc');

  const slotCols = Math.max(1, visibleFields.length);
  const gridTemplateColumns = `38px repeat(${slotCols}, minmax(0, 1fr)) 50px`;

  return (
    <div className="mx-auto mt-10 grid max-w-[1080px] grid-cols-1 items-start gap-7 md:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
      <aside className="flex flex-col gap-4 md:sticky md:top-6">
        <PulseMark />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Drafting your signup</h1>
          <p className="text-ink-muted mt-1.5 text-sm leading-relaxed">
            You&apos;ll be able to edit anything once it&apos;s ready.
          </p>
        </div>

        <ul className="border-surface-sunk flex flex-col gap-0.5 rounded-2xl border bg-white p-1.5">
          {DRAFT_STEPS.map((s, i) => {
            const done = i < stepIdx;
            const active = i === stepIdx;
            return (
              <li
                key={s.id}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
                  active ? 'bg-surface-raised' : ''
                } ${!done && !active ? 'opacity-50' : ''}`}
              >
                <StepIcon done={done} active={active} />
                <div
                  className={`text-sm ${
                    done
                      ? 'text-ink-muted'
                      : active
                        ? 'text-ink font-medium'
                        : 'text-ink-soft'
                  }`}
                >
                  {s.label}
                </div>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={onCancel}
          className="text-ink-muted hover:text-ink self-start rounded-xl px-3 py-2 text-sm font-medium"
        >
          Cancel
        </button>
      </aside>

      <section className="border-surface-sunk overflow-hidden rounded-2xl border bg-white">
        <div className="border-surface-sunk bg-surface-raised text-ink-muted flex items-center justify-between border-b px-4 py-3 text-xs font-medium">
          <span className="flex items-center gap-2">
            <span className="bg-warn inline-block h-1.5 w-1.5 animate-pulse rounded-full" />
            Drafting · live
          </span>
        </div>

        <div className="flex flex-col gap-5 p-6">
          <blockquote className="border-surface-sunk text-ink-muted line-clamp-2 border-l-2 pl-3.5 text-sm leading-relaxed">
            {prompt}
          </blockquote>

          <DraftField label="Title">
            {reached('title') && titleText ? (
              <div className="text-[22px] font-semibold leading-tight tracking-tight">
                {titleText}
                {!titleDone && <Caret />}
              </div>
            ) : (
              <Skeleton width="60%" height={22} />
            )}
          </DraftField>

          <DraftField label="Description">
            {descShown && descText ? (
              <p className="text-ink text-[15px] leading-relaxed">
                {descText}
                {!descDone && <Caret />}
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Skeleton width="100%" height={12} />
                <Skeleton width="80%" height={12} />
              </div>
            )}
          </DraftField>

          <DraftField
            label="Columns"
            meta={fieldsRevealed > 0 ? `${fieldsRevealed} of ${fields.length}` : undefined}
          >
            <div className="flex flex-wrap gap-2">
              {visibleFields.length === 0
                ? Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} width={90 + i * 8} height={28} radius={999} />
                  ))
                : visibleFields.map((f, i) =>
                    i < fieldsRevealed ? (
                      <span
                        key={f.ref}
                        className="bg-brand/10 text-brand border-brand/20 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium"
                      >
                        {f.label}
                      </span>
                    ) : (
                      <Skeleton key={f.ref} width={90 + i * 8} height={28} radius={999} />
                    ),
                  )}
              {fieldsRevealed === visibleFields.length && overflowFields > 0 && (
                <span className="text-ink-muted inline-flex items-center px-3 py-1.5 text-[13px]">
                  +{overflowFields} more
                </span>
              )}
            </div>
          </DraftField>

          <DraftField
            label="Slots"
            meta={slotsCount > 0 ? `${slotsCount} of ${slots.length}` : undefined}
          >
            <ul className="border-surface-sunk bg-surface-raised overflow-hidden rounded-xl border">
              {visibleSlots.length === 0
                ? Array.from({ length: 4 }).map((_, i) => (
                    <li
                      key={i}
                      className="border-surface-sunk grid min-h-[44px] items-center gap-3 border-b px-3.5 py-2.5 last:border-b-0"
                      style={{ gridTemplateColumns: '38px 1fr 50px' }}
                    >
                      <Skeleton width={16} height={10} />
                      <Skeleton width="80%" height={10} />
                      <Skeleton width={30} height={10} className="justify-self-end" />
                    </li>
                  ))
                : visibleSlots.map((s, i) => {
                    const shown = i < slotsCount;
                    return (
                      <li
                        key={i}
                        className={`border-surface-sunk grid min-h-[44px] items-center gap-3 border-b px-3.5 py-2.5 last:border-b-0 ${
                          shown ? 'bg-white' : ''
                        }`}
                        style={{ gridTemplateColumns }}
                      >
                        <span className="text-ink-soft font-mono text-xs">{i + 1}</span>
                        {shown ? (
                          <>
                            {visibleFields.map((f) => (
                              <span key={f.ref} className="truncate text-[13px]">
                                {formatPreviewValue(s.values[f.ref])}
                              </span>
                            ))}
                            <span className="text-ink-muted justify-self-end font-mono text-xs">
                              0/{s.capacity ?? '∞'}
                            </span>
                          </>
                        ) : (
                          <>
                            {visibleFields.map((f) => (
                              <Skeleton key={f.ref} width="80%" height={10} />
                            ))}
                            <Skeleton width={30} height={10} className="justify-self-end" />
                          </>
                        )}
                      </li>
                    );
                  })}
              {slotsCount === visibleSlots.length && overflowSlots > 0 && (
                <li className="text-ink-muted px-3.5 py-2 text-center text-[13px]">
                  +{overflowSlots} more
                </li>
              )}
            </ul>
          </DraftField>
        </div>
      </section>
    </div>
  );
}

function DraftField({
  label,
  meta,
  children,
}: {
  label: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-ink-soft text-[11.5px] font-medium uppercase tracking-wide">
          {label}
        </div>
        {meta && <div className="text-ink-muted font-mono text-xs">{meta}</div>}
      </div>
      {children}
    </div>
  );
}

function Skeleton({
  width,
  height,
  radius = 6,
  className,
}: {
  width: number | string;
  height: number;
  radius?: number;
  className?: string;
}) {
  return (
    <span
      className={`block animate-pulse bg-surface-sunk ${className ?? ''}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height,
        borderRadius: radius,
      }}
    />
  );
}

function Caret() {
  return (
    <span
      aria-hidden="true"
      className="bg-brand ml-0.5 inline-block h-[1em] w-[2px] animate-pulse align-text-bottom"
    />
  );
}

function StepIcon({ done, active }: { done: boolean; active: boolean }) {
  if (done) {
    return (
      <span className="bg-success inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-white">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" className="h-3 w-3">
          <path
            d="M2.5 6.5l2.5 2.5 5-6"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  if (active) {
    return (
      <span className="relative h-5 w-5 flex-shrink-0">
        <span className="border-surface-sunk border-t-brand absolute inset-0 animate-spin rounded-full border-2" />
      </span>
    );
  }
  return (
    <span className="border-surface-sunk inline-block h-5 w-5 flex-shrink-0 rounded-full border-[1.5px] bg-white" />
  );
}

function PulseMark() {
  return (
    <div className="bg-brand/10 text-brand relative flex h-14 w-14 items-center justify-center rounded-2xl">
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
        <path d="M12 2l1.8 4.6L18 8.2l-4.2 1.6L12 14l-1.8-4.2L6 8.2l4.2-1.6L12 2zm7 11l1 2.4 2.4 1-2.4 1L19 20l-1-2.6-2.4-1 2.4-1L19 13zM5 13l.8 1.8 1.8.8-1.8.8L5 18.4l-.8-1.8L2.4 16l1.8-.8L5 13z" />
      </svg>
      <span className="absolute inset-0 animate-ping rounded-2xl border-2 border-brand opacity-50" />
    </div>
  );
}
