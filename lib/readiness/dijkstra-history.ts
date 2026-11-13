import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { loadDijkstraSite, toolStates, type DijkstraSite, type HardforkState } from "./dijkstra-site";
import { worstStatus, type Status } from "./boundary";
import type { Outcome } from "./devnet";

const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
interface Manifest { schemaVersion: 1; id: string; repositoryRevision: string; nodeRevision: string; files: Record<string, string> }

/** Refuse replacement: each assessment is an immutable, independently checksummed set of registers (ADR-2). */
export function archiveDijkstra(source: string, destination: string, repositoryRevision: string) {
  if (existsSync(destination)) throw new Error(`Assessment archive already exists: ${destination}`);
  const site = loadDijkstraSite(source);
  const files = readdirSync(source, { withFileTypes: true }).filter((f) => f.isFile()).map((f) => f.name).sort();
  mkdirSync(destination, { recursive: true });
  for (const file of files) copyFileSync(join(source, file), join(destination, file));
  const manifest: Manifest = {
    schemaVersion: 1, id: basename(destination), repositoryRevision, nodeRevision: site.devnet.run.node.revision,
    files: Object.fromEntries(files.map((f) => [f, hash(join(destination, f))])),
  };
  writeFileSync(join(destination, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  return manifest;
}

export function readDijkstraArchive(directory: string) {
  const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")) as Manifest;
  if (manifest.schemaVersion !== 1 || !manifest.files || !Object.keys(manifest.files).length) throw new Error("Invalid assessment manifest");
  const actual = readdirSync(directory, { withFileTypes: true }).filter((f) => f.isFile() && f.name !== "manifest.json").map((f) => f.name).sort();
  if (JSON.stringify(actual) !== JSON.stringify(Object.keys(manifest.files).sort())) throw new Error("Assessment manifest must cover every archived file");
  for (const [file, expected] of Object.entries(manifest.files)) {
    if (basename(file) !== file || file === "." || file === ".." || hash(join(directory, file)) !== expected)
      throw new Error(`Assessment archive checksum mismatch: ${file}`);
  }
  const site = loadDijkstraSite(directory);
  if (site.devnet.run.node.revision !== manifest.nodeRevision) throw new Error("Archived node revision disagrees with manifest");
  return { manifest, site };
}

/** Compare assessment states, not just counts: an unverified result is never presented as an observed fix. */
export function compareDijkstra(before: DijkstraSite, after: DijkstraSite) {
  const previous = new Map(toolStates(before).map((t) => [t.tool, t]));
  const current = new Map(toolStates(after).map((t) => [t.tool, t]));
  const tools = [...new Set([...previous.keys(), ...current.keys()])].sort().flatMap((tool) => {
    const a = previous.get(tool), b = current.get(tool);
    if (a?.state === b?.state) return [];
    return [{ tool, before: a?.state ?? null, after: b?.state ?? null, reason: b?.reason ?? "No longer classified on a shipped changed surface" }];
  });
  const oldComponents = new Map(before.boundary.components.map((c) => [c.id, c]));
  const newComponents = new Map(after.boundary.components.map((c) => [c.id, c]));
  const components = [...new Set([...oldComponents.keys(), ...newComponents.keys()])].sort().flatMap((component) => {
    const old = oldComponents.get(component), current = newComponents.get(component);
    const surfaces = [...new Set([...(old?.surfaces ?? []), ...(current?.surfaces ?? [])])].flatMap((surface) => {
      const a = old?.surfaces.includes(surface) ? worstStatus(old, surface) : null;
      const b = current?.surfaces.includes(surface) ? worstStatus(current, surface) : null;
      return a === b ? [] : [{ surface, before: a, after: b }];
    });
    return surfaces.length ? [{ component, surfaces }] : [];
  });
  const results = (site: DijkstraSite) => new Map(site.devnet.checks.flatMap((c) => c.results.map((r) => [`${c.id}/${r.kind}/${r.id}/${r.version ?? ""}`, r.outcome] as const)));
  const oldResults = results(before), newResults = results(after);
  const runtime = [...new Set([...oldResults.keys(), ...newResults.keys()])].sort().map((key) => ({
    key, before: oldResults.get(key) ?? null, after: newResults.get(key) ?? null,
  }));
  return {
    before: { date: before.classification.generatedAt.slice(0, 10), node: before.devnet.run.node.revision },
    after: { date: after.classification.generatedAt.slice(0, 10), node: after.devnet.run.node.revision },
    tools, components, runtime,
    states: stateCounts(before, after), fixOrder: fixOrderDiff(before, after),
    grid: statusGrid(before, after), subjects: runtimeBySubject(before, after),
  };
}

const count = (site: DijkstraSite) => toolStates(site).reduce((m, t) => m.set(t.state, (m.get(t.state) ?? 0) + 1), new Map<HardforkState, number>());

/** Tool counts per hard-fork state in each assessment. */
function stateCounts(before: DijkstraSite, after: DijkstraSite) {
  const a = count(before), b = count(after);
  return { total: { before: toolStates(before).length, after: toolStates(after).length },
    states: [...new Set([...a.keys(), ...b.keys()])].map((state) => ({ state, before: a.get(state) ?? 0, after: b.get(state) ?? 0 })) };
}

/** The fix order now, each step marked new or kept with its earlier position; dropped steps listed apart. */
function fixOrderDiff(before: DijkstraSite, after: DijkstraSite) {
  const old = before.unlocks.fixOrder.map((f) => f.component);
  const steps = after.unlocks.fixOrder.map((f, i) => {
    const was = old.indexOf(f.component);
    return { component: f.component, step: i + 1, previousStep: was < 0 ? null : was + 1, unlocked: f.unlocked };
  });
  const kept = new Set(steps.map((s) => s.component));
  return { steps, removed: old.filter((c) => !kept.has(c)),
    unlocked: { before: before.unlocks.fixOrder.at(-1)?.unlocked ?? 0, after: after.unlocks.fixOrder.at(-1)?.unlocked ?? 0 } };
}

export interface GridCell { surface: string; before: Status | null; after: Status | null }
export interface GridRow { component: string; criticalPath: boolean; changed: boolean; cells: GridCell[] }

/**
 * Worst status per component and surface in both assessments. Rows are the critical path (every fix-order step in
 * either assessment) plus any other component whose status changed; cells for surfaces a component lacks stay null.
 */
function statusGrid(before: DijkstraSite, after: DijkstraSite) {
  const oldComponents = new Map(before.boundary.components.map((c) => [c.id, c]));
  const newComponents = new Map(after.boundary.components.map((c) => [c.id, c]));
  const critical = new Set([...before.unlocks.fixOrder, ...after.unlocks.fixOrder].map((f) => f.component));
  const ids = [...new Set([...oldComponents.keys(), ...newComponents.keys()])];
  const surfaces = [...new Set([...after.changes.surfaces.map((s) => s.id), ...ids.flatMap((id) => [...(oldComponents.get(id)?.surfaces ?? []), ...(newComponents.get(id)?.surfaces ?? [])])])];
  const rows: GridRow[] = ids.map((component) => {
    const old = oldComponents.get(component), now = newComponents.get(component);
    const cells = surfaces.map((surface) => ({
      surface,
      before: old?.surfaces.includes(surface) ? worstStatus(old, surface) : null,
      after: now?.surfaces.includes(surface) ? worstStatus(now, surface) : null,
    }));
    return { component, criticalPath: critical.has(component), changed: cells.some((c) => c.before !== c.after), cells };
  }).filter((r) => r.criticalPath || r.changed);
  // Keep the critical path in fix order; the other changed components follow alphabetically.
  const order = after.unlocks.fixOrder.map((f) => f.component);
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : critical.has(id) ? order.length : order.length + 1);
  rows.sort((a, b) => rank(a.component) - rank(b.component) || a.component.localeCompare(b.component));
  const used = surfaces.filter((s) => rows.some((r) => r.cells.some((c) => c.surface === s && (c.before || c.after))));
  return { surfaces: used, rows: rows.map((r) => ({ ...r, cells: r.cells.filter((c) => used.includes(c.surface)) })) };
}

export type RuntimeChange = "now-passes" | "now-fails" | "new-version" | "first-tested" | "not-rerun" | "unchanged";
export interface RuntimeSubject {
  check: string; title: string; kind: string; id: string; change: RuntimeChange;
  before: { version: string | null; outcome: Outcome }[]; after: { version: string | null; outcome: Outcome }[];
}

/** Devnet results per check and subject across versions, so a newer version that passes reads as a change. */
function runtimeBySubject(before: DijkstraSite, after: DijkstraSite): RuntimeSubject[] {
  const group = (site: DijkstraSite) => {
    const m = new Map<string, { version: string | null; outcome: Outcome }[]>();
    for (const c of site.devnet.checks) for (const r of c.results) {
      const key = `${c.id}\u0000${r.kind}\u0000${r.id}`;
      m.set(key, [...(m.get(key) ?? []), { version: r.version ?? null, outcome: r.outcome }]);
    }
    return m;
  };
  const a = group(before), b = group(after);
  const titles = new Map([...before.devnet.checks, ...after.devnet.checks].map((c) => [c.id, c.title]));
  return [...new Set([...a.keys(), ...b.keys()])].map((key) => {
    const [check, kind, id] = key.split("\u0000");
    const was = a.get(key) ?? [], now = b.get(key) ?? [];
    return { check, title: titles.get(check) ?? check, kind, id, before: was, after: now, change: runtimeChange(was, now) };
  }).sort((x, y) => CHANGE_ORDER.indexOf(x.change) - CHANGE_ORDER.indexOf(y.change) || x.id.localeCompare(y.id) || x.check.localeCompare(y.check));
}

const CHANGE_ORDER: RuntimeChange[] = ["now-passes", "now-fails", "first-tested", "new-version", "not-rerun", "unchanged"];

function runtimeChange(was: { version: string | null; outcome: Outcome }[], now: { version: string | null; outcome: Outcome }[]): RuntimeChange {
  if (!was.length) return "first-tested";
  if (!now.length) return "not-rerun";
  const failed = (rs: typeof was) => rs.some((r) => r.outcome === "fail");
  if (failed(was) && !failed(now)) return "now-passes";
  if (!failed(was) && failed(now)) return "now-fails";
  const versions = (rs: typeof was) => rs.map((r) => `${r.version}:${r.outcome}`).sort().join(",");
  return versions(was) === versions(now) ? "unchanged" : "new-version";
}
