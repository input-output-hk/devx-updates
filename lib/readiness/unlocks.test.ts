import { test } from "node:test";
import assert from "node:assert/strict";
import type { BoundaryRegister } from "./boundary";
import type { LeadRegister } from "./leads";
import type { ToolClassification } from "./surfaces";
import { toolBlockers, unlockReport, unlocksOf } from "./unlocks";

const revision = "a".repeat(40);
const component = (id: string, gap: string[] = [], status = "gap") => ({
  id, repo: `o/${id}`, roles: [], surfaces: [], observed: { branch: "main", revision, date: "2026-10-20", release: null }, dependsOn: [],
  assessments: gap.length ? [{ surfaces: gap, status, summary: "s", evidence: [] }] : [],
});
const boundary = { schemaVersion: 1, retrieved: "2026-10-20", method: [], components: [component("scalus", ["plutus-script-context"]), component("mesh"), component("sdk", ["protocol-parameters"]), component("gouroboros", ["block-encoding"], "in-progress")] } as unknown as BoundaryRegister;
// Each tool lists [surface, via] gap channels; a pinned via carries `@version<first`.
const tool = (id: string, gaps: [string, string][]): ToolClassification => ({
  id, repo: `o/${id}`, revision, scan: { status: "scanned", files: 1, skipped: 0 }, exposure: "dependency", readiness: "gap", hits: [],
  surfaces: gaps.map(([surface, via]) => ({ surface, readiness: "gap", channels: [{ channel: "dependency", via, readiness: "gap", lines: 1, scope: "shipped" }] })),
});
const tools = [
  tool("scalus", []), tool("mesh", [["plutus-script-context", "scalus"]]), tool("dapp", [["plutus-script-context", "mesh"]]),
  tool("wallet", [["plutus-script-context", "scalus"], ["protocol-parameters", "sdk"]]),
  tool("cli", [["node-to-client-protocol", "gouroboros@0.209.0<v0.213.0"]]),
  tool("indexer", [["plutus-script-context", "scalus"], ["node-to-client-protocol", "gouroboros@0.209.0<v0.213.0"]]),
  tool("quiet", [["plutus-script-context", "scalus"]]),
];
const lead = (t: string, via: string, surface: string, decision = "confirmed") => ({ tool: t, revision, via, surfaces: [surface], decision, summary: "s", evidence: [] });
const leads = { schemaVersion: 1, reviewed: "2026-10-20", method: [], leads: [
  lead("mesh", "scalus", "plutus-script-context"), lead("dapp", "mesh", "plutus-script-context"),
  lead("wallet", "scalus", "plutus-script-context"), lead("wallet", "sdk", "protocol-parameters"),
  lead("cli", "gouroboros", "node-to-client-protocol"),
  lead("indexer", "scalus", "plutus-script-context"), lead("indexer", "gouroboros", "node-to-client-protocol"),
  lead("quiet", "scalus", "plutus-script-context", "not-reached"),
] } as unknown as LeadRegister;

test("blockers separate upstream fixes, own pins and own gaps", () => {
  const byTool = new Map(toolBlockers(tools, leads, boundary).map((t) => [t.tool, t.blockers.map((b) => `${b.kind}:${b.via}`)]));
  assert.deepEqual(byTool.get("scalus"), ["own-gap:scalus"]);
  assert.deepEqual(byTool.get("cli"), ["own-bump:gouroboros"]);
  assert.deepEqual(byTool.get("wallet"), ["upstream-fix:scalus", "upstream-fix:sdk"]);
  assert.deepEqual(byTool.get("quiet"), [], "a not-reached gap blocks nothing");
});

test("a fix unlocks direct consumers, then consumers of what it unblocked, and lists the rest as partial", () => {
  const consumer = tool("mesh-dapp", []);
  consumer.surfaces = [{ surface: "transaction-encoding", readiness: "no-evidence", channels: [{ channel: "dependency", via: "mesh", readiness: "no-evidence", lines: 1, scope: "shipped" }] }];
  const scalus = unlocksOf("scalus", toolBlockers(tools, leads, boundary), [...tools, consumer]);
  assert.deepEqual(scalus.downstream, [{ tool: "mesh-dapp", via: "mesh" }], "consumers of what a fix unblocks are listed, unconfirmed");
  assert.deepEqual(scalus.unlocks.map((u) => [u.tool, u.path.join(">"), u.bumps]), [
    ["indexer", "scalus>indexer", ["gouroboros@0.209.0<v0.213.0"]], ["mesh", "scalus>mesh", []], ["dapp", "scalus>mesh>dapp", []],
  ]);
  assert.deepEqual(scalus.partial, [{ tool: "wallet", stillBlockedBy: ["sdk"] }]);
  const report = unlockReport(tools, leads, boundary);
  assert.deepEqual(report.bumpReady, [{ tool: "cli", pins: ["gouroboros@0.209.0<v0.213.0"], steps: [{ package: "gouroboros", from: "0.209.0", to: "v0.213.0", breaking: true }], unread: [] }]);
  const ported = unlockReport([tool("gouroboros", [["block-encoding", "ouroboros-consensus@3.0.1<5.1.0.1"]])], { ...leads, leads: [lead("gouroboros", "ouroboros-consensus", "block-encoding")] } as unknown as LeadRegister, boundary);
  assert.deepEqual(ported.bumpReady, [{
    tool: "gouroboros", pins: ["ouroboros-consensus@3.0.1<5.1.0.1"], steps: [{ package: "ouroboros-consensus", from: "3.0.1", to: "5.1.0.1", breaking: true }],
    ownStatus: "in-progress", unread: [],
  }], "a boundary component's bump carries its own status");
  assert.deepEqual(report.components.map((c) => [c.component, c.unlocks.length, c.ownGap]), [["scalus", 3, ["plutus-script-context"]], ["mesh", 0, []], ["sdk", 0, ["protocol-parameters"]]], "mesh alone unlocks nothing while it waits on scalus");
});

