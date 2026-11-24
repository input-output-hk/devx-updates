import assert from "node:assert/strict";
import test from "node:test";
import { readJson } from "./store";
import { parseCriticalPath, pathStatus } from "./critical-path";
import { dijkstraSite } from "./dijkstra-site";

const committed = () => parseCriticalPath(readJson("content/readiness/dijkstra/critical-path.json"));

test("the committed critical path is the 2026-11-11 graph: 21 fixes and 10 tools DApps build on", () => {
  const path = committed();
  assert.equal(path.frozen, "2026-11-11");
  const boxes = [...path.graph.nodes, ...path.graph.independent];
  assert.equal(boxes.filter((n) => n.kind === "fix").length, 21);
  assert.equal(boxes.filter((n) => n.kind === "target").length, 10);
  assert.ok(["ogmios", "kupo", "yaci"].every((id) => boxes.some((n) => n.id === id && n.kind === "fix")), "fixes that later left the live order stay");
  assert.ok(!boxes.some((n) => n.id === "julc"), "blockers found later are not added");
});

test("a critical path must be internally consistent", () => {
  const raw = readJson("content/readiness/dijkstra/critical-path.json") as { graph: { edges: { from: string; to: string }[] }; added: Record<string, string[]> };
  const broken = structuredClone(raw);
  broken.graph.edges.push({ from: "nowhere", to: "cardano-db-sync" });
  assert.throws(() => parseCriticalPath(broken), /edge nowhere>cardano-db-sync/);
  const missing = structuredClone(raw);
  delete missing.added["cardano-db-sync"];
  assert.throws(() => parseCriticalPath(missing), /cardano-db-sync has no unlocked tools/);
});

test("each box's status comes from the current data: fixed once its own support is released", () => {
  const site = dijkstraSite();
  const path = committed();
  const status = pathStatus(site, path);
  assert.equal(status.get("service:maestro"), "retired");
  assert.equal(status.get("cardano-db-sync"), "tracked", "work on record, not released");
  const ready = { ...site, boundary: { ...site.boundary, components: site.boundary.components.map((c) => c.id === "ogmios" ? { ...c, assessments: c.assessments.map((a) => ({ ...a, status: "released" as const })) } : c) } };
  assert.equal(pathStatus(ready, path).get("ogmios"), "done", "a component whose every surface is released turns green");
});
