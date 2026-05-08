import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { eq } from 'drizzle-orm';
import type { AdapterUser } from 'next-auth/adapters';
import { getDb } from '@/db/client';
import { organizers } from '@/db/schema/organizers';
import { workspaceMembers } from '@/db/schema/members';
import { workspaces } from '@/db/schema/workspaces';
import { accounts, sessions, verificationTokens } from '@/db/schema/auth';
import { recordActivity } from '@/lib/activity';
import { makeId } from '@/lib/ids';
import { log } from '@/lib/log';
import { normalizeEmail } from '@/schemas/common';
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
    async getUserByEmail(email: string): Promise<AdapterUser | null> {
      const [row] = await db
        .select()
        .from(organizers)
        .where(eq(organizers.email, normalizeEmail(email)))
        .limit(1);
      if (!row) return null;
      return { id: row.id, email: row.email, emailVerified: row.emailVerified, name: row.name, image: row.image };
    },
    async createUser(user: AdapterUser): Promise<AdapterUser> {
      if (!base.createUser) throw new Error('adapter missing createUser');
      const { row, workspaceId } = await db.transaction(async (tx) => {
        const organizerId = makeId('org');
        const [orgRow] = await tx
          .insert(organizers)
          .values({
            id: organizerId,
            email: normalizeEmail(user.email),
            name: user.name ?? null,
            emailVerified: user.emailVerified ?? null,
            image: user.image ?? null,
          })
          .returning();
        if (!orgRow) throw new Error('failed to insert organizer');

        const newWorkspaceId = makeId('ws');
        const baseSlug = toSlug(orgRow.name ?? orgRow.email.split('@')[0] ?? 'me', {
          suffix: true,
        });
        await tx.insert(workspaces).values({
          id: newWorkspaceId,
          slug: baseSlug,
          name: orgRow.name ?? orgRow.email,
          type: 'personal',
          plan: 'free',
        });

        await tx.insert(workspaceMembers).values({
          id: makeId('mem'),
          workspaceId: newWorkspaceId,
          organizerId: orgRow.id,
          role: 'owner',
          status: 'active',
        });

        await tx
          .update(organizers)
          .set({ defaultWorkspaceId: newWorkspaceId })
          .where(eq(organizers.id, orgRow.id));

        return { row: orgRow, workspaceId: newWorkspaceId };
      });

      // Best-effort telemetry, written outside the onboarding transaction.
      // A failed activity insert here would have aborted the whole tx (a
      // failed statement inside a Postgres tx poisons subsequent queries),
      // so it lives outside and is wrapped in try/catch.
      try {
        await recordActivity(db, {
          signupId: null,
          workspaceId,
          actor: { actorId: row.id, actorType: 'organizer' },
          eventType: 'workspace.created',
          payload: { kind: 'personal' },
        });
      } catch (err) {
        log.warn({ err }, 'recordActivity workspace.created failed');
      }

      return {
        id: row.id,
        email: row.email,
        emailVerified: row.emailVerified,
        name: row.name,
        image: row.image,
      };
    },
  };
}
