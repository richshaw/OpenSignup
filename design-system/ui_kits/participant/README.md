# Participant UI kit — `/s/[slug]`

The public, link-only surface participants land on. **No login. One task: sign up for a slot.** This is the most important screen in the product — design accordingly.

## What's here

- `index.html` — interactive prototype. Lands on a real signup page, lets you click a slot, fills the dialog, confirms.
- `SlotRow.jsx` — the atomic row.
- `CommitDialog.jsx` — bottom-sheet on mobile, centered modal on `sm:`. Form + success state.

## Running it

The prototype uses in-browser Babel to load the `.jsx` files, which means **it must be served over HTTP** — double-clicking `index.html` (a `file://` URL) won't work because Chrome blocks XHR for local files. From the repo root:

```bash
python3 -m http.server 8000 --directory design-system
# then open http://localhost:8000/ui_kits/participant/index.html
```

## Reference

Built directly from `src/app/s/[slug]/page.tsx`, `signup-view.tsx`, `commit-dialog.tsx` in the OpenSignup repo. Layout: `container-tight` (720px max), white page, hairline cards.
