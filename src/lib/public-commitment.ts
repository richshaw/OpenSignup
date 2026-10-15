/** Server-only commitment check values never leave the server. */
export function withoutServerOnlyHashes<
  T extends { editTokenHash: string; idempotencyKeyHash: string | null },
>(
  row: T,
): Omit<T, 'editTokenHash' | 'idempotencyKeyHash'> {
  const {
    editTokenHash: _editTokenHash,
    idempotencyKeyHash: _idempotencyKeyHash,
    ...publicRow
  } = row;
  return publicRow;
}
