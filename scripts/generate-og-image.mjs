/**
 * Dev-only: regenerate the static social/share images committed under
 * `src/app/` — `opengraph-image.png`, `twitter-image.png` (Open Graph + Twitter
 * card, 1200×630) and `apple-icon.png` (180×180 home-screen icon).
 *
 * Uses `next/og` (Satori + resvg, both bundled with Next — no browser, no
 * network, no extra deps) to render on-brand layouts to PNG buffers. NOT part
 * of `pnpm build` or CI: the build just serves the committed PNGs. Re-run after
 * changing brand colors, the wordmark, or the hero copy:
 *
 *   node scripts/generate-og-image.mjs
 *
 * Font: Satori cannot parse the app's *variable* InterVariable.ttf, so a single
 * static-weight (600) Inter, subset to Latin, is committed under scripts/og-font/
 * and used here. See scripts/og-font/README.md for how it was produced. The hero
 * text is intentionally hardcoded to the upstream "OpenSignup" branding;
 * self-hosters who want their own name on the share image can edit the copy
 * below and re-run (Latin glyphs only with this subset font).
 */
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';

// `next/og` is a CJS shim without an ESM `exports` entry, so resolve it through
// require rather than a bare ESM import.
const require = createRequire(import.meta.url);
const { ImageResponse } = require('next/og.js');

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = join(scriptDir, '..', 'src', 'app');
const inter = await readFile(join(scriptDir, 'og-font', 'Inter-latin-600.ttf'));

const C = {
  surface: '#ffffff',
  ink: '#0b1220',
  inkMuted: '#5b6474',
  brand: '#1f6feb',
  sunk: '#eef1f5',
  success: '#1a7f4a',
};

const h = React.createElement;

// Satori reads font data directly (no system fonts). The same variable TTF is
// registered at the weights the layout uses.
const fonts = [400, 500, 600, 700].map((weight) => ({
  name: 'Inter',
  data: inter,
  weight,
  style: 'normal',
}));

const ogTree = h(
  'div',
  {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      background: C.surface,
      color: C.ink,
      padding: '80px',
      fontFamily: 'Inter',
    },
  },
  h(
    'div',
    { style: { display: 'flex', alignItems: 'center', gap: '18px' } },
    h(
      'div',
      {
        style: {
          width: '72px',
          height: '72px',
          borderRadius: '18px',
          background: C.brand,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '38px',
          fontWeight: 700,
          letterSpacing: '-0.02em',
        },
      },
      'OS',
    ),
    h('div', { style: { display: 'flex', fontSize: '34px', fontWeight: 600, letterSpacing: '-0.02em' } }, 'OpenSignup'),
  ),
  h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: '30px' } },
    h(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          border: `1px solid ${C.sunk}`,
          borderRadius: '999px',
          padding: '12px 22px',
          fontSize: '22px',
          color: C.inkMuted,
          fontWeight: 500,
        },
      },
      h('div', { style: { display: 'flex', width: '12px', height: '12px', borderRadius: '999px', background: C.success } }),
      'Ad-free · No accounts for participants',
    ),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', fontSize: '96px', fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.02 } },
      h('div', { style: { display: 'flex' } }, 'Sign-up sheets,'),
      h('div', { style: { display: 'flex', color: C.inkMuted } }, 'redone.'),
    ),
    h(
      'div',
      { style: { display: 'flex', fontSize: '30px', color: C.inkMuted, maxWidth: '920px', lineHeight: 1.4 } },
      'Coordinate snack rotations, potlucks, volunteer shifts, and carpools — share a link, no accounts required.',
    ),
  ),
);

const appleTree = h(
  'div',
  {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: C.brand,
      color: '#fff',
      fontFamily: 'Inter',
      fontSize: '92px',
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
  },
  'OS',
);

async function toPng(tree, width, height) {
  return Buffer.from(await new ImageResponse(tree, { width, height, fonts }).arrayBuffer());
}

const ogPng = await toPng(ogTree, 1200, 630);
await writeFile(join(appDir, 'opengraph-image.png'), ogPng);
await writeFile(join(appDir, 'twitter-image.png'), ogPng);
await writeFile(join(appDir, 'apple-icon.png'), await toPng(appleTree, 180, 180));

console.log('Wrote opengraph-image.png, twitter-image.png, apple-icon.png to src/app/');
