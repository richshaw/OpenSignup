/**
 * `pnpm email:dev`: every sendable email at http://localhost:3001, rendered
 * from the samples in scripts/lib/email-samples.ts, as HTML and as the
 * plain-text part. `tsx watch` restarts this whenever a template changes, so
 * reloading the page shows the edit.
 *
 * Runs under the worker's toolchain (`tsx --tsconfig tsconfig.worker.json`),
 * like scripts/render-email-templates.ts, so a template that renders here
 * renders in `pnpm worker` too.
 */
import { createServer } from 'node:http';
import { renderEmail } from '@/email/render';
import { emailSamples } from './lib/email-samples';

const PORT = 3001;

const samples = new Map(emailSamples.map(({ name, element }) => [name, element]));

const index = `<!doctype html>
<meta charset="utf-8">
<title>Email previews</title>
<body style="font-family: system-ui, sans-serif; margin: 2rem">
<h1>Email previews</h1>
<ul>
${emailSamples
  .map(({ name }) => `<li><a href="/${name}">${name}</a> · <a href="/${name}.txt">text</a></li>`)
  .join('\n')}
</ul>
</body>`;

const server = createServer((req, res) => {
  // Split rather than `new URL()`, which throws on a target like `//[` and
  // would take the server down.
  const path = ((req.url ?? '/').split('?')[0] ?? '').slice(1);
  if (path === '') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(index);
    return;
  }
  const asText = path.endsWith('.txt');
  const node = samples.get(asText ? path.slice(0, -'.txt'.length) : path);
  if (!node) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('No such email\n');
    return;
  }
  renderEmail(node).then(
    ({ html, text }) => {
      res
        .writeHead(200, {
          'content-type': asText ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8',
        })
        .end(asText ? text : html);
    },
    (err: unknown) => {
      res
        .writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
        .end(err instanceof Error ? (err.stack ?? err.message) : String(err));
    },
  );
});

// Every interface, as react-email's preview did, so a phone on the same
// network or a browser outside a container can open it. It serves only the
// samples.
server.listen(PORT, () => {
  console.log(`Email previews at http://localhost:${PORT}`);
});
