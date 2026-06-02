'use client';

import { useEffect, useRef, useState } from 'react';

type EditableProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
  ariaLabel: string;
  className?: string;
  /** Optional pretty display (used by date group headers); falls back to `value` when omitted. */
  display?: string;
};

export function Editable({
  value,
  onChange,
  placeholder,
  multiline = false,
  ariaLabel,
  className = '',
  display,
}: EditableProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  // Guards against Enter/Escape committing and then the unmount-triggered onBlur
  // re-committing the same draft (which would fire onChange twice).
  const settledRef = useRef(false);

  // Reset draft when the underlying value changes from outside (e.g. server refresh).
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      settledRef.current = false;
      inputRef.current.focus();
      if ('select' in inputRef.current) inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    if (draft !== value) onChange(draft);
    setEditing(false);
  };

  const cancel = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    const sharedProps = {
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: commit,
      placeholder,
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
              cancel();
            }
          }}
        />
      );
    }
    return (
      <input
        {...sharedProps}
        ref={(el) => { inputRef.current = el; }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setEditing(true);
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
