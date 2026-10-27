import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseChangeRegister } from "./dijkstra";
import { leadCoverage, parseLeadRegister } from "./leads";
import type { ToolClassification } from "./surfaces";

const changes = parseChangeRegister(JSON.parse(readFileSync("content/readiness/dijkstra/changes.json", "utf8")));
const revision = "a".repeat(40);
const quote = (line: number) => ({ repo: "o/t", revision, path: "main.go", line, quote: "ouroboros.WithNodeToNode(false)," });
const lead = (overrides: Record<string, unknown> = {}) => ({
  tool: "t", revision, via: "gouroboros", surfaces: ["node-to-client-protocol"], decision: "confirmed", summary: "Opens a node-to-client connection.", evidence: [quote(3)], ...overrides,
});
const register = (leads: unknown[]) => ({ schemaVersion: 1, reviewed: "2026-10-20", method: ["read shipped code"], leads });
const channel = (via: string, scope = "shipped", readiness = "gap") => ({ channel: "dependency" as const, via, readiness: readiness as "gap", lines: 1, scope: scope as "shipped" });
const tool = (id: string, surfaces: [string, ReturnType<typeof channel>[]][], exposure = "dependency"): ToolClassification => ({
  id, repo: "o/t", revision, scan: { status: "scanned", files: 1, skipped: 0 }, exposure: exposure as "dependency", readiness: "gap", hits: [],
  surfaces: surfaces.map(([surface, channels]) => ({ surface, channels, readiness: "gap" })),
});

test("lead decisions need quoted evidence at the lead revision, once per surface", () => {
  assert.equal(parseLeadRegister(register([lead()]), changes).leads.length, 1);
  assert.equal(parseLeadRegister(register([lead({ decision: "undetermined", evidence: [] })]), changes).leads[0].decision, "undetermined");
  assert.throws(() => parseLeadRegister(register([lead({ evidence: [] })]), changes), /confirmed needs evidence/);
  assert.throws(() => parseLeadRegister(register([lead({ decision: "not-reached", evidence: [] })]), changes), /not-reached needs evidence/);
  assert.throws(() => parseLeadRegister(register([lead({ evidence: [{ ...quote(3), revision: "b".repeat(40) }] })]), changes), /lead revision/);
  assert.throws(() => parseLeadRegister(register([lead({ surfaces: ["mempool"] })]), changes), /change register/);
  assert.throws(() => parseLeadRegister(register([lead(), lead({ decision: "not-reached" })]), changes), /decided twice/);
  assert.equal(parseLeadRegister(register([lead(), lead({ surfaces: ["transaction-encoding"], decision: "not-reached" })]), changes).leads.length, 2, "one dependency can split by surface");
});

test("coverage counts per surface and flags stale and orphaned decisions", () => {
  const leads = parseLeadRegister(register([lead(), lead({ tool: "gone" })]), changes);
  const tools = [
    tool("t", [["node-to-client-protocol", [channel("gouroboros@0.209.0<v0.213.0")]], ["transaction-encoding", [channel("gouroboros@0.209.0<v0.213.7"), channel("ogmios", "auxiliary")]]]),
    tool("sdk", [["plutus-script-context", [channel("scalus")]]], "implements"),
    tool("ok", [["plutus-language", [channel("plutus-plutus-core", "shipped", "released")]]]),
  ];
  const coverage = leadCoverage(leads, tools);
  assert.equal(coverage.reviewed, 1);
  assert.deepEqual(coverage.unreviewed, [
    { tool: "t", via: "gouroboros", surfaces: ["transaction-encoding"] }, { tool: "sdk", via: "scalus", surfaces: ["plutus-script-context"] },
  ], "auxiliary and non-gap channels need no decision; boundary propagation does");
  assert.deepEqual(coverage.orphaned, ["gone/gouroboros/node-to-client-protocol"]);
  assert.deepEqual(coverage.confirmedTools, ["t"]);
  assert.deepEqual(leadCoverage(leads, [{ ...tools[0], revision: "c".repeat(40) }]).stale, ["t/gouroboros"]);
});

test("the committed lead register has no stale or orphaned decision for the committed classification", () => {
  const leads = parseLeadRegister(JSON.parse(readFileSync("content/readiness/dijkstra/leads.json", "utf8")), changes);
  const { tools } = JSON.parse(readFileSync("content/readiness/dijkstra/classification.json", "utf8")) as { tools: ToolClassification[] };
  const coverage = leadCoverage(leads, tools);
  // Gaps not yet read are allowed and shown as such; a decision must still match a gap at the scanned revision.
  assert.deepEqual([coverage.stale, coverage.orphaned], [[], []]);
});

test("own-code decisions cover a non-boundary tool's marker surfaces; open surfaces may be decided", () => {
  // Typed as the helper's channel union member so it fits the fixture builder; the value is a marker.
  const marker = { channel: "marker" as "dependency", via: "marker:raw-cbor-codec", readiness: "unassessed" as "gap", lines: 2, scope: "shipped" as const };
  const tools = [
    tool("wallet", [["transaction-encoding", [marker, channel("csl", "shipped", "no-evidence")]], ["block-encoding", [marker]]]),
    tool("codec", [["transaction-encoding", [marker]]], "implements"),
  ];
  const own = lead({ tool: "wallet", via: "own", surfaces: ["transaction-encoding"], decision: "not-reached" });
  const open = lead({ tool: "wallet", via: "csl", surfaces: ["transaction-encoding"], decision: "not-reached" });
  const coverage = leadCoverage(parseLeadRegister(register([own, open]), changes), tools, new Set(["codec"]));
  assert.deepEqual(coverage.ownUnreviewed, [{ tool: "wallet", surfaces: ["block-encoding"] }], "a boundary component's own code is R2's, not a lead");
  assert.deepEqual(coverage.orphaned, [], "a decision on a surface waiting for its component's verdict is matched");
  assert.deepEqual(coverage.unreviewed, [], "open surfaces are optional");
  const stray = leadCoverage(parseLeadRegister(register([lead({ tool: "codec", via: "own", surfaces: ["transaction-encoding"] })]), changes), tools, new Set(["codec"]));
  assert.deepEqual(stray.orphaned, ["codec/own/transaction-encoding"]);
});
