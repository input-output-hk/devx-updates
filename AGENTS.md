<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Where to read before writing code

**Next.js 16 (bundled docs — `node_modules/next/dist/docs/`).** This repo pins
Next.js **16.4.3**. Read the guide for what you're touching before writing it:

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

## Dijkstra progress tracking: who reads what

- **Developers track progress in the GitHub project**
  [alwaystrueio/projects/1](https://github.com/orgs/alwaystrueio/projects/1)
  ("Dijkstra outreach"). It holds one issue per component on the
  `/map/dijkstra` critical-path graph, in the private repo
  `alwaystrueio/dijkstra-readiness`. Each issue links to the external issues
  and PRs that the maintainers own. Outreach (who was contacted, when, and
  where) and day-to-day status live there, not in this repo.
- **The website is for executives and non-developers.** It is the
  evidence-backed summary of readiness. Don't use it as a coordination tool, and
  don't add developer-only workflow state to it.
- **Critical path** means every box on the `/map/dijkstra` graph, including the
  standalone fixes, not just the bold longest chain. Every tracking issue
  carries the `critical-path` label.
- **Status values:** Not reached out → Reached out → Work in progress → Ready
  for hard fork, plus Dismissed for components that turn out not to be needed.
  Changing the Status options through the API clears every item's status, so
  save the statuses first and restore them afterwards.
- **Outreach is done by a person, not tooling.** Don't open issues or post
  comments on maintainers' repositories. While the tracking repo is private,
  links to external issues stay invisible to their maintainers. Making the repo
  public shows them a "mentioned this" backlink on each linked issue.
