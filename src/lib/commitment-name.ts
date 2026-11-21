import { sql } from 'drizzle-orm';
import { commitments } from '@/db/schema/commitments';
import { participants } from '@/db/schema/participants';

/**
 * The name a sign-up was made under, for any query that joins a commitment to
 * its participant: the commitment's own, else (on a sign-up made before
 * commitments kept one) the participant's.
 */
export const commitmentName = sql<string>`coalesce(${commitments.name}, ${participants.name})`;
