import type { Metadata } from "next";
import { DIJKSTRA, DijkstraFrame, OUTCOME, Subject } from "@/components/readiness/DijkstraParts";
import { dijkstraSite } from "@/lib/readiness/dijkstra-site";

export const metadata: Metadata = {
  title: "Dijkstra devnet run",
  description: "The node 11.2 integration branch on a local devnet forked to Dijkstra: which changes and components held up.",
};

export default function DevnetPage() {
  const { devnet } = dijkstraSite();
  const results = devnet.checks.flatMap((c) => c.results);
  return <DijkstraFrame title="Devnet run" current={`${DIJKSTRA}/devnet`}>
    <section>
      <p className="text-muted">
        {devnet.run.date}: cardano-node <a href={`https://github.com/${devnet.run.node.repo}/tree/${devnet.run.node.revision}`} target="_blank" rel="noreferrer" className="font-mono">{devnet.run.node.revision.slice(0, 10)}</a>{" "}
        (11.2 integration branch) on a local one-pool devnet, forked to Dijkstra and raised to protocol version 12
        through governance. {results.filter((r) => r.outcome === "fail").length} of {results.length} results failed.
        The recipe is in scripts/readiness/devnet.
      </p>
      <details className="mt-2 max-w-3xl text-sm">
        <summary className="cursor-pointer text-muted">Setup</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">{devnet.run.setup.map((line) => <li key={line}>{line}</li>)}</ul>
      </details>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">{devnet.checks.map((c) => (
        <article key={c.id} id={`devnet-${c.id}`} className="min-w-0 scroll-mt-24 rounded-xl border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-semibold">{c.title}</h2>
          <ul className="mt-3 space-y-1 text-sm">{c.results.map((r) => (
            <li key={`${r.kind}:${r.id}:${r.version ?? ""}`} className="flex flex-wrap items-baseline gap-x-2">
              <span className={`font-medium ${OUTCOME[r.outcome]}`}>{r.outcome}</span>
              <Subject result={r} />
              {r.version && <span className="text-xs text-muted">{r.version}</span>}
              {r.note && <span className="text-xs text-muted">· {r.note}</span>}
            </li>
          ))}</ul>
          <p className="mt-3 text-sm text-muted">{c.summary}</p>
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-muted">Observed output</summary>
            <ul className="mt-2 space-y-1">{c.observed.map((o) => <li key={o}><code className="block overflow-x-auto whitespace-pre text-muted">{o}</code></li>)}</ul>
            <p className="mt-2 break-all text-muted">Recipe: {c.recipe.join(", ")}</p>
          </details>
        </article>
      ))}</div>
    </section>
  </DijkstraFrame>;
}
