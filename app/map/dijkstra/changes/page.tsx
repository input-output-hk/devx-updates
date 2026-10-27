import type { Metadata } from "next";
import Link from "next/link";
import { Chip, DIJKSTRA, DijkstraFrame, OUTCOME } from "@/components/readiness/DijkstraParts";
import { citationUrl, dijkstraSite } from "@/lib/readiness/dijkstra-site";
import { resultsFor } from "@/lib/readiness/devnet";

export const metadata: Metadata = {
  title: "What Dijkstra changes",
  description: "The protocol and node changes Dijkstra brings, cited at the node 11.2 integration branch, with their devnet outcome.",
};

export default function ChangesPage() {
  const { changes, devnet } = dijkstraSite();
  return <DijkstraFrame title="What Dijkstra changes" current={`${DIJKSTRA}/changes`}>
    <section>
      <p className="text-muted">
        Read at the node 11.2 integration branch and the component versions it selects. Activation is either the node
        upgrade itself, the fork to protocol version 12, or a later intra-era step.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{changes.changes.map((c) => (
        <article key={c.id} id={`change-${c.id}`} className="scroll-mt-24 rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">{c.title}</h2>
          <p className="mt-1 flex flex-wrap gap-1"><Chip>{c.activation}</Chip><Chip>{c.compatibility}</Chip>{c.surfaces.map((s) => <Chip key={s}>{s}</Chip>)}</p>
          {resultsFor(devnet, "change", c.id).map(({ check, result }) => (
            <p key={check.id} className="mt-2 text-xs">
              <span className={`font-medium ${OUTCOME[result.outcome]}`}>devnet {result.outcome === "pass" ? "confirmed" : "contradicted"}</span>{" "}
              <Link href={`${DIJKSTRA}/devnet#devnet-${check.id}`}>{check.title}</Link>{result.note && <span className="text-muted"> · {result.note}</span>}
            </p>
          ))}
          <p className="mt-2 text-sm text-muted">{c.summary}</p>
          <details className="mt-2 text-xs"><summary className="cursor-pointer text-muted">{c.citations.length} citations</summary>
            <ul className="mt-2 space-y-1">{c.citations.map((q) => <li key={`${q.repo}:${q.path}:${q.line}`}><a href={citationUrl(q)} target="_blank" rel="noreferrer" className="break-all">{q.repo} {q.path}:{q.line}</a></li>)}</ul>
          </details>
        </article>
      ))}</div>
      <h2 className="mt-8 font-display text-2xl font-semibold">Checked and unchanged</h2>
      <ul className="mt-2 space-y-2 text-sm">{changes.unchanged.map((u) => <li key={u.id}><span className="font-medium">{u.title}.</span> <span className="text-muted">{u.summary}</span></li>)}</ul>
    </section>
  </DijkstraFrame>;
}
