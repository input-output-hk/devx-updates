"use client";

import { useState } from "react";
import type { Artifact, Edge, Evidence, Occurrence, Profile } from "@/lib/readiness/types";

type TreeData = { profiles: Profile[]; occurrences: Occurrence[]; artifacts: Artifact[]; edges: Edge[]; evidence: Evidence[] };

function Branch({ nodeId, path, nodes, artifacts, outgoing, evidence, edge }: { nodeId: string; path: string[]; nodes: Map<string, Occurrence>; artifacts: Map<string, Artifact>; outgoing: Map<string, Edge[]>; evidence: Map<string, Evidence>; edge?: Edge }) {
  const [open, setOpen] = useState(false);
  const node = nodes.get(nodeId)!;
  const item = artifacts.get(node.artifactId)!;
  const cycle = path.includes(nodeId);
  const children = outgoing.get(nodeId) ?? [];
  return <li className="my-2 min-w-0">
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="max-w-full break-words rounded border border-border bg-surface px-2 py-1 text-left text-sm"><span aria-hidden="true">{open ? "−" : "+"} </span><span className="font-medium">{item.name}</span> <span className="text-muted">{item.version ?? "unknown version"}</span></button>
      {edge && <span className="text-xs text-muted">{edge.scope} · {edge.optional ? "optional/conditional" : "required"} · {edge.verification}</span>}
      {cycle && <span className="text-xs text-status-progress">Cycle; already in this path</span>}
    </div>
    {open && <div className="ml-2 border-l border-border pl-3 sm:ml-4 sm:pl-4">
      <p className="my-2 break-all text-xs text-muted">{item.ecosystem} · {node.locator || "root"}{edge?.condition ? ` · ${edge.condition}` : ""}</p>
      <details className="mb-3 text-xs text-muted"><summary className="cursor-pointer">Evidence and identity</summary><p className="my-2 break-all">Source: {item.source}</p><p className="my-2 break-all">Integrity: {item.integrity ?? "not captured"}</p>{(edge?.evidenceIds ?? node.evidenceIds).map((id) => <div key={id} className="my-2 break-all">{evidence.get(id)?.sourceUrl ? <a href={evidence.get(id)!.sourceUrl} target="_blank" rel="noreferrer">{evidence.get(id)!.description}</a> : evidence.get(id)?.description}<code className="mt-1 block">{id}</code></div>)}</details>
      {!cycle && (children.length ? <ul>{children.map((child) => <Branch key={child.id} nodeId={child.to} edge={child} path={[...path, nodeId]} nodes={nodes} artifacts={artifacts} outgoing={outgoing} evidence={evidence} />)}</ul> : <p className="py-2 text-xs text-muted">No outgoing edges in this view. This is not a compatibility verdict; check unresolved frontiers below.</p>)}
    </div>}
  </li>;
}

export default function DependencyTree(data: TreeData) {
  const [selected, setSelected] = useState(data.profiles[0]?.id ?? "");
  const [scope, setScope] = useState("all");
  const profile = data.profiles.find((p) => p.id === selected);
  if (!profile) return <p className="rounded-xl border border-border bg-surface p-5 text-muted">No native profile has been collected. Dependency coverage is unresolved, not empty.</p>;
  const nodes = new Map(data.occurrences.map((n) => [n.id, n]));
  const artifacts = new Map(data.artifacts.map((a) => [a.id, a]));
  const evidence = new Map(data.evidence.map((e) => [e.id, e]));
  const outgoing = new Map<string, Edge[]>();
  for (const edge of data.edges) if (edge.verification !== "rejected" && (scope === "all" || edge.scope === scope)) outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
  for (const edges of outgoing.values()) edges.sort((a, b) => artifacts.get(nodes.get(a.to)!.artifactId)!.name.localeCompare(artifacts.get(nodes.get(b.to)!.artifactId)!.name));
  return <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
    <div className="mb-4 flex flex-wrap gap-3">
      <label className="flex max-w-full flex-col gap-1 text-xs text-muted">Resolution profile<select value={selected} onChange={(e) => setSelected(e.target.value)} className="max-w-full">{data.profiles.map((p) => <option key={p.id} value={p.id}>{p.release} · {p.platform} · {p.inputDigest.slice(0, 8)}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-xs text-muted">Edge scope<select value={scope} onChange={(e) => setScope(e.target.value)}>{["all", "runtime", "build", "development"].map((s) => <option key={s}>{s}</option>)}</select></label>
    </div>
    <dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-muted">Native profile coverage</dt><dd>{profile.coverage}</dd></div><div><dt className="text-muted">Evidence origin</dt><dd>{profile.origin}</dd></div><div className="sm:col-span-2"><dt className="text-muted">Command and toolchain</dt><dd className="break-all font-mono text-xs">{profile.command}<br />{profile.toolchain}</dd></div><div className="sm:col-span-2"><dt className="text-muted">Pinned source</dt><dd className="break-all font-mono text-xs">{profile.revision}</dd></div></dl>
    <p className="my-4 text-xs text-muted">Expand packages to follow dependencies. Shared artifacts can appear along several paths; cycles stop at the repeated occurrence. Complete native resolution does not mean complete tool coverage.</p>
    <ul key={`${selected}:${scope}`}>{profile.roots.map((root) => <Branch key={root} nodeId={root} path={[]} nodes={nodes} artifacts={artifacts} outgoing={outgoing} evidence={evidence} />)}</ul>
  </div>;
}
