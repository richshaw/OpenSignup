'use client';

import { createContext, useActionState, useContext, type ReactNode } from 'react';
import { FormError } from '@/components/ui/form-error';

/**
 * What Publish or Close signup answers: why it was refused, that it
 * published (which opens the share panel), or nothing.
 */
type StatusActionState = { error: string } | { published: true } | null;
export type StatusAction = () => Promise<StatusActionState>;

// What useActionState returns: the refusal (or null), the form action, pending.
const StatusActionContext = createContext<readonly [StatusActionState, () => void, boolean] | null>(
  null,
);

/**
 * Runs Publish or Close signup for everything inside it, so the button can
 * sit in one place (`StatusActionButtonForm`) and its refusal in another
 * (`StatusActionRefusal`), such as a full-width line under the header. When
 * the action is refused it returns why, and that shows instead of nothing
 * happening. One scope can serve more than one button, as Publish's serves
 * the computer's header and the phone's bar.
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

/** Whether Publish or Close signup is in flight, for controls outside its form. */
export function useStatusActionPending(): boolean {
  return useContext(StatusActionContext)?.[2] ?? false;
}

/** What Publish or Close signup last answered, null before either is pressed. */
export function useStatusActionState(): StatusActionState {
  return useContext(StatusActionContext)?.[0] ?? null;
}

/** Why Publish or Close signup was refused, or nothing until it is. */
export function StatusActionRefusal({ className }: { className?: string }) {
  const state = useContext(StatusActionContext)?.[0];
  return state && 'error' in state ? (
    <div className={className}>
      <FormError>{state.error}</FormError>
    </div>
  ) : null;
}
