import { describe, expect, it } from 'vitest';
import { TOOLS } from '@/mcp/tools';

// The article says allowing "See who has signed up" gives an assistant
// nothing, because no tool needs that permission. A tool that does makes the
// sentence false: change the article, and this test, in the same change.
describe('connect-an-ai-assistant: participant details', () => {
  it('no assistant tool needs the permission the article says does nothing', () => {
    expect(TOOLS.filter((t) => t.scope === 'commitments:read').map((t) => t.name)).toEqual([]);
  });
});
