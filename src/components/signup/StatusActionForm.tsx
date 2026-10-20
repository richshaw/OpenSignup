'use client';

import { useActionState, type ReactNode } from 'react';
import { FormError } from '@/components/ui/form-error';

export type StatusAction = () => Promise<{ error: string } | null>;

/**
 * The form around Publish or Close signup. When the action is refused it
 * returns why, and that shows under the button instead of nothing happening.
 */
export function StatusActionForm({
  action,
  className,
  errorClassName,
  children,
}: {
  action: StatusAction;
  className?: string;
  errorClassName?: string;
  children: ReactNode;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      {state ? (
        <div className={errorClassName}>
          <FormError>{state.error}</FormError>
        </div>
      ) : null}
    </form>
  );
}
