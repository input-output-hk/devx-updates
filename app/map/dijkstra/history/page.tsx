import type { Metadata } from "next";
import { join } from "node:path";
import { readdirSync } from "node:fs";
import { DijkstraFrame, DIJKSTRA, ToolLink } from "@/components/readiness/DijkstraParts";
import { FixOrderDiff, RuntimeDiff, StateShift, StatusGrid } from "@/components/readiness/HistoryDiff";
import { dijkstraSite, type DijkstraSite } from "@/lib/readiness/dijkstra-site";
import { compareDijkstra, readDijkstraArchive } from "@/lib/readiness/dijkstra-history";
import { HARDFORK_STATES, hardforkStateLabel } from "@/lib/readiness/hardfork-states";

export const metadata: Metadata = { title: "Dijkstra readiness history", description: "What changed between retained Dijkstra assessments and their devnet runs." };

interface Assessment { id: string; label: string; site: DijkstraSite; nodeRevision: string; codeRevision?: string }

export default function HistoryPage() {
  const current = dijkstraSite();
  const directory = join(process.cwd(), "content/readiness/dijkstra-history");
  const archived: Assessment[] = readdirSync(directory, { withFileTypes: true }).filter((d) => d.isDirectory())
    .map((d) => readDijkstraArchive(join(directory, d.name)))
    .sort((a, b) => a.manifest.id.localeCompare(b.manifest.id))
    .map(({ manifest, site }) => ({ id: manifest.id, label: manifest.id, site, nodeRevision: manifest.nodeRevision, codeRevision: manifest.repositoryRevision }));
  const all: Assessment[] = [...archived, { id: "current", label: "current", site: current, nodeRevision: current.devnet.run.node.revision }];
  // Each assessment against the one before it, newest first.
  const pairs = all.slice(1).map((after, i) => ({ before: all[i], after })).reverse();
  return <DijkstraFrame title="Readiness history" current={`${DIJKSTRA}/history`}>
    <p className="max-w-3xl text-muted">
      What changed from one assessment to the next. Current assessment: {current.classification.generatedAt.slice(0, 10)}, devnet
      run {current.devnet.run.date} on node {String(current.changes.target.nodeRelease)}. Earlier assessments keep their original
      versions, source decisions and test results. A change in state can reflect new evidence or a changed target; on its own it
      does not establish a runtime fix.
    </p>
    <nav aria-label="Comparisons" className="flex flex-wrap gap-2 text-sm">{pairs.map(({ before, after }) => {
      const c = compareDijkstra(before.site, after.site);
      return <a key={after.id} href={`#since-${before.id}`} className="rounded-full border border-border bg-surface px-3 py-1 no-underline text-muted hover:text-foreground">
        {c.before.date} → {c.after.date}
      </a>;
    })}</nav>
    {pairs.map(({ before, after }) => {
      const comparison = compareDijkstra(before.site, after.site);
      const nodeChanged = before.nodeRevision !== after.nodeRevision;
      return <section key={after.id} id={`since-${before.id}`} className="scroll-mt-24 space-y-4 border-t border-border pt-6">
        <div>
          <h2 className="font-display text-2xl font-semibold">{comparison.before.date} → {comparison.after.date}</h2>
          <p className="mt-1 text-sm text-muted">
            {nodeChanged
              ? <>Node changed: <code>{before.nodeRevision.slice(0, 10)}</code> → <code>{after.nodeRevision.slice(0, 10)}</code>. Results tested against a different node are not directly comparable.</>
              : <>Same node in both runs (<code>{after.nodeRevision.slice(0, 10)}</code>), so changes come from the tools.</>}
            {" "}Earlier registers: content/readiness/dijkstra-history/{before.id}.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <StateShift comparison={comparison} />
          <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
            <h3 className="text-sm font-medium">Tools that changed state ({comparison.tools.length})</h3>
            {comparison.tools.length === 0
              ? <p className="mt-2 text-sm text-muted">No tool changed state.</p>
              : <ul className="mt-3 space-y-2 text-sm">{comparison.tools.map((t) => <li key={t.tool}>
                <div className="flex flex-wrap items-center gap-x-2">
                  <ToolLink id={t.tool} />
                  <StateTag state={t.before} release={String(before.site.changes.target.nodeRelease)} />
                  <span className="text-muted">→</span>
                  <StateTag state={t.after} release={String(after.site.changes.target.nodeRelease)} />
                </div>
                <p className="text-xs text-muted">{t.reason}</p>
              </li>)}</ul>}
          </div>
        </div>
        <FixOrderDiff comparison={comparison} />
        <StatusGrid comparison={comparison} />
        <RuntimeDiff comparison={comparison} />
        {before.codeRevision && <p className="text-xs text-muted">Checksums of the earlier registers are verified during the site build. Assessment code at capture: {before.codeRevision.slice(0, 10)}.</p>}
      </section>;
    })}
  </DijkstraFrame>;
}

function StateTag({ state, release }: { state: keyof typeof HARDFORK_STATES | null; release: string }) {
  if (!state) return <span className="text-xs text-muted">Not listed</span>;
  return <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${HARDFORK_STATES[state].text}`}>
    <span className={`size-2 rounded-full ${HARDFORK_STATES[state].dot}`} />{hardforkStateLabel(state, release)}
  </span>;
}
