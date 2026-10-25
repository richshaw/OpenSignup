'use client';

import { useFormStatus } from 'react-dom';
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Spinner } from './spinner';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'disabled'> & {
  loadingLabel: string;
  children: ReactNode;
  disabled?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

export function AsyncSubmitButton({
  loadingLabel,
  children,
  className,
  disabled,
  ref,
  ...rest
}: Props) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;

  return (
    <button
      ref={ref}
      type="submit"
      aria-busy={pending}
      disabled={isDisabled}
      className={className}
      {...rest}
    >
      <span className="inline-flex items-center gap-2 transition-opacity duration-180 ease-emphasized">
        {pending ? (
          <>
            <Spinner />
            <span>{loadingLabel}</span>
          </>
        ) : (
          children
        )}
      </span>
    </button>
  );
}
