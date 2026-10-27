import { compareSnapshots } from "./comparison";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { canonical, inventory, finalize, validate } from "./core";
import { resolveNative } from "./adapters";
import { Store, addEvidence, mergeResolution, writeJson } from "./store";
import { exportPacket, importReview, reviewPacket } from "./review";
import { calculateImpact } from "./impact";
import { capabilityRows } from "./capabilities";
import { rebuildNative } from "./rebuild";
import type { Graph } from "../map-types";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "capability-review-"));
  const store = new Store(directory);
  const snapshot = inventory({ nodes: [{ id: "wallet", name: "Wallet" }, { id: "other", name: "Other" }] } as Graph, "catalog");
  const revision = "a".repeat(40);
  snapshot.tools.find((t) => t.id === "wallet")!.revision = revision;
  const source = store.evidence({ revision, content: "export const submit = (tx) => provider.submitTx(tx);" }, "Pinned runtime source");
  addEvidence(snapshot, source); snapshot.tools.find((t) => t.id === "wallet")!.evidenceIds.push(source.id);
  const raw = { lockfileVersion: 3, packages: { "": { name: "wallet", version: "1.0.0" } } };
  const native = store.evidence(raw, "Lock"); addEvidence(snapshot, native);
  mergeResolution(snapshot, resolveNative(raw, { toolId: "wallet", adapter: "npm-lock", release: "1.0.0", revision, platform: "all-lockfile-targets", features: [], command: "Read lock", toolchain: "npm", origin: "source-reconstruction", rootNames: ["wallet"] }, { native: native.id, configuration: native.id }));
  const packet = reviewPacket(snapshot, ["wallet", "other"]);
  const finding = { id: "submit", kind: "capability", toolId: "wallet", profileId: snapshot.profiles[0].id, capability: "submission", scope: "runtime", condition: "Provider configured", rationale: "Public entry point delegates submission; deployed provider unknown.", citations: [{ evidenceId: source.id, pointer: "/content", quote: "provider.submitTx(tx)" }] };
  const result = { packetId: packet.packetId, inputDigest: packet.inputDigest, completion: "complete", inspectedAreas: ["submit entry point"], unreviewedAreas: ["other capabilities"], findings: [finding] };
  return { directory, store, snapshot, packet, result };
}

test("capability suggestions are scoped, idempotent, retained and independent from reach/readiness", () => {
  const { directory, store, snapshot, packet, result } = fixture();
  try {
    const next = importReview(snapshot, store, packet, result);
    assert.equal(snapshot.capabilities, undefined);
    assert.throws(() => importReview(snapshot, store, { ...packet, taskBriefVersion: 1 }, result), /Stale/);
    assert.equal(next.capabilities?.[0].verification, "suggested");
    assert.equal(next.tools.find((t) => t.id === "wallet")!.capability, "partial");
    assert.ok(next.tools.every((t) => t.readiness === "unassessed"));
    assert.deepEqual(calculateImpact(next), calculateImpact(snapshot));
    assert.equal(next.edges.length, snapshot.edges.length);
    assert.equal(importReview(next, store, packet, result), next);
    assert.equal(compareSnapshots(snapshot, next).capabilities.added.length, 1);
    store.save(next); assert.equal(canonical(store.load()), canonical(next)); store.verify(next);
    const submitted = store.readEvidence(next.evidence.find((e) => e.description.startsWith("Review submission"))!) as { result: unknown; decisions: unknown };
    assert.equal(importReview(snapshot, store, packet, submitted.result, submitted.decisions ?? undefined).semanticDigest, next.semanticDigest, "retained submission replays from its original packet state");
    const refreshed = exportPacket(next, store, ["wallet"], join(directory, "packet"));
    assert.equal(refreshed.taskBriefVersion, 2);
    assert.equal(refreshed.context.capabilities?.length, 1);
    assert.equal(refreshed.context.capabilityDecisions?.length, 1);
    assert.equal(readFileSync(join(directory, "packet/CAPABILITIES.md"), "utf8"), readFileSync("docs/CAPABILITY-REVIEW-FORMAT.md", "utf8"));
    assert.throws(() => rebuildNative(next, store), /invalidate manual/);
  } finally { rmSync(directory, { recursive: true }); }
});

test("explicit capability decisions retain history and require the previous state", () => {
  const { directory, store, snapshot, packet, result } = fixture();
  try {
    let next = importReview(snapshot, store, packet, result);
    for (const state of ["verified", "disputed", "rejected"] as const) {
      const current = reviewPacket(next, ["wallet"]);
      const submission = { ...result, packetId: current.packetId, inputDigest: current.inputDigest };
      const decision = { findingId: "submit", verification: state, method: "source-review", rationale: `Checked source: ${state}` };
      assert.throws(() => importReview(next, store, current, submission, { decisions: [decision] }), /previousVerification/);
      next = importReview(next, store, current, submission, { decisions: [{ ...decision, previousVerification: next.capabilities![0].verification }] });
      assert.equal(next.capabilities!.length, 1);
      assert.equal(next.capabilities![0].verification, state);
    }
    assert.equal(next.capabilityDecisions?.length, 4);
    assert.equal(reviewPacket(next, ["wallet"]).context.capabilityDecisions?.length, 4);
    assert.equal(next.tools.find((t) => t.id === "wallet")!.readiness, "unassessed");
  } finally { rmSync(directory, { recursive: true }); }
});

