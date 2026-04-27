# Organizer UI kit — `/app/...`

The logged-in surface organizers use to create and manage signups. Faithful to the codebase — admin-grade chrome, narrow column, no decoration.

## What's here

- `index.html` — interactive prototype. Click between Dashboard → Detail → Edit Slot screens.
- `Chrome.jsx` — header bar with breadcrumbs and sign-out.
- `SignupCard.jsx` — dashboard list row.
- `StatusPill.jsx` — `open` / `draft` / `closed` / `archived`.
- `AddSlotForm.jsx` — the inline 4-column slot creator.
- `CommitmentTable.jsx` — the participant table.

## Running it

The prototype uses in-browser Babel to load the `.jsx` files, which means **it must be served over HTTP** — double-clicking `index.html` (a `file://` URL) won't work because Chrome blocks XHR for local files. From the repo root:

```bash
python3 -m http.server 8000 --directory design-system
# then open http://localhost:8000/ui_kits/organizer/index.html
```

## Reference

`src/app/app/(chrome)/layout.tsx`, `page.tsx`, `signups/[id]/page.tsx`, `signups/new/page.tsx`. Layout: max-w-1100, white header with hairline border.
