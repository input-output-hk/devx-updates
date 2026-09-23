<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Where to read before writing code

**Next.js 16 (bundled docs — `node_modules/next/dist/docs/`).** This repo pins
Next.js **16.3.4**. Read the guide for what you're touching before writing it:

- Static export: `01-app/02-guides/static-exports.md` — the whole site is
  `output: 'export'`; know the unsupported features (no `searchParams` in pages,
  no request-time APIs, dynamic routes need `generateStaticParams`).
- Page/route conventions: `01-app/03-api-reference/03-file-conventions/page.md` —
  `params`/`searchParams` are **Promises** (`await` them); sync access is removed.
- Static params for dynamic routes:
  `01-app/03-api-reference/04-functions/generate-static-params.md` — pair with
  `export const dynamicParams = false`.
- Metadata: `01-app/01-getting-started/14-metadata-and-og-images.md`.
- What changed in v16 (start here if something behaves unexpectedly):
  `01-app/02-guides/upgrading/version-16.md` — Turbopack is the default build,
  `middleware` → `proxy`, `next lint` removed, etc.

**Product docs (`docs/`).** Read these for *what* and *why* before changing
behavior or content model:

- `docs/PRD.md` — product requirements: pages, the manual-status-plus-evidence
  model, the weekly workflow, non-goals.
- `docs/ARCHITECTURE.md` — the ADRs: static export, content-as-YAML/Markdown,
  the gatherer (roster + `teamOnly` + repo→deliverable map), CI pipelines,
  `basePath`. Cite the ADR you're implementing.
