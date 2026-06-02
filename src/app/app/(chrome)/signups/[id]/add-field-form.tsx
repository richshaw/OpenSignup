'use client';

import { useState } from 'react';
import { AsyncSubmitButton } from '@/components/ui/async-submit-button';

interface AddFieldFormProps {
  action: (formData: FormData) => void | Promise<void>;
}

export default function AddFieldForm({ action }: AddFieldFormProps) {
  const [fieldType, setFieldType] = useState<'text' | 'date' | 'time' | 'number' | 'enum'>('text');

  return (
    <form
      action={action}
      className="grid grid-cols-1 gap-3 rounded-xl border border-surface-sunk bg-white p-5 sm:grid-cols-[1fr_140px_auto] sm:items-end"
    >
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Label</span>
        <input
          type="text"
          name="label"
          required
          placeholder="e.g., Date, Teacher, Subject"
          className="focus:border-brand focus:ring-brand w-full rounded-lg border border-surface-sunk px-3 py-2 focus:outline-none focus:ring-1"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Type</span>
        <select
          name="fieldType"
          value={fieldType}
          onChange={(e) => setFieldType(e.target.value as typeof fieldType)}
          className="focus:border-brand focus:ring-brand block min-h-[42px] w-full appearance-none rounded-lg border border-surface-sunk bg-white px-3 py-2 focus:outline-none focus:ring-1"
        >
          <option value="text">Text</option>
          <option value="date">Date</option>
          <option value="time">Time</option>
          <option value="number">Number</option>
          <option value="enum">Enum</option>
        </select>
      </label>
      <AsyncSubmitButton
        loadingLabel="Adding…"
        className="bg-brand rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:brightness-90"
      >
        Add field
      </AsyncSubmitButton>
      {fieldType === 'enum' ? (
        <label className="block sm:col-span-3">
          <span className="mb-1 block text-sm font-medium">Choices (one per line)</span>
          <textarea
            name="choices"
            rows={3}
            placeholder={'Math\nScience\nHistory'}
            className="focus:border-brand focus:ring-brand w-full rounded-lg border border-surface-sunk px-3 py-2 focus:outline-none focus:ring-1"
          />
        </label>
      ) : null}
    </form>
  );
}
