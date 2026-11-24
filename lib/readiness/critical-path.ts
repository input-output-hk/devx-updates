import { join } from "node:path";
import { list, object, text } from "./core";
import { readJson } from "./store";
import type { FixGraph, FixNode } from "./fix-graph";
import { componentStatus, toolLinks, toolState, type DijkstraSite } from "./dijkstra-site";

/**
 * The critical path as a fixed graph (content/readiness/dijkstra/critical-path.json): the fix-order graph of one
 * assessment, frozen so progress can be read against it. Boxes, arrows and layout never change; later runs only change
 * each box's status. A blocker found later is not added, and a fix that later leaves the live fix order stays.
 */
export interface CriticalPath {
  schemaVersion: 1; frozen: string; source: string; graph: FixGraph;
  /** For each fix, the tools it unlocked in the frozen fix order. */
  added: Record<string, string[]>;
}

/**
 * `done`: the component's own Dijkstra support is released (every surface released or verified); `tracked`: Dijkstra
 * work on record (an issue, PR, branch or unreleased work) but not released; `none`: no work on record; `retired`: a
 * deprecated provider that tools move off.
 */
export type PathStatus = "done" | "tracked" | "none" | "retired";

const RETIRED = "service:";

function node(raw: unknown, at: string): FixNode {
  const n = object(raw, at);
  const num = (k: string) => { if (!Number.isInteger(n[k])) throw new Error(`${at}.${k} must be an integer`); return n[k] as number; };
  if (n.kind !== "fix" && n.kind !== "target") throw new Error(`${at}.kind must be fix or target`);
  if (typeof n.critical !== "boolean") throw new Error(`${at}.critical must be a boolean`);
  return {
    id: text(n.id, `${at}.id`), kind: n.kind, step: num("step"), added: num("added"), unlocked: num("unlocked"),
    column: num("column"), row: num("row"), waitsOn: list(n.waitsOn, `${at}.waitsOn`).map((w, i) => text(w, `${at}.waitsOn[${i}]`)), critical: n.critical,
  };
}

export function parseCriticalPath(raw: unknown): CriticalPath {
  const r = object(raw, "critical path");
  if (r.schemaVersion !== 1) throw new Error("Critical path must use schemaVersion 1");
  const frozen = text(r.frozen, "critical path frozen");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(frozen)) throw new Error("critical path frozen must be a YYYY-MM-DD date");
  const g = object(r.graph, "critical path graph");
  const nodes = list(g.nodes, "graph.nodes").map((n, i) => node(n, `graph.nodes[${i}]`));
  const independent = list(g.independent, "graph.independent").map((n, i) => node(n, `graph.independent[${i}]`));
  const ids = new Set<string>();
  for (const n of [...nodes, ...independent]) { if (ids.has(n.id)) throw new Error(`critical path lists ${n.id} twice`); ids.add(n.id); }
  const edges = list(g.edges, "graph.edges").map((e, i) => {
    const x = object(e, `graph.edges[${i}]`);
    const edge = { from: text(x.from, `graph.edges[${i}].from`), to: text(x.to, `graph.edges[${i}].to`), critical: x.critical === true };
    if (!ids.has(edge.from) || !ids.has(edge.to)) throw new Error(`critical path edge ${edge.from}>${edge.to} names a box it does not have`);
    return edge;
  });
  for (const n of nodes) for (const w of n.waitsOn) if (!ids.has(w)) throw new Error(`critical path: ${n.id} waits on ${w}, which is not a box`);
  const addedRaw = object(r.added, "critical path added");
  const added: Record<string, string[]> = {};
  for (const n of [...nodes, ...independent].filter((n) => n.kind === "fix")) {
    if (!(n.id in addedRaw)) throw new Error(`critical path: ${n.id} has no unlocked tools`);
    added[n.id] = list(addedRaw[n.id], `added.${n.id}`).map((t, i) => text(t, `added.${n.id}[${i}]`));
  }
  const int = (v: unknown, k: string) => { if (!Number.isInteger(v)) throw new Error(`graph.${k} must be an integer`); return v as number; };
  return {
    schemaVersion: 1, frozen, source: text(r.source, "critical path source"),
    graph: { nodes, edges, independent, columns: int(g.columns, "columns"), rows: int(g.rows, "rows") }, added,
  };
}

/** Every box's status from the current data; the frozen file never records one. */
export function pathStatus(site: DijkstraSite, path: CriticalPath): Map<string, PathStatus> {
  const out = new Map<string, PathStatus>();
  for (const n of [...path.graph.nodes, ...path.graph.independent]) {
    if (n.id.startsWith(RETIRED)) { out.set(n.id, "retired"); continue; }
    const own = componentStatus(site, n.id);
    const tool = site.classification.tools.get(n.id);
    const state = tool ? toolState(site, tool) : undefined;
    const done = own ? own === "released" || own === "verified" : state?.state === "ready";
    const work = toolLinks(site, n.id).length > 0 || Boolean(state?.unreleased) || own === "in-progress" || own === "tracked";
    out.set(n.id, done ? "done" : work ? "tracked" : "none");
  }
  return out;
}

/** The committed critical path. */
export const criticalPath = () => parseCriticalPath(readJson(join(process.cwd(), "content/readiness/dijkstra/critical-path.json")));
