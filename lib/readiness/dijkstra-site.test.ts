import { test } from "node:test";
import assert from "node:assert/strict";
import { citationUrl, devnetResults, dijkstraSite, toolLeads, toolStates } from "./dijkstra-site";

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

test("each tool touching a changed surface gets one hardfork state, most depended-on first", () => {
  const site = dijkstraSite();
  const states = toolStates(site);
  const by = new Map(states.map((s) => [s.tool, s]));
  assert.equal(states[0].tool, "blockfrost");
  for (let i = 1; i < states.length; i++) assert.ok(states[i - 1].dependents.length >= states[i].dependents.length, "ranked by dependents");
  assert.equal(by.get("ogmios")?.state, "breaks", "a confirmed own gap breaks");
  assert.equal(by.get("cardano-node")?.state, "in-progress", "the untagged 11.2 set is in progress");
  assert.equal(by.get("plutus-plutus-core")?.state, "ready", "released support with nothing open is ready");
  assert.match(by.get("whisky")!.reason, /must move off maestro/, "a deprecated provider is moved off, not waited on");
  assert.doesNotMatch(by.get("whisky")!.reason, /waits on [^;]*maestro/);
  for (const s of states.filter((s) => s.state === "unverified")) assert.ok(!site.unlocks.blockers.find((b) => b.tool === s.tool)?.blockers.length, `${s.tool} has no confirmed blocker`);
  const order = (list: typeof states) => list.map((s) => s.tool).filter((t) => t === "kupo" || t === "cardano-db-sync");
  assert.deepEqual(order(states), ["cardano-db-sync", "kupo"], "equal dependents fall back to the id");
  assert.deepEqual(order(toolStates(site, (id) => (id === "kupo" ? 1 : 0))), ["kupo", "cardano-db-sync"], "the weight breaks ties");
});
