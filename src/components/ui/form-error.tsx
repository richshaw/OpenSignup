import type { ReactNode, Ref } from 'react';

const BOX = 'rounded-lg px-3 py-2 text-sm';

/**
 * Why an action just failed, by the form or button it came from. A `div`, so
 * it can hold a suggestion or links under the message.
 */
export function FormError({ children, ref }: { children: ReactNode; ref?: Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} role="alert" className={`${BOX} bg-danger/10 text-danger`}>
      {children}
    </div>
  );
}

/** That an action just worked, in the same box as `FormError`. */
export function SuccessNotice({ children }: { children: ReactNode }) {
  return (
    <div role="status" className={`${BOX} bg-success/10 text-success`}>
      {children}
    </div>
  );
}
