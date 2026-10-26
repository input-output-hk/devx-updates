import type { Blocker, UnlockReport } from "./unlocks";

/**
 * The fix order drawn as a dependency graph. Columns: a component sits one column right of the furthest component it
 * waits on, so everything in a column can be fixed at once. Edges point from a component to one it waits on, minus
 * links already implied through another (Scalus waits on Blockfrost through cardano-client-lib). `critical` marks the
 * longest chains: no amount of parallel work makes the hardfork-ready set arrive sooner than they allow.
 *
 * Targets are tools DApps build on that are not fixes themselves (Mesh, Lucid Evolution): they share a last column, with
 * arrows from the fixes they wait on, and when there are any the longest chains are the ones that end at a target.
 */
export interface FixNode {
  id: string; kind: "fix" | "target"; step: number; added: number; unlocked: number; column: number; row: number;
  waitsOn: string[]; critical: boolean;
}
export interface FixGraph {
  nodes: FixNode[]; edges: { from: string; to: string; critical: boolean }[];
  /** Components that neither wait on nor block another fix in the order. */
  independent: FixNode[]; columns: number; rows: number;
}

export function fixGraph(report: Pick<UnlockReport, "fixOrder"> & { blockers: { tool: string; blockers: Blocker[] }[] }, targetIds: string[] = []): FixGraph {
  const ids = report.fixOrder.map((f) => f.component);
  const inOrder = new Set(ids);
  const targets = [...new Set(targetIds)].filter((t) => !inOrder.has(t));
  const blockers = new Map(report.blockers.map((b) => [b.tool, b.blockers]));
  const waits = new Map([...ids, ...targets].map((id) => [id, [...new Set((blockers.get(id) ?? []).filter((b) => b.kind === "upstream-fix" && inOrder.has(b.via) && b.via !== id).map((b) => b.via))]]));

  const column = new Map<string, number>();
  const columnOf = (id: string, seen = new Set<string>()): number => {
    if (column.has(id)) return column.get(id)!;
    if (seen.has(id)) throw new Error(`Fix order has a cycle through ${id}`);
    seen.add(id);
    const c = Math.max(-1, ...waits.get(id)!.map((w) => columnOf(w, seen))) + 1;
    column.set(id, c);
    return c;
  };
  [...ids, ...targets].forEach((id) => columnOf(id));

  // Everything a component waits on, directly or not, to drop edges another path already implies.
  const reach = new Map<string, Set<string>>();
  const reachOf = (id: string): Set<string> => {
    if (!reach.has(id)) reach.set(id, new Set(waits.get(id)!.flatMap((w) => [w, ...reachOf(w)])));
    return reach.get(id)!;
  };
  const direct = new Map([...ids, ...targets].map((id) => {
    const w = waits.get(id)!;
    return [id, w.filter((a) => !w.some((b) => b !== a && reachOf(b).has(a)))];
  }));

  const depth = Math.max(...ids.map((id) => column.get(id)!));
  // Chains are measured by each node's own column; targets are only drawn apart, in one column after the fixes.
  const reachingTargets = targets.filter((t) => direct.get(t)!.length);
  const targetDepth = Math.max(-1, ...reachingTargets.map((t) => column.get(t)!));
  const critical = new Set<string>();
  const criticalEdges = new Set<string>();
  const markBack = (id: string) => {
    critical.add(id);
    for (const w of direct.get(id)!) if (column.get(w) === column.get(id)! - 1) { criticalEdges.add(`${id}>${w}`); markBack(w); }
  };
  if (targetDepth > 0) reachingTargets.filter((t) => column.get(t) === targetDepth).forEach(markBack);
  else if (depth > 0) ids.filter((id) => column.get(id) === depth).forEach(markBack);

  const blocks = new Set([...direct.values()].flat());
  const linkedFixes = ids.filter((id) => direct.get(id)!.length || blocks.has(id));
  const linked = [...linkedFixes, ...targets];
  const step = new Map(report.fixOrder.map((f, i) => [f.component, { step: i + 1, added: f.added.length, unlocked: f.unlocked }]));
  const isTarget = new Set(targets);
  const shown = (id: string) => (isTarget.has(id) ? depth + 1 : column.get(id)!);
  const node = (id: string, row: number): FixNode => ({
    id, kind: isTarget.has(id) ? "target" : "fix", ...(step.get(id) ?? { step: 0, added: 0, unlocked: 0 }),
    column: shown(id), row, waitsOn: direct.get(id)!, critical: critical.has(id),
  });

  // Rows: start each column in fix order, then a few sweeps placing each node at the mean row of its neighbours, so
  // edges stay short and rarely cross.
  const width = depth + 1 + (targets.length ? 1 : 0);
  const columns = Array.from({ length: width }, (_, c) => linked.filter((id) => shown(id) === c));
  const order = (id: string) => step.get(id)?.step ?? ids.length + targets.indexOf(id);
  const neighbours = new Map(linked.map((id) => [id, [...direct.get(id)!, ...linked.filter((o) => direct.get(o)!.includes(id))]]));
  const row = new Map<string, number>();
  columns.forEach((col) => col.forEach((id, i) => row.set(id, i)));
  for (let sweep = 0; sweep < 4; sweep++) {
    for (const col of sweep % 2 ? [...columns].reverse() : columns) {
      const want = new Map(col.map((id) => {
        const n = neighbours.get(id)!;
        return [id, n.length ? n.reduce((s, o) => s + row.get(o)!, 0) / n.length : row.get(id)!];
      }));
      col.sort((a, b) => want.get(a)! - want.get(b)! || order(a) - order(b));
      // Keep the wanted spacing where it fits, but never overlap: each node at least one row below the previous.
      let next = 0;
      for (const id of col) { const r = Math.max(next, Math.round(want.get(id)!)); row.set(id, r); next = r + 1; }
    }
    // Pull the whole layout back to row 0 after each sweep.
    const min = Math.min(...linked.map((id) => row.get(id)!));
    linked.forEach((id) => row.set(id, row.get(id)! - min));
  }

  const nodes = linked.map((id) => node(id, row.get(id)!));
  const edges = linked.flatMap((id) => direct.get(id)!.map((to) => ({ from: id, to, critical: criticalEdges.has(`${id}>${to}`) })));
  const independent = ids.filter((id) => !linked.includes(id)).map((id, i) => node(id, i));
  return { nodes, edges, independent, columns: width, rows: nodes.length ? Math.max(...nodes.map((n) => n.row)) + 1 : 0 };
}
