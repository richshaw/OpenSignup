/**
 * Renders each sendable email template and exits non-zero if any of them
 * throws, leaves out what it must say, or declares the wrong language. Shared
 * pieces under src/email/templates (layout.tsx) are covered transitively,
 * since every sendable template composes them. The templates, their props
 * and what each must render, in English and in Swedish, are in
 * scripts/lib/email-samples.ts. A participant template takes its text from the
 * catalog in its language, so a catalog the worker can't load, or a message
 * missing from it, fails here.
 *
 * Exists to be run under the *worker's* toolchain (`tsx --tsconfig
 * tsconfig.worker.json`), which is the only place templates are compiled
 * outside Next.js. See src/email/templates/worker-render.test.ts for why that
 * distinction matters.
 */
import { renderEmail } from '@/email/render';
import { emailSamples } from './lib/email-samples';

async function main(): Promise<void> {
  for (const { name, element, expect, lang } of emailSamples) {
    const { html, text } = await renderEmail(element);
    if (!html.trim() || !text.trim()) {
      throw new Error(`${name} rendered empty output`);
    }
    if (!new RegExp(`<html[^>]* lang="${lang}"`).test(html)) {
      throw new Error(`${name} html doesn't declare lang="${lang}"`);
    }
    if (expect.length === 0) {
      throw new Error(`${name} has no expected content; add some`);
    }
    for (const needle of expect) {
      for (const [format, body] of [
        ['html', html],
        ['text', text],
      ] as const) {
        // Plain text wraps at 80 columns, so any space may come out as a newline.
        if (!body.replace(/\s+/g, ' ').includes(needle)) {
          throw new Error(`${name} ${format} output is missing ${JSON.stringify(needle)}`);
        }
      }
    }
    console.log(`ok ${name}`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
