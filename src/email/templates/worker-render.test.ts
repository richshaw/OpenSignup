import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const run = promisify(execFile);

const repoRoot = resolve(import.meta.dirname, '../../..');

function workerScript(): string {
  const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const script = pkg.scripts?.worker;
  if (!script) throw new Error('package.json has no "worker" script');
  return script;
}

/**
 * Guards the reminder worker's JSX transform.
 *
 * Email templates are compiled twice by two different toolchains: by Next.js
 * for the web process, and by `tsx` for `pnpm worker`. Vitest applies its own
 * transform, so a normal render test passes even when the worker cannot render
 * the same template at all — which is exactly what happened: with
 * `"jsx": "preserve"` in tsconfig.json, tsx emitted classic
 * `React.createElement` calls against templates written for the automatic
 * runtime, and every reminder job died on `React is not defined` with nothing
 * in the test suite to notice.
 *
 * So this test shells out to the worker's real toolchain rather than importing
 * the templates directly. The set it covers is whatever
 * scripts/render-email-templates.ts lists — the sendable templates, plus the
 * shared layout they all compose. If it fails, reminder emails are broken in
 * production even though every other email test is green.
 */
describe('email templates under the worker toolchain', () => {
  it('renders each sendable template under the flags the worker script uses', async () => {
    // Derived from package.json rather than hardcoded, so reverting the
    // `worker` script — or a deployment invoking tsx directly, which
    // docker-compose.prod.yml did before this change — fails here instead of
    // staying green while reminder emails break again.
    const script = workerScript();
    const flags = script.split(/\s+/).slice(1, -1);
    const { stdout } = await run(
      'pnpm',
      ['exec', 'tsx', ...flags, 'scripts/render-email-templates.ts'],
      { cwd: repoRoot },
    );
    expect(stdout).toContain('ok magic-link');
    expect(stdout).toContain('ok commitment-confirmation');
    expect(stdout).toContain('ok reminder');
  }, 60_000);

  it('ships every tsconfig the worker script needs in the runner image', async () => {
    // CI has no docker build step, so nothing else catches a tsconfig that the
    // worker command references but the image never receives. tsx hard-errors
    // on a missing tsconfig, so the worker would crash-loop on deploy.
    const referenced = [...workerScript().matchAll(/--tsconfig\s+(\S+)/g)].map(
      (m) => m[1] as string,
    );
    expect(referenced.length).toBeGreaterThan(0);

    const dockerfile = readFileSync(resolve(repoRoot, 'Dockerfile'), 'utf8');
    for (const path of referenced) {
      expect(dockerfile).toMatch(new RegExp(`COPY .*/${path}\\b`));
    }
  });
});
