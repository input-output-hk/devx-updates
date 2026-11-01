import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { loadDijkstraSite, toolStates, type DijkstraSite } from "./dijkstra-site";
import { worstStatus } from "./boundary";

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
  const components = after.boundary.components.flatMap((c) => {
    const old = oldComponents.get(c.id);
    const surfaces = c.surfaces.flatMap((surface) => {
      const a = old?.surfaces.includes(surface) ? worstStatus(old, surface) : null, b = worstStatus(c, surface);
      return a === b ? [] : [{ surface, before: a, after: b }];
    });
    return surfaces.length ? [{ component: c.id, surfaces }] : [];
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
  };
}