test("inventory preserves imported capability decisions and review context across catalog refreshes", () => {
  const { directory, store, snapshot, packet, result } = fixture();
  try {
    const reviewed = importReview(snapshot, store, packet, result, { decisions: [{ findingId: "submit", verification: "verified", method: "source-review", rationale: "Checked the pinned submission entry point." }] });
    const catalog = { nodes: [{ id: "wallet", name: "Wallet" }, { id: "other", name: "Other" }] } as Graph;
    const path = join(directory, "catalog.json");
    store.save(reviewed);
    const context = reviewPacket(reviewed, ["wallet"]);
    const refresh = () => execFileSync(process.execPath, ["--import", "tsx", "scripts/readiness/cli.ts", "inventory", "--directory", directory, "--catalog", path], { encoding: "utf8", timeout: 30_000 });
    writeJson(path, catalog);
    refresh();
    const unchanged = store.load();
    assert.equal(unchanged.semanticDigest, reviewed.semanticDigest);
    assert.equal(canonical(reviewPacket(unchanged, ["wallet"])), canonical(context));

    catalog.nodes.push({ id: "new", name: "New tool" } as Graph["nodes"][number]);
    catalog.nodes[0].name = "Renamed wallet";
    writeJson(path, catalog);
    refresh();
    const changed = store.load();
    assert.deepEqual(changed.capabilities, reviewed.capabilities);
    assert.deepEqual(changed.capabilityDecisions, reviewed.capabilityDecisions);
    assert.deepEqual(changed.reviewSubmissions, reviewed.reviewSubmissions);
    assert.deepEqual(changed.evidence, reviewed.evidence);
    assert.equal(changed.tools.find((tool) => tool.id === "wallet")!.name, "Renamed wallet");
    assert.equal(changed.tools.find((tool) => tool.id === "new")!.capability, "unresolved");
    store.verify(changed);
  } finally { rmSync(directory, { recursive: true }); }
});

test("invalid scope, citations, vocabulary and duplicate capabilities reject the whole import", () => {
  const { directory, store, snapshot, packet, result } = fixture();
  try {
    for (const change of [{ profileId: "missing" }, { toolId: "other" }, { capability: "compatible" }, { scope: "production" }, { condition: "null" }, { condition: " null " }, { citations: [] }, { citations: [{ ...result.findings[0].citations[0], quote: "invented quote" }] }]) {
      const bad = structuredClone(result); Object.assign(bad.findings[0], change);
      assert.throws(() => importReview(snapshot, store, packet, bad));
      assert.equal(snapshot.capabilities, undefined);
    }
    const duplicate = structuredClone(result); duplicate.findings.push({ ...duplicate.findings[0], id: "duplicate" });
    assert.throws(() => importReview(snapshot, store, packet, duplicate), /Duplicate capability scope/);
    const badMixed = structuredClone(result); badMixed.findings.push({ ...badMixed.findings[0], id: "bad", profileId: "missing" });
    assert.throws(() => importReview(snapshot, store, packet, badMixed));
    assert.equal(snapshot.capabilities, undefined);
    const old = store.evidence({ revision: "b".repeat(40), content: "provider.submitTx(tx)" }, "Wrong revision");
    addEvidence(snapshot, old); snapshot.tools.find((t) => t.id === "wallet")!.evidenceIds.push(old.id);
    const current = reviewPacket(snapshot, ["wallet"]);
    const staleSource = { ...result, packetId: current.packetId, inputDigest: current.inputDigest, findings: [{ ...result.findings[0], citations: [{ evidenceId: old.id, pointer: "/content", quote: "provider.submitTx(tx)" }] }] };
    assert.throws(() => importReview(snapshot, store, current, staleSource), /profile revision/);
    const valid = importReview(snapshot, store, current, { ...result, packetId: current.packetId, inputDigest: current.inputDigest });
    valid.capabilities![0].condition = "null";
    assert.throws(() => validate(valid), /JSON null/);
  } finally { rmSync(directory, { recursive: true }); }
});

test("capabilities stay historical after source discovery changes and do not invalidate unrelated packets", () => {
  const { directory, store, snapshot, packet, result } = fixture();
  try {
    const other = reviewPacket(snapshot, ["other"]);
    const next = importReview(snapshot, store, packet, result);
    assert.equal(reviewPacket(next, ["other"]).packetId, other.packetId);
    assert.equal(capabilityRows(next)[0].current, true);
    const current = reviewPacket(next, ["wallet"]);
    next.tools.find((t) => t.id === "wallet")!.revision = "b".repeat(40); finalize(next);
    assert.equal(capabilityRows(next)[0].current, false);
    assert.equal(capabilityRows(next)[0].revision, "a".repeat(40));
    assert.throws(() => importReview(next, store, current, { ...result, packetId: current.packetId, inputDigest: current.inputDigest }), /Stale/);
    next.capabilities![0].toolId = "other";
    assert.throws(() => validate(next), /belongs to another tool/);
  } finally { rmSync(directory, { recursive: true }); }
});
