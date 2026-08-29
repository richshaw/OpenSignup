import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const run = promisify(execFile);

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
 * the templates directly. If it fails, reminder emails are broken in
 * production even though every other email test is green.
 */
describe('email templates under the worker toolchain', () => {
  it('renders every template with tsx + tsconfig.worker.json', async () => {
    const { stdout } = await run(
      'pnpm',
      ['exec', 'tsx', '--tsconfig', 'tsconfig.worker.json', 'scripts/render-email-templates.ts'],
      { cwd: process.cwd() },
    );
    expect(stdout).toContain('ok magic-link');
    expect(stdout).toContain('ok reminder');
  }, 60_000);
});
