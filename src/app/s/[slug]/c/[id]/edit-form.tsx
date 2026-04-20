'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface EditFormProps {
  commitmentId: string;
  token: string;
  initialName: string;
  initialNotes: string;
  initialQuantity: number;
  slug: string;
}

export default function EditForm({
  commitmentId,
  token,
  initialName,
  initialNotes,
  initialQuantity,
  slug,
}: EditFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const data = new FormData(e.currentTarget);
    const body = {
      name: String(data.get('name') ?? ''),
      notes: String(data.get('notes') ?? ''),
      quantity: Number(data.get('quantity') ?? 1),
    };
    const res = await fetch(`/api/commitments/${commitmentId}?token=${encodeURIComponent(token)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await res.json();
    if (!res.ok) {
      setMessage({ kind: 'err', text: payload?.error?.message ?? 'save failed' });
    } else {
      setMessage({ kind: 'ok', text: 'Saved.' });
      router.refresh();
    }
    setSaving(false);
  }

  async function handleCancel() {
    if (!confirm('Cancel this signup? This cannot be undone.')) return;
    setSaving(true);
    const res = await fetch(`/api/commitments/${commitmentId}?token=${encodeURIComponent(token)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      router.push(`/s/${slug}`);
    } else {
      const payload = await res.json().catch(() => null);
      setMessage({ kind: 'err', text: payload?.error?.message ?? 'cancel failed' });
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSave} className="space-y-5 rounded-xl border border-surface-sunk bg-white p-6">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Name</span>
        <input
          type="text"
          name="name"
          required
          defaultValue={initialName}
          className="focus:border-brand focus:ring-brand w-full rounded-lg border border-surface-sunk px-4 py-3 focus:outline-none focus:ring-1"
        />
      </label>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Notes</span>
          <input
            type="text"
            name="notes"
            maxLength={500}
            defaultValue={initialNotes}
            className="focus:border-brand focus:ring-brand w-full rounded-lg border border-surface-sunk px-4 py-3 focus:outline-none focus:ring-1"
          />
        </label>
        <label className="block w-20">
          <span className="mb-1 block text-sm font-medium">Qty</span>
          <input
            type="number"
            name="quantity"
            min={1}
            defaultValue={initialQuantity}
            className="focus:border-brand focus:ring-brand w-full rounded-lg border border-surface-sunk px-4 py-3 focus:outline-none focus:ring-1"
          />
        </label>
      </div>
      {message ? (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            message.kind === 'ok' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
          }`}
        >
          {message.text}
        </p>
      ) : null}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleCancel}
          disabled={saving}
          className="text-danger rounded-lg border border-surface-sunk px-4 py-2 text-sm font-medium transition disabled:opacity-50"
        >
          Cancel signup
        </button>
        <div className="flex-1" />
        <button
          type="submit"
          disabled={saving}
          className="bg-brand rounded-lg px-5 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
