interface CapacityCellProps {
  rowId: string;
  capacity: number | null;
  onChange: (rowId: string, capacity: number | null) => void;
}

const inputClass =
  'border-none bg-transparent w-full font-inherit text-[13px] text-ink ' +
  'focus:outline-none focus:ring-2 focus:ring-brand focus:ring-inset focus:ring-offset-[-2px] ' +
  'px-2 py-2 placeholder:text-ink-soft';

export function CapacityCell({ rowId, capacity, onChange }: CapacityCellProps) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.value === '') {
      onChange(rowId, null);
    } else {
      onChange(rowId, Number(e.target.value));
    }
  }

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
  }

  return (
    <input
      type="number"
      min={1}
      step={1}
      value={capacity ?? ''}
      placeholder="∞"
      onChange={handleChange}
      onClick={handleClick}
      className={inputClass}
    />
  );
}
