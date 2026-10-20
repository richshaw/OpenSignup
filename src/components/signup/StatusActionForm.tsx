'use client';

import { createContext, useActionState, useContext, type ReactNode } from 'react';
import { FormError } from '@/components/ui/form-error';

export type StatusAction = () => Promise<{ error: string } | null>;
type StatusActionState = Awaited<ReturnType<StatusAction>>;

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

const StatusActionContext = createContext<{
  state: StatusActionState;
  formAction: () => void;
} | null>(null);

/**
 * Runs Publish or Close signup for everything inside it, so the button can
 * sit in one place (`StatusActionButtonForm`) and its refusal in another
 * (`StatusActionRefusal`), such as a full-width line under the header.
 */
export function StatusActionScope({
  action,
  children,
}: {
  action: StatusAction;
  children: ReactNode;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <StatusActionContext.Provider value={{ state, formAction }}>
      {children}
    </StatusActionContext.Provider>
  );
}

export function StatusActionButtonForm({ children }: { children: ReactNode }) {
  const scope = useContext(StatusActionContext);
  return <form action={scope?.formAction}>{children}</form>;
}

export function StatusActionRefusal() {
  const state = useContext(StatusActionContext)?.state;
  return state ? <FormError>{state.error}</FormError> : null;
}
