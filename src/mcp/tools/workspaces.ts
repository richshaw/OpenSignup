import { z } from 'zod';
import { ok } from '@/lib/result';
import { defineTool } from '../registry';

export const listWorkspaces = defineTool({
  name: 'list_workspaces',
  scope: 'signups:read',
  title: 'List workspaces',
  description:
    'The workspaces this account belongs to, with the role in each. list_signups takes a workspaceId and uses the default workspace without one. Every other tool works out the workspace from the id you pass it. A viewer role cannot create or change anything.',
  annotations: { readOnlyHint: true },
  inputSchema: z.object({}),
  handler: async (ctx) =>
    ok({
      workspaces: ctx.workspaces.map((w) => ({ ...w, isDefault: w.id === ctx.defaultWorkspaceId })),
    }),
});
