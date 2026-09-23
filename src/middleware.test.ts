import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { organizerCallbackPath } from './middleware';

function requestFor(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`);
}

describe('organizerCallbackPath', () => {
  it('includes the path and query', () => {
    expect(organizerCallbackPath(requestFor('/app/signups/abc/build?tab=fields'))).toBe(
      '/app/signups/abc/build?tab=fields',
    );
  });

  it('includes the dashboard path', () => {
    expect(organizerCallbackPath(requestFor('/app'))).toBe('/app');
  });
});
