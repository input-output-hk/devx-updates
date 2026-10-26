import { test } from "node:test";
import assert from "node:assert/strict";
import { citationUrl, dependencyTarget, devnetResults, dijkstraSite, toolLeads, toolStates } from "./dijkstra-site";

test("a channel's via names the catalog tool it reaches", () => {
  assert.equal(dependencyTarget("service:blockfrost"), "blockfrost");
  assert.equal(dependencyTarget("pallas@1.4.0"), "pallas");
  for (const via of ["service:node-socket", "service:submit-api", "dependency:cardano-ledger", "dependency:ouroboros-consensus", "cardano-api@11.8.0.0"])
    assert.equal(dependencyTarget(via), "cardano-node", via);
  assert.equal(dependencyTarget("ouroboros-network-js"), "ouroboros-network-js", "a catalog tool with a node-like name stays itself");
});

test("the site view loads every committed Dijkstra register and links to pinned lines", () => {
  const site = dijkstraSite();
  assert.equal(site.classification.tools.size, 268);
  const confirmed = new Set(site.leads.leads.filter((l) => l.decision === "confirmed").map((l) => l.tool));
  for (const tool of confirmed) assert.ok(site.classification.tools.has(tool), `${tool} is a classified tool`);
  for (const c of site.unlocks.components) for (const u of c.unlocks) assert.ok(site.classification.tools.has(u.tool), `${u.tool} links to a tool page`);
  const lace = toolLeads(site, "lace").map((l) => l.decision);
  assert.ok(lace.includes("confirmed") && lace.lastIndexOf("confirmed") < lace.indexOf("not-reached"), "confirmed decisions come first");
  assert.match(citationUrl(site.changes.changes[0].citations[0]), /^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/[0-9a-f]{40}\/.+#L\d+$/);
  assert.deepEqual([...new Set(devnetResults(site, "txtop").map((r) => r.result.kind))], ["tool"], "tool pages show their devnet results");
  assert.ok(devnetResults(site, "gouroboros").some((r) => r.result.outcome === "fail"), "components show failing devnet results too");
});

test("each tool touching a changed surface gets one hardfork state, most reached first", () => {
  const site = dijkstraSite();
  const states = toolStates(site);
  const by = new Map(states.map((s) => [s.tool, s]));
  assert.equal(states[0].tool, "cardano-node", "tools on the node socket, submit API or node libraries depend on the node");
  assert.ok(by.get("cardano-node")!.dependents.length > by.get("blockfrost")!.dependents.length);
  for (let i = 1; i < states.length; i++) assert.ok(states[i - 1].reachedBy.length >= states[i].reachedBy.length, "ranked by everything that reaches it");
  for (const s of states) {
    assert.ok(s.dependents.every((d) => s.reachedBy.includes(d)), `${s.tool}: direct dependents are reached`);
    assert.ok(!s.reachedBy.includes(s.tool), `${s.tool} does not reach itself`);
  }
  const node = by.get("cardano-node")!;
  assert.ok(node.reachedBy.includes("meshjs-mesh-sdk") && !node.dependents.includes("meshjs-mesh-sdk"), "reached through the tools it uses");
  assert.equal(by.get("ogmios")?.state, "breaks", "a confirmed own gap breaks");
  assert.equal(by.get("cardano-node")?.state, "in-progress", "the untagged 11.2 set is in progress");
  assert.equal(by.get("plutus-plutus-core")?.state, "ready", "released support with nothing open is ready");
  assert.match(by.get("whisky")!.reason, /must move off maestro/, "a deprecated provider is moved off, not waited on");
  assert.doesNotMatch(by.get("whisky")!.reason, /waits on [^;]*maestro/);
  for (const s of states.filter((s) => s.state === "unverified")) assert.ok(!site.unlocks.blockers.find((b) => b.tool === s.tool)?.blockers.length, `${s.tool} has no confirmed blocker`);
  const pick = (list: typeof states, ids: string[]) => list.map((s) => s.tool).filter((t) => ids.includes(t));
  assert.deepEqual(pick(states, ["amaru", "mithril", "pallas"]), ["pallas", "mithril", "amaru"], "equal reach falls back to direct dependents");
  assert.deepEqual(pick(states, ["blaze", "cardanosharp"]), ["blaze", "cardanosharp"], "equal counts fall back to the id");
  assert.deepEqual(pick(toolStates(site, (id) => (id === "cardanosharp" ? 1 : 0)), ["blaze", "cardanosharp"]), ["cardanosharp", "blaze"], "the weight breaks ties");
});
