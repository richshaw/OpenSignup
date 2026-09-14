import { z } from 'zod';
import { ok } from '@/lib/result';
import { defineTool } from '../registry';

export const listWorkspaces = defineTool({
  name: 'list_workspaces',
  scope: 'signups:read',
  title: 'List workspaces',
  description:
    'The workspaces this account belongs to, with the role in each. Every other tool acts in the default workspace unless you pass workspaceId. A viewer role cannot create or change anything.',
  annotations: { readOnlyHint: true },
  inputSchema: z.object({}),
  handler: async (ctx) =>
    ok({
      workspaces: ctx.workspaces.map((w) => ({ ...w, isDefault: w.id === ctx.defaultWorkspaceId })),
    }),
});
