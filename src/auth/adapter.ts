import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { eq } from 'drizzle-orm';
import type { AdapterUser } from 'next-auth/adapters';
import { getDb } from '@/db/client';
import { organizers } from '@/db/schema/organizers';
import { workspaceMembers } from '@/db/schema/members';
import { workspaces } from '@/db/schema/workspaces';
import { accounts, sessions, verificationTokens } from '@/db/schema/auth';
import { makeId } from '@/lib/ids';
import { toSlug } from '@/lib/slug';

/**
 * Wraps the standard Drizzle adapter so that when a new organizer is created
 * (first magic-link login), we also create their personal workspace and the
 * owner membership in the same transaction.
 */
export function SignupAdapter() {
  const db = getDb();
  const base = DrizzleAdapter(db, {
    usersTable: organizers,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  });

  return {
    ...base,
    async createUser(user: AdapterUser): Promise<AdapterUser> {
      if (!base.createUser) throw new Error('adapter missing createUser');
      const inserted = await db.transaction(async (tx) => {
        const organizerId = makeId('org');
        const [row] = await tx
          .insert(organizers)
          .values({
            id: organizerId,
            email: user.email,
            name: user.name ?? null,
            emailVerified: user.emailVerified ?? null,
            image: user.image ?? null,
          })
          .returning();
        if (!row) throw new Error('failed to insert organizer');

        const workspaceId = makeId('ws');
        const baseSlug = toSlug(row.name ?? row.email.split('@')[0] ?? 'me', { suffix: true });
        await tx.insert(workspaces).values({
          id: workspaceId,
          slug: baseSlug,
          name: row.name ?? row.email,
          type: 'personal',
          plan: 'free',
        });

        await tx.insert(workspaceMembers).values({
          id: makeId('mem'),
          workspaceId,
          organizerId: row.id,
          role: 'owner',
          status: 'active',
        });

        await tx
          .update(organizers)
          .set({ defaultWorkspaceId: workspaceId })
          .where(eq(organizers.id, row.id));

        return row;
      });
      return {
        id: inserted.id,
        email: inserted.email,
        emailVerified: inserted.emailVerified,
        name: inserted.name,
        image: inserted.image,
      };
    },
  };
}
