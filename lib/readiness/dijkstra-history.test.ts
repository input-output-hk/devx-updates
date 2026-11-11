import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { archiveDijkstra, compareDijkstra, readDijkstraArchive } from "./dijkstra-history";
import { loadDijkstraSite } from "./dijkstra-site";

const source = "content/readiness/dijkstra-history/2026-10-26-integration";

test("archives retain original bytes, refuse replacement and detect tampering", () => {
  const directory = mkdtempSync(join(tmpdir(), "dijkstra-history-"));
  try {
    const destination = join(directory, "assessment");
    // Use the current register directory: archive directories already contain a manifest.
    archiveDijkstra("content/readiness/dijkstra", destination, "a".repeat(40));
    assert.deepEqual(readFileSync(join(destination, "devnet.json")), readFileSync("content/readiness/dijkstra/devnet.json"));
    assert.equal(readDijkstraArchive(destination).manifest.repositoryRevision, "a".repeat(40));
    assert.throws(() => archiveDijkstra("content/readiness/dijkstra", destination, "b".repeat(40)), /already exists/);
    const manifestPath = join(destination, "manifest.json"), original = readFileSync(manifestPath, "utf8");
    const incomplete = JSON.parse(original);
    delete incomplete.files["boundary.json"];
    writeFileSync(manifestPath, JSON.stringify(incomplete));
    assert.throws(() => readDijkstraArchive(destination), /must cover every archived file/);
    writeFileSync(manifestPath, original);
    writeFileSync(join(destination, "devnet.json"), "{}");
    assert.throws(() => readDijkstraArchive(destination), /checksum mismatch/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("the retained baseline validates, and a new tested version is not counted as a changed outcome", () => {
  const { site: before } = readDijkstraArchive(source);
  const after = loadDijkstraSite(source);
  const result = after.devnet.checks.find((c) => c.id === "db-sync-and-blockfrost")!.results.find((r) => r.id === "blockfrost")!;
  result.version = "v9.0.0";
  result.outcome = "pass";
  const comparison = compareDijkstra(before, after);
  const rows = comparison.runtime.filter((r) => r.key.includes("/blockfrost/"));
  assert.deepEqual(rows.map((r) => [r.before, r.after]), [["fail", null], [null, "pass"]]);
  assert.equal(comparison.tools.length, 0);
});

test("component and surface removals remain visible in the comparison", () => {
  const before = loadDijkstraSite(source), after = loadDijkstraSite(source);
  after.boundary.components = after.boundary.components.filter((c) => c.id !== "cardano-c");
  const pallas = after.boundary.components.find((c) => c.id === "pallas")!;
  pallas.surfaces = pallas.surfaces.filter((s) => s !== "block-encoding");
  const changes = compareDijkstra(before, after).components;
  assert.ok(changes.find((c) => c.component === "cardano-c")!.surfaces.every((s) => s.after === null));
  assert.deepEqual(changes.find((c) => c.component === "pallas")!.surfaces, [{ surface: "block-encoding", before: "gap", after: null }]);
});

test("tagged target components retain the earlier integration assessment in history", () => {
  const { site: before } = readDijkstraArchive(source);
  const current = loadDijkstraSite("content/readiness/dijkstra");
  const comparison = compareDijkstra(before, current);
  const targets = comparison.tools.filter((t) => t.after === "target-component");
  assert.deepEqual(targets.map((t) => t.tool), ["cardano-cli", "cardano-node", "cardano-submit-api", "cardano-testnet"]);
  assert.ok(targets.every((t) => t.before === "in-progress"), "the archived untagged target keeps its original state");
  assert.ok(comparison.runtime.filter((r) => r.before && r.after).every((r) => r.before === r.after),
    "a new membership label does not turn unchanged runtime outcomes into fixes");
});

test("a newer version that passes reads as a fix, and a new subject as first tested", () => {
  const before = loadDijkstraSite(source), after = loadDijkstraSite(source);
  const check = after.devnet.checks.find((c) => c.id === "db-sync-and-blockfrost")!;
  const result = check.results.find((r) => r.id === "blockfrost")!;
  const previous = before.devnet.checks.find((c) => c.id === "db-sync-and-blockfrost")!.results.find((r) => r.id === "blockfrost")!;
  assert.equal(previous.outcome, "fail");
  result.version = "v9.0.0";
  result.outcome = "pass";
  check.results.push({ kind: "tool", id: "kupo", version: "v3.0.0", outcome: "fail" });
  const subjects = compareDijkstra(before, after).subjects;
  const blockfrost = subjects.find((s) => s.check === check.id && s.id === "blockfrost")!;
  assert.equal(blockfrost.change, "now-passes");
  assert.deepEqual(blockfrost.after, [{ version: "v9.0.0", outcome: "pass" }]);
  assert.equal(subjects.find((s) => s.check === check.id && s.id === "kupo")!.change, "first-tested");
  assert.equal(subjects[0].change, "now-passes", "outcome flips sort first");
  assert.ok(subjects.filter((s) => s !== blockfrost && s.id !== "kupo").every((s) => s.change === "unchanged"));
});

test("the fix-order diff marks new and dropped steps, and the grid keeps changed components off the path", () => {
  const before = loadDijkstraSite(source), after = loadDijkstraSite(source);
  const [first, ...rest] = after.unlocks.fixOrder;
  after.unlocks.fixOrder = [...rest, { ...first, component: "brand-new" }];
  const diff = compareDijkstra(before, after).fixOrder;
  assert.deepEqual(diff.removed, [first.component]);
  assert.equal(diff.steps.at(-1)!.previousStep, null);
  assert.equal(diff.steps[0].previousStep, 2);
  const cardanoC = after.boundary.components.find((c) => c.id === "cardano-c")!;
  cardanoC.assessments = cardanoC.assessments.map((a) => ({ ...a, status: "gap" as const }));
  const grid = compareDijkstra(before, after).grid;
  const row = grid.rows.find((r) => r.component === "cardano-c")!;
  assert.equal(row.changed, true);
  assert.ok(row.cells.some((c) => c.before !== c.after && c.after === "gap"));
  assert.ok(grid.rows.filter((r) => !r.changed).every((r) => r.criticalPath), "unchanged rows are only critical-path components");
});
