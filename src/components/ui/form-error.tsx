import type { ReactNode } from 'react';

/** Why an action just failed, by the form or button it came from. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
      {children}
    </p>
  );
}
