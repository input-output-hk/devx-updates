import assert from "node:assert/strict";
import test from "node:test";
import { fixGraph } from "./fix-graph";
import type { BlockerKind } from "./unlocks";

const up = (...via: string[]) => via.map((v) => ({ via: v, kind: "upstream-fix" as BlockerKind, surfaces: [] }));

test("fix graph: columns by what must land first, implied links dropped, longest chain marked", () => {
  const g = fixGraph({
    fixOrder: [
      { component: "db-sync", added: ["a"], unlocked: 1 },
      { component: "blockfrost", added: ["b", "c"], unlocked: 3 },
      { component: "sdk", added: ["d"], unlocked: 4 },
      { component: "pallas", added: ["e"], unlocked: 5 },
      { component: "ogmios", added: [], unlocked: 5 },
    ],
    blockers: [
      { tool: "blockfrost", blockers: up("db-sync") },
      // sdk waits on db-sync through blockfrost too: that link is implied and left out.
      { tool: "sdk", blockers: [...up("blockfrost", "db-sync", "ogmios"), { via: "own", kind: "own-gap", surfaces: [] }] },
      { tool: "a", blockers: up("db-sync") },
    ],
  });
  const by = new Map(g.nodes.map((n) => [n.id, n]));
  assert.deepEqual([...by.keys()].sort(), ["blockfrost", "db-sync", "ogmios", "sdk"]);
  assert.deepEqual(g.independent.map((n) => n.id), ["pallas"], "a fix nothing waits on and that waits on nothing stands apart");
  assert.equal(by.get("db-sync")!.column, 0);
  assert.equal(by.get("blockfrost")!.column, 1);
  assert.equal(by.get("sdk")!.column, 2);
  assert.deepEqual(by.get("sdk")!.waitsOn.sort(), ["blockfrost", "ogmios"]);
  assert.deepEqual(g.nodes.filter((n) => n.critical).map((n) => n.id).sort(), ["blockfrost", "db-sync", "sdk"], "only the longest chain");
  assert.ok(g.edges.find((e) => e.from === "sdk" && e.to === "blockfrost")!.critical);
  assert.ok(!g.edges.find((e) => e.from === "sdk" && e.to === "ogmios")!.critical);
  assert.equal(by.get("sdk")!.step, 3);
  assert.equal(by.get("blockfrost")!.added, 2);
  for (const c of [0, 1, 2]) {
    const rows = g.nodes.filter((n) => n.column === c).map((n) => n.row);
    assert.equal(new Set(rows).size, rows.length, `column ${c}: no two boxes share a row`);
  }
});

test("fix graph: targets take a last column and the longest chains end at them", () => {
  const g = fixGraph({
    fixOrder: [
      { component: "db-sync", added: [], unlocked: 0 },
      { component: "blockfrost", added: ["x"], unlocked: 1 },
      { component: "scalus", added: [], unlocked: 1 },
      { component: "pallas", added: ["y"], unlocked: 2 },
    ],
    blockers: [
      { tool: "blockfrost", blockers: up("db-sync") },
      { tool: "scalus", blockers: up("blockfrost") },
      { tool: "mesh", blockers: up("scalus", "blockfrost") },
      { tool: "mithril", blockers: up("pallas") },
    ],
  }, ["mesh", "mithril", "blockfrost"]);
  const by = new Map(g.nodes.map((n) => [n.id, n]));
  assert.equal(by.get("blockfrost")!.kind, "fix", "a fix is never also a target");
  assert.equal(by.get("mesh")!.kind, "target");
  assert.equal(by.get("mesh")!.column, 3, "targets share the column after the deepest fix");
  assert.equal(by.get("mithril")!.column, 3);
  assert.deepEqual(by.get("mesh")!.waitsOn, ["scalus"], "implied links to targets are dropped too");
  assert.ok(by.has("pallas") && !g.independent.some((n) => n.id === "pallas"), "a fix a target waits on is linked");
  assert.deepEqual(g.nodes.filter((n) => n.critical).map((n) => n.id).sort(), ["blockfrost", "db-sync", "mesh", "scalus"], "the chain to the deepest target");
});
