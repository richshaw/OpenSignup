# OG-image font

`Inter-latin-600.ttf` is a **static**, Latin-subset build of Inter at weight 600,
used only by `scripts/generate-og-image.mjs` to render the committed social-share
images (`src/app/opengraph-image.png`, `twitter-image.png`, `apple-icon.png`).

It exists because Satori (inside `@vercel/og`, which powers `next/og`) cannot parse
the app's *variable* font `src/app/fonts/InterVariable.ttf` — its parser trips on the
`fvar` table. A fully-instanced static face sidesteps that.

It is **not** shipped to the browser or used by the running app; the app still uses
`InterVariable.ttf`.

## Regenerate

Requires [`fonttools`](https://pypi.org/project/fonttools/) (`pip install fonttools`):

```bash
# 1. Pin BOTH variable axes (opsz + wght) to produce a static face.
python3 -m fontTools.varLib.instancer src/app/fonts/InterVariable.ttf \
  opsz=14 wght=600 -o /tmp/inter-static.ttf

# 2. Subset to Latin + the punctuation the layout uses (·, —, …).
python3 -m fontTools.subset /tmp/inter-static.ttf \
  --unicodes="U+0020-00FF,U+2010-2027,U+2032-2033,U+20AC,U+2122" \
  --output-file=scripts/og-font/Inter-latin-600.ttf
```

Inter is licensed under the SIL Open Font License 1.1.
