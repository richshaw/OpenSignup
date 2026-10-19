import type { InputHTMLAttributes, ReactNode, Ref } from 'react';

const INPUT_CLASS =
  'focus:border-brand focus:ring-brand w-full rounded-lg border border-surface-sunk px-4 py-3 focus:outline-none focus:ring-1';

/**
 * A labelled text box on the sign-up sheet or the edit page. `children` render
 * under the box, inside the label, as the email box's "Did you mean" does.
 */
export function Field({
  label,
  className = 'block',
  inputRef,
  children,
  ...input
}: {
  label: string;
  className?: string;
  inputRef?: Ref<HTMLInputElement>;
  children?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={className}>
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input ref={inputRef} {...input} className={INPUT_CLASS} />
      {children}
    </label>
  );
}

/**
 * Notes, and beside it the Spots box when `spots` is given. A slot with one
 * place open (or a sign-up that can only hold one) has nothing to ask, so its
 * form leaves `spots` out and sends no quantity of its own.
 */
export function NotesAndSpots({
  notes,
  spots,
}: {
  notes: { defaultValue?: string; placeholder?: string };
  spots?: { max: number | undefined; defaultValue: number; describedBy: string | undefined };
}) {
  return (
    <div className={spots ? 'grid grid-cols-[1fr_auto] gap-3' : undefined}>
      <Field label="Notes (optional)" type="text" name="notes" maxLength={500} {...notes} />
      {spots ? (
        <Field
          label="Spots"
          className="block w-20"
          type="number"
          name="quantity"
          required
          min={1}
          max={spots.max}
          defaultValue={spots.defaultValue}
          aria-describedby={spots.describedBy}
        />
      ) : null}
    </div>
  );
}
