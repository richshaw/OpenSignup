import { describe, it, expect } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import { commitments, type Commitment } from '@/db/schema/commitments';
import { PUBLIC_COMMITMENT_FIELDS, toPublicCommitment } from '@/lib/public-commitment';

const row: Commitment = {
  id: 'com_1',
  slotId: 'slot_1',
  signupId: 'sig_1',
  workspaceId: 'ws_1',
  participantId: 'par_1',
  position: 1,
  status: 'confirmed',
  quantity: 1,
  notes: '',
  notesVisibility: 'public',
  customFieldValues: {},
  paymentId: null,
  editTokenHash: 'deadbeef',
  idempotencyKeyHash: 'cafebabe',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  cancelledAt: null,
};

describe('toPublicCommitment', () => {
  it('keeps exactly the listed fields, so the hashes stay on the server', () => {
    const publicRow = toPublicCommitment(row);

    expect(Object.keys(publicRow)).toStrictEqual([...PUBLIC_COMMITMENT_FIELDS]);
    expect(publicRow).not.toHaveProperty('editTokenHash');
    expect(publicRow).not.toHaveProperty('idempotencyKeyHash');
  });

  it('drops a field nobody has listed, as a new column would be', () => {
    const withNewColumn = { ...row, newServerOnlyColumn: 'secret' } as Commitment;

    expect(toPublicCommitment(withNewColumn)).not.toHaveProperty('newServerOnlyColumn');
  });

  it('does not mutate the row it was given', () => {
    toPublicCommitment(row);

    expect(row.editTokenHash).toBe('deadbeef');
    expect(row.idempotencyKeyHash).toBe('cafebabe');
  });
});

describe('PUBLIC_COMMITMENT_FIELDS', () => {
  // Fails when a column is added to `commitments`: decide whether participants
  // see it, then add it to PUBLIC_COMMITMENT_FIELDS or to this list.
  const SERVER_ONLY_FIELDS = ['editTokenHash', 'idempotencyKeyHash'];

  it('covers every commitments column but the server-only ones', () => {
    const columns = Object.keys(getTableColumns(commitments));

    expect([...PUBLIC_COMMITMENT_FIELDS, ...SERVER_ONLY_FIELDS].sort()).toStrictEqual(
      [...columns].sort(),
    );
  });
});
