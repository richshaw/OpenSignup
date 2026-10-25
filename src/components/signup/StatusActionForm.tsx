'use client';

import { createContext, useActionState, useContext, type ReactNode } from 'react';
import { FormError } from '@/components/ui/form-error';

export type StatusAction = () => Promise<{ error: string } | null>;
type StatusActionState = Awaited<ReturnType<StatusAction>>;

// What useActionState returns: the refusal (or null), the form action, pending.
const StatusActionContext = createContext<readonly [StatusActionState, () => void, boolean] | null>(
  null,
);

/**
 * Runs Publish or Close signup for everything inside it, so the button can
 * sit in one place (`StatusActionButtonForm`) and its refusal in another
 * (`StatusActionRefusal`), such as a full-width line under the header. When
 * the action is refused it returns why, and that shows instead of nothing
 * happening.
 */
export function StatusActionScope({
  action,
  children,
}: {
  action: StatusAction;
  children: ReactNode;
}) {
  const scope = useActionState(action, null);
  return <StatusActionContext.Provider value={scope}>{children}</StatusActionContext.Provider>;
}

export function StatusActionButtonForm({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const formAction = useContext(StatusActionContext)?.[1];
  return (
    <form action={formAction} className={className}>
      {children}
    </form>
  );
}

/** Why Publish or Close signup was refused, or nothing until it is. */
export function StatusActionRefusal({ className }: { className?: string }) {
  const state = useContext(StatusActionContext)?.[0];
  return state ? (
    <div className={className}>
      <FormError>{state.error}</FormError>
    </div>
  ) : null;
}
