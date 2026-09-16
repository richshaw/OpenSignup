import type { ToolContext } from '../context';

/** A unit-test context: one owner in one workspace, arrived through app `c`. */
export function unitContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    db: {} as ToolContext['db'],
    actor: {
      kind: 'organizer',
      id: 'org_1',
      email: 'a@example.com',
      workspaceIds: ['ws_1'],
      workspaceRoles: { ws_1: 'owner' },
      via: { clientId: 'c' },
    },
    scopes: ['signups:read', 'signups:write'],
    clientId: 'c',
    defaultWorkspaceId: 'ws_1',
    workspaces: [{ id: 'ws_1', slug: 'w', name: 'W', role: 'owner' }],
    ...overrides,
  };
}

/** A signup row as the services return it, for mocked service results. */
export function signupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sig_1',
    slug: 'bake-sale',
    title: 'Bake sale',
    description: 'Bring cakes',
    status: 'draft',
    visibility: 'unlisted',
    closesAt: null,
    settings: { groupByFieldRefs: [] },
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-02T00:00:00Z'),
    workspaceId: 'ws_1',
    organizerId: 'org_1',
    deletedAt: null,
    tags: [],
    ...overrides,
  };
}
