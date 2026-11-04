import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Graph } from "../map-types";
import { inventory } from "./core";
import { resolveNative } from "./adapters";
import { acquireLock, addEvidence, mergeResolution, Store } from "./store";
import { calculateImpact } from "./impact";
import { importReview, reconcileReviewQueue, reviewPacket } from "./review";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "readiness-review-"));
  const store = new Store(directory);
  const snapshot = inventory({ nodes: [{ id: "tool", name: "Tool", repo: "owner/repo", team: "Team" }] } as Graph, "commit");
  const source = store.evidence({ revision: "a".repeat(40), content: "const client = connect('https://provider.example/api');" }, "Pinned integration source");
  addEvidence(snapshot, source); snapshot.tools[0].evidenceIds.push(source.id);
  const native = { name: "tool", lockfileVersion: 3, packages: { "": { name: "tool", version: "1.0.0" } } };
  const nativeEvidence = store.evidence(native, "Native lock"); addEvidence(snapshot, nativeEvidence);
  mergeResolution(snapshot, resolveNative(native, { toolId: "tool", adapter: "npm-lock", release: "1.0.0", revision: "a".repeat(40), command: "npm", toolchain: "npm 10", platform: "all", features: [], rootNames: ["tool"], origin: "source-reconstruction" }, { native: nativeEvidence.id, configuration: nativeEvidence.id }));
  const packet = reviewPacket(snapshot, ["tool"]);
  const finding = { id: "f1", toolId: "tool", kind: "relationship", rationale: "Production entry point connects to provider", from: snapshot.profiles[0].roots[0], target: { ecosystem: "service", name: "Provider", version: null, source: "https://provider.example/api", integrity: null }, type: "service", scope: "runtime", optional: false, condition: null, citations: [{ evidenceId: source.id, pointer: "/content", quote: "connect('https://provider.example/api')" }] };
  const result = { packetId: packet.packetId, inputDigest: packet.inputDigest, completion: "complete", inspectedAreas: ["entry point"], unreviewedAreas: ["provider deployment"], findings: [finding] };
  return { directory, store, snapshot, packet, result };
}

test("manual findings default to suggested, survive idempotent import, and retain opaque boundaries", () => {
  const { directory, store, snapshot, packet, result } = fixture();
  try {
    const next = importReview(snapshot, store, packet, result);
    assert.equal(snapshot.edges.length, 0);
    assert.equal(next.edges[0].verification, "suggested");
    assert.deepEqual(calculateImpact(next)[0].required, []);
    assert.deepEqual(calculateImpact(next)[0].potential, ["tool"]);
    assert.ok(next.tools[0].gaps.some((g) => g.reason.includes("opaque boundary")));
    assert.equal(next.tools[0].readiness, "unassessed");
    assert.equal(importReview(next, store, packet, result).edges.length, 1);
  } finally { rmSync(directory, { recursive: true }); }
});

test("invalid citations, stale packets, and cross-scope findings cannot change the graph", () => {
  const { directory, store, snapshot, packet, result } = fixture();
  try {
    const invalid = structuredClone(result); invalid.findings[0].citations[0].quote = "not in source";
    assert.throws(() => importReview(snapshot, store, packet, invalid), /does not match/);
    invalid.findings[0].citations[0].pointer = "/missing";
    assert.throws(() => importReview(snapshot, store, packet, invalid), /does not exist/);
    const outside = structuredClone(result); outside.findings[0].toolId = "another-tool";
    assert.throws(() => importReview(snapshot, store, packet, outside), /outside packet/);
    snapshot.tools[0].revision = "b".repeat(40);
    assert.throws(() => importReview(snapshot, store, packet, result), /Stale/);
    assert.equal(snapshot.edges.length, 0);
  } finally { rmSync(directory, { recursive: true }); }
});

test("explicit evidence decisions can promote a previously suggested relationship", () => {
  const { directory, store, snapshot, packet, result } = fixture();
  try {
    const suggested = importReview(snapshot, store, packet, result);
    const currentPacket = reviewPacket(suggested, ["tool"]);
    const updated = { ...result, packetId: currentPacket.packetId, inputDigest: currentPacket.inputDigest };
    const decisions = { decisions: [{ findingId: "f1", verification: "verified", previousVerification: "suggested", method: "source-review", rationale: "Checked the production entry point and its unconditional call." }] };
    const next = importReview(suggested, store, currentPacket, updated, decisions);
    assert.equal(next.edges.length, 1);
    assert.equal(next.edges[0].verification, "verified");
    assert.equal(next.decisions.length, 2);
    assert.deepEqual(calculateImpact(next)[0].required, ["tool"]);
    assert.equal(next.tools[0].readiness, "unassessed");
  } finally { rmSync(directory, { recursive: true }); }
});

test("a single writer protects shared snapshot state", () => {
  const directory = mkdtempSync(join(tmpdir(), "readiness-lock-"));
  try {
    const release = acquireLock(directory);
    assert.throws(() => acquireLock(directory), /in use/);
    release(); acquireLock(directory)();
  } finally { rmSync(directory, { recursive: true }); }
});

test("pending review packets are marked stale when their evidence context changes", () => {
  const { directory, snapshot, packet } = fixture();
  try {
    const index = [{ packetId: packet.packetId, toolIds: ["tool"], status: "pending" }];
    assert.equal(reconcileReviewQueue(snapshot, index)[0].status, "pending");
    snapshot.tools[0].revision = "b".repeat(40);
    assert.equal(reconcileReviewQueue(snapshot, index)[0].status, "needs-revalidation");
    assert.equal(index[0].status, "pending", "queue reconciliation does not mutate the input");
  } finally { rmSync(directory, { recursive: true }); }
});
