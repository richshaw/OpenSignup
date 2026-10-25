'use client';

import { createContext, useActionState, useContext, type ReactNode } from 'react';
import { FormError } from '@/components/ui/form-error';
import type { PublishCheckAnswer } from '@/lib/publish-check';

/**
 * What Publish, Close signup or Reopen signup answers: why it was refused,
 * that it published (which opens the share panel), what Publish's check
 * found (which opens its panel), or nothing.
 */
type StatusActionState = { error: string } | { published: true } | PublishCheckAnswer | null;
/**
 * Publish takes a form saying the organizer chose Publish anyway; Close
 * signup and Reopen signup take none.
 */
export type StatusAction = (form?: FormData) => Promise<StatusActionState>;
/**
 * An action that only changes the signup's status, as Close signup does: it
 * takes no form, and answers null once the status has changed or why it
 * hasn't. What `useAnnouncedStatusChange` takes; Publish is none of these.
 */
export type StatusChangeAction = () => Promise<{ error: string } | null>;

// What useActionState returns: the answer (or null), the form action, pending.
const StatusActionContext = createContext<
  readonly [StatusActionState, (form: FormData) => void, boolean] | null
>(null);

/**
 * Runs Publish, Close signup or Reopen signup for everything inside it, so
 * the button can sit in one place (`StatusActionButtonForm`) and its refusal
 * in another (`StatusActionRefusal`), such as a full-width line under the
 * header. When the action is refused it returns why, and that shows instead
 * of nothing happening. One scope can serve more than one button, as
 * Publish's serves the computer's header and the phone's bar.
 */
export function StatusActionScope({
  action,
  children,
}: {
  action: StatusAction;
  children: ReactNode;
}) {
  const scope = useActionState(
    (_previous: StatusActionState, form: FormData) => action(form),
    null,
  );
  return <StatusActionContext.Provider value={scope}>{children}</StatusActionContext.Provider>;
}

/**
 * Runs the scope's action with `form`, for a button that does some work of
 * its own first (Publish saves the Build tab's edits); call it inside
 * `startTransition`. Nothing outside a scope.
 */
export function useStatusActionDispatch(): ((form: FormData) => void) | null {
  return useContext(StatusActionContext)?.[1] ?? null;
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

/**
 * Whether the scope's Publish, Close signup or Reopen signup is in flight,
 * for controls outside its form.
 */
export function useStatusActionPending(): boolean {
  return useContext(StatusActionContext)?.[2] ?? false;
}

/**
 * What the scope's Publish, Close signup or Reopen signup last answered,
 * null before it's pressed.
 */
export function useStatusActionState(): StatusActionState {
  return useContext(StatusActionContext)?.[0] ?? null;
}

/**
 * Why the scope's Publish, Close signup or Reopen signup was refused, or
 * nothing until it is. `message`, when given, says it instead: Publish
 * stopped before it was sent.
 */
export function StatusActionRefusal({
  className,
  message,
}: {
  className?: string;
  message?: string;
}) {
  const state = useContext(StatusActionContext)?.[0];
  const refusal = message ?? (state && 'error' in state ? state.error : null);
  return refusal ? (
    <div className={className}>
      <FormError>{refusal}</FormError>
    </div>
  ) : null;
}
