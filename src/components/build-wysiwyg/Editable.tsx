'use client';

import { useEffect, useRef, useState } from 'react';
import { FIELD_VALUE_INPUT_CLASS, type FieldValueInput } from '../build-shared/fieldTypes';

type EditableProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
  ariaLabel: string;
  className?: string;
  /** Optional pretty display (used by date group headers); falls back to `value` when omitted. */
  display?: string;
  /**
   * The input to edit in, for a value with a type (a date group header uses
   * the slot editor's date input, boxed as it is there rather than in
   * `className`'s text style). Plain text when omitted; ignored with `multiline`.
   */
  input?: FieldValueInput;
  /** The most characters the value may have, as its field allows. */
  maxLength?: number;
};

export function Editable({
  value,
  onChange,
  placeholder,
  multiline = false,
  ariaLabel,
  className = '',
  display,
  input,
  maxLength,
}: EditableProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const displayRef = useRef<HTMLSpanElement>(null);
  // Set when Enter or Escape ends the edit, so focus goes back to the value
  // rather than to the page. An edit ended by clicking elsewhere leaves focus
  // where the click put it.
  const refocusRef = useRef(false);
  // Guards against Enter/Escape committing and then the unmount-triggered onBlur
  // re-committing the same draft (which would fire onChange twice).
  const settledRef = useRef(false);

  useEffect(() => {
    if (editing && inputRef.current) {
      settledRef.current = false;
      refocusRef.current = false;
      inputRef.current.focus();
      if ('select' in inputRef.current) inputRef.current.select();
    }
    if (!editing && refocusRef.current) {
      refocusRef.current = false;
      displayRef.current?.focus();
    }
  }, [editing]);

  // Start each edit from the current value, which may have changed from
  // outside (e.g. a server refresh) since the last one.
  const startEditing = () => {
    setDraft(value);
    setEditing(true);
  };

  const commit = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    if (draft !== value) onChange(draft);
    setEditing(false);
  };

  // A reload, a closed tab or leaving the site doesn't blur the field, so
  // commit what's typed as the page goes away (#699). Capture, so this runs
  // before useBuildState's own listener on the same target flushes the queue
  // this commit adds to.
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => {
    if (!editing) return;
    const onPageHide = () => commitRef.current();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') commitRef.current();
    };
    window.addEventListener('pagehide', onPageHide, { capture: true });
    document.addEventListener('visibilitychange', onVisibilityChange, { capture: true });
    return () => {
      window.removeEventListener('pagehide', onPageHide, { capture: true });
      document.removeEventListener('visibilitychange', onVisibilityChange, { capture: true });
    };
  }, [editing]);

  const cancel = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    setEditing(false);
  };

  if (editing) {
    const sharedProps = {
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: commit,
      placeholder,
      maxLength,
      'aria-label': ariaLabel,
      className: `${className} bg-brand-soft rounded outline-none w-full font-[inherit] resize-none border-none`,
    };
    if (multiline) {
      return (
        <textarea
          {...sharedProps}
          ref={(el) => { inputRef.current = el; }}
          rows={Math.max(2, draft.split('\n').length)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              refocusRef.current = true;
              cancel();
            }
          }}
        />
      );
    }
    return (
      <input
        {...input}
        {...sharedProps}
        {...(input ? { className: FIELD_VALUE_INPUT_CLASS } : {})}
        ref={(el) => { inputRef.current = el; }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            refocusRef.current = true;
            commit();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            refocusRef.current = true;
            cancel();
          }
        }}
      />
    );
  }

  return (
    <span
      ref={displayRef}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={startEditing}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startEditing();
        }
      }}
      className={`${className} cursor-text rounded transition-colors duration-180 hover:bg-brand-soft focus:bg-brand-soft focus:outline-none`}
    >
      {value ? (display ?? value) : (
        <span className="text-ink-soft italic font-normal">{placeholder}</span>
      )}
    </span>
  );
}
