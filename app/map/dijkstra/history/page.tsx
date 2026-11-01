import type { Metadata } from "next";
import { join } from "node:path";
import { readdirSync } from "node:fs";
import { DijkstraFrame, DIJKSTRA, ToolLink } from "@/components/readiness/DijkstraParts";
import { dijkstraSite } from "@/lib/readiness/dijkstra-site";
import { compareDijkstra, readDijkstraArchive } from "@/lib/readiness/dijkstra-history";
import { HARDFORK_STATES } from "@/lib/readiness/hardfork-states";

export const metadata: Metadata = { title: "Dijkstra readiness history", description: "Compare retained Dijkstra assessments and version-specific devnet results." };

export default function HistoryPage() {
  const current = dijkstraSite();
  const directory = join(process.cwd(), "content/readiness/dijkstra-history");
  const archives = readdirSync(directory, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => readDijkstraArchive(join(directory, d.name))).sort((a, b) => b.manifest.id.localeCompare(a.manifest.id));
  return <DijkstraFrame title="Readiness history" current={`${DIJKSTRA}/history`}>
    <p className="max-w-3xl text-muted">Current assessment: {current.classification.generatedAt.slice(0, 10)}, node {String(current.changes.target.nodeRelease)}. Previous assessments retain their original versions, source decisions and test results. A change in assessment state can reflect new evidence or a changed target; it does not by itself establish a runtime fix.</p>
    {archives.map(({ manifest, site }) => {
      const comparison = compareDijkstra(site, current);
      const matched = comparison.runtime.filter((r) => r.before && r.after);
      return <section key={manifest.id} className="space-y-4">
        <h2 className="font-display text-xl font-semibold">Since {comparison.before.date}</h2>
        <p className="text-sm text-muted">Previous node: <code>{manifest.nodeRevision.slice(0, 10)}</code>. {comparison.tools.length} tool states changed. {matched.length} runtime results have the same check, subject and tool version in both runs; {matched.filter((r) => r.before !== r.after).length} changed outcome. Newly tested versions are listed separately below.</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr className="border-b border-border"><th className="p-3">Tool</th><th className="p-3">Previous</th><th className="p-3">Current</th><th className="p-3">Current evidence</th></tr></thead>
          <tbody>{comparison.tools.map((t) => <tr key={t.tool} className="border-b border-border"><td className="p-3"><ToolLink id={t.tool} /></td><td className="p-3">{t.before ? HARDFORK_STATES[t.before].label : "Not listed"}</td><td className="p-3">{t.after ? HARDFORK_STATES[t.after].label : "Not listed"}</td><td className="p-3 text-muted">{t.reason}</td></tr>)}</tbody>
        </table></div>
        <details className="text-sm"><summary className="cursor-pointer">Component surface changes ({comparison.components.length})</summary><ul className="mt-3 space-y-2">{comparison.components.map((c) => <li key={c.component}><ToolLink id={c.component} />: {c.surfaces.map((s) => `${s.surface}: ${s.before ?? "unassessed"} → ${s.after}`).join("; ")}</li>)}</ul></details>
        <details className="text-sm"><summary className="cursor-pointer">Runtime comparison by tested version</summary><ul className="mt-3 space-y-1">{comparison.runtime.map((r) => <li key={r.key}><code>{r.key}</code>: {r.before ?? "not tested"} → {r.after ?? "not rerun"}</li>)}</ul></details>
        <p className="text-xs text-muted">Retained registers: content/readiness/dijkstra-history/{manifest.id}. Checksums are verified during the site build. Assessment code at capture: {manifest.repositoryRevision.slice(0, 10)}.</p>
      </section>;
    })}
  </DijkstraFrame>;
}
