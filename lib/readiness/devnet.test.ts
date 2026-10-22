import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { parseBoundaryRegister } from "./boundary";
import { parseChangeRegister } from "./dijkstra";
import { devnetConsistency, parseDevnetRegister, resultsFor } from "./devnet";
import type { ClassificationRegister } from "./surface-collect";

const read = (name: string) => JSON.parse(readFileSync(`content/readiness/dijkstra/${name}`, "utf8"));
const changes = parseChangeRegister(read("changes.json"));
const known = { changes: new Set(["era-dijkstra"]), components: new Set(["pallas"]), tools: new Set(["oura"]) };
const check = () => ({
  id: "handshake", title: "t", summary: "s", observed: ["accepted V23"], recipe: ["scripts/readiness/devnet/handshake.py"],
  results: [
    { kind: "change", id: "era-dijkstra", outcome: "pass" },
    { kind: "component", id: "pallas", version: "v1.3.0", outcome: "fail" },
    { kind: "component", id: "pallas", version: "v1.4.0", outcome: "pass" },
  ] as Record<string, unknown>[],
});
const base = () => ({
  schemaVersion: 1,
  run: { date: "2026-10-20", node: { repo: "IntersectMBO/cardano-node", revision: "c".repeat(40), build: "b" }, cli: "c", setup: ["s"], recipe: "scripts/readiness/devnet/README.md" },
  checks: [check()],
});

test("devnet results name known subjects, keep one outcome per subject version and point at the recipe", () => {
  assert.doesNotThrow(() => parseDevnetRegister(base(), known));
  const mutate = (edit: (r: ReturnType<typeof base>) => void) => { const r = base(); edit(r); return r; };
  const invalid: [string, ReturnType<typeof base>, RegExp][] = [
    ["unknown component", mutate((r) => { r.checks[0].results[1].id = "ogmios"; }), /unknown component ogmios/],
    ["a tool named as a component", mutate((r) => { r.checks[0].results[1].id = "oura"; }), /unknown component oura/],
    ["unknown outcome", mutate((r) => { r.checks[0].results[0].outcome = "partial"; }), /outcome/],
    ["same subject version twice", mutate((r) => { r.checks[0].results[2].version = "v1.3.0"; }), /subject version twice/],
    ["no results", mutate((r) => { r.checks[0].results = []; }), /needs results/],
    ["no observed output", mutate((r) => { r.checks[0].observed = []; }), /observed must not be empty/],
    ["recipe outside the devnet scripts", mutate((r) => { r.checks[0].recipe = ["/tmp/run.sh"]; }), /scripts\/readiness\/devnet/],
    ["duplicate check", mutate((r) => { r.checks.push(check()); }), /handshake/],
    ["short node revision", mutate((r) => { r.run.node.revision = "34ae34db"; }), /40-character/],
  ];
  for (const [label, register, error] of invalid) assert.throws(() => parseDevnetRegister(register, known), error, label);
});

test("boundary assessments must agree with the devnet results they cite", () => {
  const devnet = parseDevnetRegister(base(), known);
  const evidence = (version: string) => [
    { kind: "source", repo: "txpipe/pallas", revision: "b".repeat(40), path: "n2c.rs", line: 2, quote: "q" },
    { kind: "devnet", check: "handshake", version },
  ];
  const boundary = (status: string, version: string) => parseBoundaryRegister({
    schemaVersion: 1, retrieved: "2026-10-20", method: ["m"],
    components: [{
      id: "pallas", repo: "txpipe/pallas", roles: ["ledger-codec"], surfaces: ["node-to-client-protocol"],
      observed: { branch: "main", revision: "b".repeat(40), date: "2026-10-20", release: { tag: "v1.4.0", date: "2026-09-17" } }, dependsOn: [],
      assessments: [{ surfaces: ["node-to-client-protocol"], status, summary: "s", releasedIn: { tag: "v1.4.0", date: "2026-09-17" }, evidence: evidence(version) }],
    }],
  }, changes);
  assert.deepEqual(devnetConsistency(boundary("verified", "v1.4.0"), devnet), []);
  assert.deepEqual(devnetConsistency(boundary("gap", "v1.3.0"), devnet), [], "a gap may cite the failing version");
  assert.match(devnetConsistency(boundary("released", "v1.3.0"), devnet).join(), /released but cites a failing devnet result/);
  assert.match(devnetConsistency(boundary("verified", "v1.3.0"), devnet).join(), /verified without a passing devnet result/);
  assert.match(devnetConsistency(boundary("verified", "v9.9.9"), devnet).join(), /records no such result/);
  assert.throws(() => parseBoundaryRegister({
    schemaVersion: 1, retrieved: "2026-10-20", method: ["m"],
    components: [{
      id: "pallas", repo: "txpipe/pallas", roles: ["ledger-codec"], surfaces: ["node-to-client-protocol"],
      observed: { branch: "main", revision: "b".repeat(40), date: "2026-10-20", release: null }, dependsOn: [],
      assessments: [{ surfaces: ["node-to-client-protocol"], status: "verified", summary: "s", releasedIn: { tag: "v1.4.0", date: "2026-09-17" }, evidence: evidence("v1.4.0").slice(0, 1) }],
    }],
  }, changes), /needs devnet evidence for status verified/);
});

test("the committed devnet register matches the committed registers and recipe", () => {
  const boundary = parseBoundaryRegister(read("boundary.json"), changes);
  const { tools } = read("classification.json") as ClassificationRegister;
  const devnet = parseDevnetRegister(read("devnet.json"), {
    changes: new Set(changes.changes.map((c) => c.id)), components: new Set(boundary.components.map((c) => c.id)), tools: new Set(tools.map((t) => t.id)),
  });
  assert.deepEqual(devnetConsistency(boundary, devnet), []);
  for (const path of [devnet.run.recipe, ...devnet.checks.flatMap((c) => c.recipe)]) assert.ok(existsSync(path), `${path} exists`);
  assert.deepEqual(resultsFor(devnet, "change", "header-version-info").map((r) => r.result.outcome), ["fail"], "the node emits the ten-field header");
  const verified = boundary.components.filter((c) => c.assessments.some((a) => a.status === "verified")).map((c) => c.id).sort();
  assert.deepEqual(verified, ["cardano-db-sync", "gouroboros", "kupo", "ogmios"]);
});
