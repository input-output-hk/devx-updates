import { test } from "node:test";
import assert from "node:assert/strict";
import { citationUrl, devnetResults, dijkstraSite, toolLeads } from "./dijkstra-site";

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
