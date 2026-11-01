type SpinnerProps = {
  className?: string;
};

export function Spinner({ className = 'size-4 border-2' }: SpinnerProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block animate-spin-720 rounded-full border-current border-t-transparent ${className}`}
    />
  );
}
