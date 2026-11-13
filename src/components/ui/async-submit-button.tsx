'use client';

import { useFormStatus } from 'react-dom';
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Spinner } from './spinner';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'disabled'> & {
  loadingLabel: string;
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
};

export function AsyncSubmitButton({ loadingLabel, children, className, ref, ...rest }: Props) {
  const { pending } = useFormStatus();

  return (
    <button
      ref={ref}
      type="submit"
      aria-busy={pending}
      disabled={pending}
      className={className}
      {...rest}
    >
      <span className="flex items-center justify-center gap-2 transition-opacity duration-180 ease-emphasized">
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
