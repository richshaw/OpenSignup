'use client';

import { useId, useRef, type RefObject } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Popover } from '@/components/ui/Popover';
import type { PublishCheckAnswer, PublishCheckCopy } from '@/lib/publish-check';
import { OUTLINED, PRIMARY } from './header-buttons';

export interface PublishCheckPanelProps {
  variant: 'desktop' | 'phone';
  /** What Publish's check found, while the panel is open here; null closes it. */
  answer: PublishCheckAnswer | null;
  /** Publish and share, where focus goes back to. */
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  /** Opens the slot the check is about; false when it can't, and focus comes back here. */
  onFix: () => boolean;
  onSecondary: () => void;
}

/**
 * What Publish's check found, by the button: a popover on a computer, a
 * sheet over the bar on a phone, named by its title and described by its
 * text, focus on its first button. Escape, the sheet's ✕ or Not now puts
 * focus back on Publish and share; the fix leaves it where the fix puts it,
 * or gives it back when the slot isn't one this page has.
 */
export function PublishCheckPanel({
  variant,
  answer,
  triggerRef,
  onClose,
  onFix,
  onSecondary,
}: PublishCheckPanelProps) {
  const first = useRef<HTMLButtonElement>(null);
  // Off once the fix has sent focus to the slot it opens.
  const giveFocusBack = useRef(true);
  const titleId = useId();
  const textId = useId();
  const phone = variant === 'phone';

  // The text and the buttons, below the popover's heading or the sheet's title.
  const body = answer ? (
    <>
      <p
        id={textId}
        className={`${phone ? 'text-[15px]' : 'text-[13.5px]'} leading-normal text-ink`}
      >
        {answer.copy.text}
      </p>
      <CheckActions
        copy={answer.copy}
        phone={phone}
        first={first}
        onFix={() => {
          giveFocusBack.current = !onFix();
        }}
        onSecondary={onSecondary}
      />
    </>
  ) : null;

  if (!phone) {
    return (
      <Popover
        open={answer !== null}
        onClose={onClose}
        triggerRef={triggerRef}
        initialFocusRef={first}
        labelledBy={titleId}
        describedBy={textId}
        className="flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2.5 p-4"
      >
        <h2 id={titleId} className="text-sm font-semibold text-ink">
          {answer?.copy.title}
        </h2>
        {body}
      </Popover>
    );
  }

  return (
    <BottomSheet
      open={answer !== null}
      onClose={onClose}
      title={answer?.copy.title}
      describedBy={textId}
      compact
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        giveFocusBack.current = true;
        first.current?.focus();
      }}
      onCloseAutoFocus={(e) => {
        e.preventDefault();
        if (giveFocusBack.current) triggerRef.current?.focus();
      }}
    >
      <div className="space-y-4">{body}</div>
    </BottomSheet>
  );
}

/**
 * The check's buttons: on a computer the other choice, then the fix (as the
 * mock-up has them); on a phone the fix first, both full width and 48px
 * tall. `first` is the fix, or the other choice when there's no fix.
 */
function CheckActions({
  copy,
  phone,
  first,
  onFix,
  onSecondary,
}: {
  copy: PublishCheckCopy;
  phone: boolean;
  first: RefObject<HTMLButtonElement | null>;
  onFix: () => void;
  onSecondary: () => void;
}) {
  const size = phone
    ? 'h-12 w-full rounded-lg text-[15px]'
    : 'h-[34px] rounded-lg px-3.5 text-[13px]';
  const fixButton = copy.fix ? (
    <button ref={first} type="button" onClick={onFix} className={`${size} ${PRIMARY}`}>
      {copy.fix}
    </button>
  ) : null;
  const other = (
    <button
      ref={copy.fix ? undefined : first}
      type="button"
      onClick={onSecondary}
      className={`${size} ${OUTLINED} text-ink`}
    >
      {copy.secondary}
    </button>
  );
  return phone ? (
    <div className="flex flex-col gap-2 pt-1">
      {fixButton}
      {other}
    </div>
  ) : (
    <div className="flex justify-end gap-2 pt-0.5">
      {other}
      {fixButton}
    </div>
  );
}