test("inherited gaps without a decision are listed as unread", () => {
  const unread = tool("cli", [["node-to-client-protocol", "gouroboros@0.209.0<v0.213.0"], ["block-encoding", "ogmios"]]);
  const [blockers] = toolBlockers([unread], leads, boundary);
  assert.deepEqual(blockers.unread, [{ via: "ogmios", surfaces: ["block-encoding"] }]);
  assert.deepEqual(unlockReport([unread], leads, boundary).bumpReady.map((b) => b.unread), [["ogmios"]], "a bump-ready tool still shows what is unread");
});

test("the fix order adds, at each step, the component that unlocks the most on top of the earlier ones", () => {
  assert.deepEqual(unlockReport(tools, leads, boundary).fixOrder, [
    { component: "scalus", added: ["dapp", "indexer", "mesh"], unlocked: 3 },
    { component: "sdk", added: ["wallet"], unlocked: 4 },
  ]);
});

test("a fixed component that waits on another unlocks nothing until that one is fixed too", () => {
  const b = { ...boundary, components: [component("indexer-db", ["block-encoding"]), component("api", ["era-identity"]), component("node-client", ["block-encoding"])] } as unknown as BoundaryRegister;
  const ts = [
    tool("indexer-db", []), tool("api", [["block-encoding", "indexer-db"]]), tool("node-client", []),
    tool("app1", [["era-identity", "api"]]), tool("app2", [["era-identity", "api"]]), tool("app3", [["era-identity", "api"]]),
    tool("app4", [["block-encoding", "node-client"]]), tool("app5", [["block-encoding", "node-client"]]),
  ];
  const ls = { ...leads, leads: [
    lead("api", "indexer-db", "block-encoding"), ...["app1", "app2", "app3"].map((t) => lead(t, "api", "era-identity")),
    lead("app4", "node-client", "block-encoding"), lead("app5", "node-client", "block-encoding"),
  ] } as unknown as LeadRegister;
  const all = toolBlockers(ts, ls, b);
  const api = unlocksOf("api", all);
  assert.deepEqual(api.unlocks, [], "the api cannot serve the new era while its database cannot index it");
  assert.deepEqual(api.partial.find((p) => p.tool === "api"), { tool: "api", stillBlockedBy: ["indexer-db"] });
  assert.deepEqual(unlocksOf(["indexer-db", "api"], all).unlocks.map((u) => u.path.join(">")), ["indexer-db>api>app1", "indexer-db>api>app2", "indexer-db>api>app3"]);
  assert.deepEqual(unlockReport(ts, ls, b).fixOrder, [
    { component: "node-client", added: ["app4", "app5"], unlocked: 2 },
    { component: "indexer-db", added: [], unlocked: 2 },
    { component: "api", added: ["app1", "app2", "app3"], unlocked: 5 },
  ], "the api is scored with the database it needs (3 tools for 2 fixes), which comes first in its bundle");
});

test("a confirmed own-code decision is an own gap; a decided open surface blocks nothing", () => {
  const app = tool("app", []);
  const open = tool("reader", []);
  open.surfaces = [{ surface: "transaction-encoding", readiness: "no-evidence", channels: [{ channel: "dependency", via: "sdk", readiness: "no-evidence", lines: 1, scope: "shipped" }] }];
  const ls = { ...leads, leads: [
    { ...lead("app", "own", "transaction-encoding"), evidence: [] },
    lead("reader", "sdk", "transaction-encoding"),
  ] } as unknown as LeadRegister;
  const byTool = new Map(toolBlockers([app, open], ls, boundary).map((t) => [t.tool, t.blockers.map((b) => `${b.kind}:${b.via}`)]));
  assert.deepEqual(byTool.get("app"), ["own-gap:app"]);
  assert.deepEqual(byTool.get("reader") ?? [], [], "reached, but the component has no verdict yet");
});
