import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseUpgradeRegister, pinStep, upgradeCoverage } from "./upgrades";

const revision = "a".repeat(40);
const quote = { repo: "o/t", revision, path: "Era.hs", line: 16, quote: "type ApiEra = Api.S.ConwayEra" };
const upgrade = (overrides: Record<string, unknown> = {}) => ({ tool: "t", revision, eraHandling: "own-work", summary: "Fixes the era to Conway.", evidence: [quote], ...overrides });
const register = (upgrades: unknown[]) => ({ schemaVersion: 1, reviewed: "2026-10-20", method: ["read shipped code"], upgrades });

test("upgrade readings need quoted evidence at their revision, once per tool", () => {
  assert.equal(parseUpgradeRegister(register([upgrade()])).upgrades.length, 1);
  assert.equal(parseUpgradeRegister(register([upgrade({ eraHandling: "undetermined", evidence: [] })])).upgrades[0].eraHandling, "undetermined");
  assert.throws(() => parseUpgradeRegister(register([upgrade({ evidence: [] })])), /own-work needs evidence/);
  assert.throws(() => parseUpgradeRegister(register([upgrade({ eraHandling: "easy" })])), /eraHandling must be one of/);
  assert.throws(() => parseUpgradeRegister(register([upgrade({ evidence: [{ ...quote, revision: "b".repeat(40) }] })])), /upgrade revision/);
  assert.throws(() => parseUpgradeRegister(register([upgrade(), upgrade()])), /recorded twice/);
});

test("a pin step is breaking unless a fixed release exists on the pin's own release line", () => {
  const pvp = new Set(["cardano-api"]);
  assert.deepEqual(pinStep("yaci@0.3.4.1<v0.3.10|v0.4.2", pvp), { package: "yaci", from: "0.3.4.1", to: "v0.3.10", breaking: false });
  assert.deepEqual(pinStep("pallas@0.30.1<v0.35.1|v1.0.0", pvp), { package: "pallas", from: "0.30.1", to: "v0.35.1", breaking: true });
  assert.equal(pinStep("gouroboros@0.212.5<v0.213.0", pvp)?.breaking, true, "a 0.x minor is a breaking line under semver");
  assert.equal(pinStep("cardano-api@11.0.0.0<11.8.0.0", pvp)?.breaking, true, "PVP treats A.B as the major");
  assert.equal(pinStep("lib@1.2.0<1.4.0", pvp)?.breaking, false, "semver keeps 1.x on one line");
  assert.equal(pinStep("unpinned", pvp), undefined);
});

test("coverage flags bump-ready tools without a reading, stale readings and unknown tools", () => {
  const reg = parseUpgradeRegister(register([upgrade(), upgrade({ tool: "old" }), upgrade({ tool: "gone" })]));
  assert.deepEqual(upgradeCoverage(reg, ["t", "new"], new Map([["t", revision], ["old", "b".repeat(40)], ["new", revision]])), { missing: ["new"], stale: ["old"], orphaned: ["gone"] });
});

test("the committed upgrade register reads every committed bump-ready tool at its classified revision", () => {
  const reg = parseUpgradeRegister(JSON.parse(readFileSync("content/readiness/dijkstra/upgrades.json", "utf8")));
  const { bumpReady } = JSON.parse(readFileSync("content/readiness/dijkstra/unlocks.json", "utf8")) as { bumpReady: { tool: string }[] };
  const { tools } = JSON.parse(readFileSync("content/readiness/dijkstra/classification.json", "utf8")) as { tools: { id: string; revision?: string }[] };
  assert.deepEqual(upgradeCoverage(reg, bumpReady.map((b) => b.tool), new Map(tools.map((t) => [t.id, t.revision]))), { missing: [], stale: [], orphaned: [] });
});
