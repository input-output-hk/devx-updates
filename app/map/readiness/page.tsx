import type { Metadata } from "next";
import Link from "next/link";
import Nav from "@/components/Nav";
import DeferredComparison from "@/components/readiness/DeferredComparison";
import Dashboard from "@/components/readiness/Dashboard";
import { readinessSnapshot, reviewQueue } from "@/lib/readiness/site";
import { readinessSiteReports } from "@/lib/readiness/site-reports";

export const metadata: Metadata = { title: "Dependency coverage and hardfork readiness", description: "Evidence-backed dependency coverage, unresolved work, and upstream impact for Cardano tools." };

export default function ReadinessPage() {
  const snapshot = readinessSnapshot();
  const { manifest } = readinessSiteReports();
  const profileCounts = Object.fromEntries(snapshot.tools.map((t) => [t.id, snapshot.profiles.filter((p) => p.toolId === t.id).length]));
  const reviewed = reviewQueue();
  return <div className="map-view" style={{ overflow: "visible" }}>
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-7 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="mb-2 text-xs uppercase tracking-widest text-muted">Cardano tooling · Evidence snapshot</p><h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Dependency coverage</h1></div><Nav /></div>
      <p className="max-w-3xl text-muted">Trace the dependencies behind each tool, expose missing evidence, and find shared components to investigate first. Every tool stays in the inventory, even when its source or dependencies cannot yet be resolved.</p>
      <div className="rounded-xl border border-status-progress/40 bg-status-progress/5 px-5 py-4"><p className="font-semibold">This view measures dependency evidence, not hardfork compatibility.</p><p className="mt-1 text-sm text-muted">Which tools Dijkstra breaks and what each fix unlocks is on the <Link href="/map/dijkstra">Dijkstra readiness</Link> page. Node 11.2 devnet tests come later. Unknown coverage is never a pass.</p></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
        [snapshot.tools.length, "Tools accounted for", "Full catalog denominator"],
        [snapshot.tools.filter((t) => t.lastSuccess).length, "Source revisions found", "Artifact mapping still needs review"],
        [Object.values(profileCounts).filter(Boolean).length, "Tools with native profiles", `${snapshot.profiles.length} release/configuration profiles`],
        [snapshot.tools.filter((t) => t.resolution === "unresolved").length, "Need native resolution", "Visible in the work queue"],
      ].map(([count, label, detail]) => <div key={label} className="rounded-xl border border-border bg-surface p-4 sm:p-5"><div className="font-display text-3xl font-semibold tabular-nums">{count}</div><div className="mt-2 text-sm font-medium">{label}</div><div className="mt-1 text-xs text-muted">{detail}</div></div>)}</div>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted"><span>Snapshot: {snapshot.generatedAt.slice(0, 10)} · {snapshot.semanticDigest.slice(0, 12)}</span><span>{reviewed.filter((r) => r.status === "pending").length} manual review packets pending · Evidence is collected separately from the site build</span></div>
      <Dashboard tools={snapshot.tools} manifest={manifest} profileCounts={profileCounts} asOf={snapshot.generatedAt} />
      <DeferredComparison reference={manifest.reports.comparison} available={manifest.hasComparison} />
    </div>
  </div>;
}
