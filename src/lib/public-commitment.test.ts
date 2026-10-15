import { describe, it, expect } from 'vitest';
import { withoutServerOnlyHashes } from '@/lib/public-commitment';

const row = {
  id: 'com_1',
  status: 'confirmed',
  editTokenHash: 'deadbeef',
  idempotencyKeyHash: 'cafebabe',
};

describe('withoutServerOnlyHashes', () => {
  it('drops server-only hashes and keeps public fields', () => {
    const publicRow = withoutServerOnlyHashes(row);

    expect(publicRow).toStrictEqual({ id: 'com_1', status: 'confirmed' });
    expect(publicRow).not.toHaveProperty('editTokenHash');
    expect(publicRow).not.toHaveProperty('idempotencyKeyHash');
  });

  it('does not mutate the row it was given', () => {
    withoutServerOnlyHashes(row);

    expect(row.editTokenHash).toBe('deadbeef');
    expect(row.idempotencyKeyHash).toBe('cafebabe');
  });
});
