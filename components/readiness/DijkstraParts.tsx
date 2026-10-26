import Link from "next/link";
import Nav from "@/components/Nav";
import { citationUrl, dijkstraSite, type Waiting } from "@/lib/readiness/dijkstra-site";
import type { Citation } from "@/lib/readiness/dijkstra";
import type { Result } from "@/lib/readiness/devnet";

/** Building blocks shared by the Dijkstra overview and its detail pages (devnet, changes, evidence). */

export const DIJKSTRA = "/map/dijkstra";

export const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-block rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] leading-tight text-muted">{children}</span>
);

export const ToolLink = ({ id }: { id: string }) => <Link href={`/map/readiness/${id}`} className="font-medium">{id}</Link>;

export const OUTCOME = { pass: "text-status-done", fail: "text-status-blocked" } as const;

export const HANDLING = {
  "own-work": ["Own code must change", "text-status-blocked"],
  prepared: ["Already has Dijkstra cases", "text-status-progress"],
  generic: ["Era-generic", "text-status-progress"],
  undetermined: ["Undetermined", "text-muted"],
} as const;

/** A devnet result's subject: a cited change (on the changes page) or a tool. */
export function Subject({ result }: { result: Result }) {
  return result.kind === "change"
    ? <Link href={`${DIJKSTRA}/changes#change-${result.id}`} className="font-medium">{result.id}</Link>
    : <ToolLink id={result.id} />;
}

/** Quoted lines, each linking to the exact line at the revision that was read. */
export function Evidence({ lead }: { lead: { evidence: Citation[] } }) {
  return <ul className="mt-1 space-y-1">{lead.evidence.map((c) => (
    <li key={`${c.path}:${c.line}`} className="text-xs">
      <a href={citationUrl(c)} target="_blank" rel="noreferrer" className="break-all">{c.path}:{c.line}</a>
      <code className="mt-0.5 block overflow-x-auto whitespace-pre text-muted">{c.quote}</code>
    </li>
  ))}</ul>;
}

/** Tools grouped by the component they wait on, one collapsed row per component. */
export function WaitingList({ groups }: { groups: Waiting[] }) {
  return <div className="mt-4 space-y-2">{groups.map((g) => (
    <details key={`${g.via}:${g.unread}`} className="rounded-xl border border-border bg-surface px-4 py-3">
      <summary className="cursor-pointer text-sm">
        <span className="font-medium">{g.via}</span> <span className="text-muted">· {g.status} · {g.tools.length} {g.tools.length === 1 ? "tool" : "tools"}</span>
      </summary>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">{g.tools.map((t) => (
        <li key={t.tool}><ToolLink id={t.tool} /> <span className="text-xs text-muted">{t.surfaces.join(", ")}</span></li>
      ))}</ul>
    </details>
  ))}</div>;
}

const PAGES = [
  { href: DIJKSTRA, label: "Overview" },
  { href: `${DIJKSTRA}/devnet`, label: "Devnet run" },
  { href: `${DIJKSTRA}/changes`, label: "What changes" },
  { href: `${DIJKSTRA}/evidence`, label: "Evidence" },
];

/** Page frame for the Dijkstra pages: eyebrow, title, site nav, and links between the overview and its details. */
export function DijkstraFrame({ title, current, children }: { title: string; current: string; children: React.ReactNode }) {
  const site = dijkstraSite();
  return <div className="map-view" style={{ overflow: "visible" }}>
    <div className="mx-auto max-w-7xl space-y-9 px-4 py-7 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-xs uppercase tracking-widest text-muted">Cardano tooling · Protocol version 12 · Node 11.2</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        </div>
        <Nav />
      </div>
      <nav aria-label="Dijkstra pages" className="-mt-4 flex flex-wrap gap-2">{PAGES.map((p) => (
        <Link key={p.href} href={p.href} aria-current={p.href === current ? "page" : undefined}
          className={`rounded-full border px-3 py-1 text-sm no-underline ${p.href === current ? "border-foreground bg-surface-2 font-medium text-foreground" : "border-border bg-surface text-muted hover:text-foreground"}`}>
          {p.label}
        </Link>
      ))}</nav>
      {children}
      <p className="text-xs text-muted">
        Classification {site.classification.generatedAt.slice(0, 10)} · boundary register {site.boundary.retrieved} · leads reviewed {site.leads.reviewed} · devnet run {site.devnet.run.date}.
        Registers: content/readiness/dijkstra.
      </p>
    </div>
  </div>;
}
