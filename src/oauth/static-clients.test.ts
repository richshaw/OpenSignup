import { describe, expect, it } from 'vitest';
import { parseStaticClients } from './static-clients';

describe('parseStaticClients', () => {
  it('returns [] for unset or blank', () => {
    expect(parseStaticClients(undefined)).toEqual([]);
    expect(parseStaticClients('  ')).toEqual([]);
  });
  it('parses a valid list', () => {
    expect(
      parseStaticClients(
        '[{"client_id":"inspector","client_name":"MCP Inspector","redirect_uris":["http://localhost:6274/oauth/callback"]}]',
      ),
    ).toEqual([
      {
        client_id: 'inspector',
        client_name: 'MCP Inspector',
        redirect_uris: ['http://localhost:6274/oauth/callback'],
      },
    ]);
  });
  it('rejects malformed JSON, bad shapes and duplicates with a pointed message', () => {
    expect(() => parseStaticClients('{')).toThrow(/JSON array/);
    expect(() => parseStaticClients('[{"client_id":"a"}]')).toThrow(/0\.client_name/);
    expect(() => parseStaticClients('[{"client_id":"a","client_name":"A","redirect_uris":["nope"]}]')).toThrow(
      /redirect_uris/,
    );
    const dup =
      '[{"client_id":"a","client_name":"A","redirect_uris":["https://a/cb"]},{"client_id":"a","client_name":"B","redirect_uris":["https://b/cb"]}]';
    expect(() => parseStaticClients(dup)).toThrow(/duplicate/);
  });
});
