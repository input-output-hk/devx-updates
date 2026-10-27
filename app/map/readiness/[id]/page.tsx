import Link from "next/link";
import { notFound } from "next/navigation";
import Nav from "@/components/Nav";
import Download from "@/components/readiness/Download";
import DependencyTree from "@/components/readiness/DependencyTree";
import { readinessSnapshot } from "@/lib/readiness/site";
import { toolSubgraph } from "@/lib/readiness/graph";
import { capabilityRows } from "@/lib/readiness/capabilities";
import Capabilities from "@/components/readiness/Capabilities";
import DijkstraExposure from "@/components/readiness/DijkstraExposure";
import { dijkstraSite } from "@/lib/readiness/dijkstra-site";

export const dynamicParams = false;
export function generateStaticParams() { return readinessSnapshot().tools.map((t) => ({ id: t.id })); }
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `${readinessSnapshot().tools.find((t) => t.id === id)?.name ?? "Tool"} dependency coverage` };
}

export default async function ToolReadinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const snapshot = readinessSnapshot();
  const tool = snapshot.tools.find((t) => t.id === id);
  if (!tool) notFound();
  const { tools: _tools, ...graph } = toolSubgraph(snapshot, [id]);
  void _tools;
  const { evidence } = graph;
  return <div className="map-view" style={{ overflow: "visible" }}><div className="mx-auto max-w-6xl space-y-7 px-4 py-7 sm:px-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><Link href="/map/dijkstra">← Dijkstra readiness</Link><Nav /></div>
    <header><p className="mb-2 text-sm text-muted">{tool.maintainer} · {tool.ecosystems.join(" / ") || "Ecosystem unresolved"}</p><h1 className="break-words font-display text-3xl font-semibold">{tool.name}</h1><p className="mt-3 text-muted">Dijkstra readiness: <strong className="text-foreground">{dijkstraSite().classification.tools.get(id)?.readiness ?? "unassessed"}</strong> (see <a href="#dijkstra">below</a>). Dependency evidence does not establish compatibility.</p></header>
    <DijkstraExposure id={id} />
    <div className="flex flex-wrap gap-3">{tool.releaseUrl && <a className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" href={tool.releaseUrl} target="_blank" rel="noreferrer">Inspect source release</a>}<Download filename={`${id}-dependencies.json`} data={{ snapshot: snapshot.semanticDigest, tool, ...graph }} label="Export tool evidence index and graph" /></div>
    <section className="grid gap-3 sm:grid-cols-4" aria-label="Coverage dimensions">{[["Artifact mapping", tool.artifact], ["Native resolution", tool.resolution], ["Integration review", tool.integration], ["Capability review", tool.capability]].map(([label, status]) => <div key={label} className="rounded-xl border border-border bg-surface p-4"><h2 className="text-sm text-muted">{label}</h2><p className="mt-2 font-semibold">{status}</p></div>)}</section>
    <dl className="grid gap-4 rounded-xl border border-border bg-surface p-5 text-sm sm:grid-cols-2"><div><dt className="text-muted">Discovered source release</dt><dd className="break-all">{tool.release ?? "Unknown"}</dd></div><div><dt className="text-muted">Source repository</dt><dd className="break-all">{tool.repo ?? "Unknown"}</dd></div><div><dt className="text-muted">Last successful discovery</dt><dd>{tool.lastSuccess ?? "Never"}</dd></div><div><dt className="text-muted">Last attempt</dt><dd>{tool.lastAttempt ?? "Not attempted"}</dd></div>{tool.discoveryError && <div className="sm:col-span-2"><dt className="text-status-progress">Latest discovery failed</dt><dd className="break-words text-xs">{tool.discoveryError}</dd></div>}</dl>
    <section id="dependencies" className="scroll-mt-24"><h2 className="mb-3 font-display text-xl font-semibold">Dependency profiles</h2><DependencyTree {...graph} /></section>
    <Capabilities findings={capabilityRows({ ...graph, tools: [tool] })} decisions={graph.capabilityDecisions ?? []} />
    <section><h2 className="mb-3 font-display text-xl font-semibold">Unresolved frontiers and next actions</h2><div className="space-y-3">{tool.gaps.map((g) => <article key={g.id} className="rounded-xl border border-border bg-surface p-4"><span className="text-xs uppercase tracking-wide text-muted">{g.area}</span><h3 className="mt-1 break-words text-sm font-medium">{g.reason}</h3><p className="mt-2 text-sm text-muted">Next: {g.nextAction}</p>{g.profileId && <p className="mt-2 break-all font-mono text-xs text-muted">{g.profileId}</p>}</article>)}</div></section>
    <details className="rounded-xl border border-border bg-surface p-4"><summary className="cursor-pointer font-medium">Discovered manifests ({tool.manifests.length})</summary><ul className="mt-3 space-y-1 text-xs">{tool.manifests.map((path) => <li key={path} className="break-all">{tool.repo && tool.revision ? <a href={`https://github.com/${tool.repo}/blob/${tool.revision}/${path}`} target="_blank" rel="noreferrer">{path}</a> : path}</li>)}</ul>{!tool.manifests.length && <p className="mt-2 text-sm text-muted">No recognized manifests have been discovered.</p>}</details>
    <details className="rounded-xl border border-border bg-surface p-4"><summary className="cursor-pointer font-medium">Evidence index ({evidence.length})</summary><ul className="mt-3 space-y-4">{evidence.map((e) => <li key={e.id} id={e.id} className="break-all text-xs">{e.sourceUrl ? <a href={e.sourceUrl} target="_blank" rel="noreferrer">{e.description}</a> : e.description}<code className="mt-1 block text-muted">{e.id}</code><span className="text-muted">Retained at data/readiness/{e.path}</span></li>)}</ul></details>
  </div></div>;
}
