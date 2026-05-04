import type { GridField } from './useGridState';

interface CellInputProps {
  field: GridField;
  value: string;
  onChange: (value: string) => void;
  onClick?: (e: React.MouseEvent) => void;
}

/** Shared input style classes applied to every input/select variant. */
const inputClass =
  'border-none bg-transparent w-full font-inherit text-[13px] text-ink ' +
  'focus:outline-none focus:ring-2 focus:ring-brand focus:ring-inset focus:ring-offset-[-2px] ' +
  'px-2 py-2 placeholder:text-ink-soft';

interface EnumConfig {
  choices: string[];
}

export function CellInput({ field, value, onChange, onClick }: CellInputProps) {
  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    onClick?.(e);
  }

  if (field.type === 'enum') {
    const config = field.config as unknown as EnumConfig;
    const choices = config.choices ?? [];
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={handleClick}
        className={inputClass}
      >
        <option value="">—</option>
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
    );
  }

  const typeMap: Record<string, string> = {
    text: 'text',
    date: 'date',
    time: 'time',
    number: 'number',
  };

  const inputType = typeMap[field.type] ?? 'text';

  if (field.type === 'number') {
    return (
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={handleClick}
        className={inputClass}
      />
    );
  }

  return (
    <input
      type={inputType}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={handleClick}
      className={inputClass}
    />
  );
}
