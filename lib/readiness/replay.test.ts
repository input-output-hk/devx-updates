import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { Graph } from "../map-types";
import { canonical, finalize, inventory } from "./core";
import { resolveNative } from "./adapters";
import { Store, addEvidence, mergeResolution } from "./store";
import { importReview, reviewPacket } from "./review";
import { replaySnapshot } from "./replay";
import type { NativeInput, Snapshot } from "./types";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "readiness-replay-"));
  const store = new Store(directory);
  const snapshot = inventory({ nodes: ["wallet", "other"].map((id) => ({ id, name: id, repo: "owner/repo", team: "Team" })) } as Graph, "catalog");
  const revision = "a".repeat(40);
  const source = store.evidence({ revision, path: "src/index.ts", content: "provider.submitTx(tx)" }, "Pinned source");
  addEvidence(snapshot, source);
  for (const tool of snapshot.tools) {
    tool.revision = revision; tool.evidenceIds.push(source.id);
    const input: NativeInput = { toolId: tool.id, adapter: "npm-lock", release: "1.0.0", revision, platform: "all-lockfile-targets", features: [], command: "Read lock", toolchain: "npm", origin: "source-reconstruction", rootNames: [tool.id] };
    const raw = { lockfileVersion: 3, packages: { "": { name: tool.id, version: "1.0.0", dependencies: { shared: "1" } }, "node_modules/shared": { name: "shared", version: "1.0.0", resolved: "https://registry.npmjs.org/shared/-/shared-1.0.0.tgz" } } };
    const native = store.evidence(raw, "Native lock");
    const configuration = store.evidence(input, "Native configuration");
    addEvidence(snapshot, native); addEvidence(snapshot, configuration);
    mergeResolution(snapshot, resolveNative(raw, input, { native: native.id, configuration: configuration.id }));
  }
  const profile = snapshot.profiles.find((p) => p.toolId === "wallet")!;
  const common = { toolId: "wallet", rationale: "Delegates submission to a configured provider.", citations: [{ evidenceId: source.id, pointer: "/content", quote: "provider.submitTx(tx)" }] };
  const findings = [
    { ...common, id: "service", kind: "relationship", from: profile.roots[0], target: { ecosystem: "service", name: "Provider", version: null, source: "https://provider.example", integrity: null }, type: "service", scope: "runtime", optional: true, condition: "Provider configured" },
    { ...common, id: "submit", kind: "capability", profileId: profile.id, capability: "submission", scope: "runtime", condition: "Provider configured" },
    { ...common, id: "gap", kind: "gap", area: "integration", nextAction: "Identify the deployed provider." },
  ];
  const submit = (s: Snapshot, toolIds = ["wallet"], items: unknown[] = findings, decisions?: unknown) => {
    const packet = reviewPacket(s, toolIds);
    const result = { packetId: packet.packetId, inputDigest: packet.inputDigest, completion: "partial", inspectedAreas: ["entry point"], unreviewedAreas: ["deployment"], findings: items };
    return importReview(s, store, packet, result, decisions);
  };
  return { directory, store, snapshot: finalize(snapshot), submit, findings };
}

test("replay reconstructs chained decisions, independent reviews and gap-only submissions offline", () => {
  const { directory, store, snapshot, submit, findings } = fixture();
  try {
    let next = submit(snapshot);
    // Collection can add a new release after a packet was accepted. Its earlier
    // source/profile context must still replay independently of today's discovery.
    const prior = next.profiles.find((profile) => profile.toolId === "wallet")!;
    const input = { ...store.readEvidence(next.evidence.find((e) => e.id === prior.configurationEvidenceId)!) as NativeInput, revision: "b".repeat(40), release: "2.0.0" };
    const raw = { lockfileVersion: 3, packages: { "": { name: "wallet", version: "2.0.0" } } };
    const native = store.evidence(raw, "New release lock");
    const configuration = store.evidence(input, "New release configuration");
    addEvidence(next, native); addEvidence(next, configuration);
    mergeResolution(next, resolveNative(raw, input, { native: native.id, configuration: configuration.id }));
    next = submit(next, ["other"], [{ id: "other-gap", kind: "gap", toolId: "other", area: "integration", rationale: "Deployment unknown.", nextAction: "Review deployment.", citations: [] }]);
    next = submit(next, ["wallet"], findings, { decisions: ["service", "submit"].map((findingId) => ({ findingId, verification: "verified", previousVerification: "suggested", method: "source-review", rationale: "Checked pinned source and its scope." })) });
    next = submit(next, ["other"], []);
    next.tools.find((tool) => tool.id === "wallet")!.revision = "b".repeat(40);
    store.save(next);
    const beforeFiles = readdirSync(join(directory, "evidence"));
    const before = canonical(next);
    // Stored order is by content hash, not chronological. Replay must follow packet predecessors.
    next.reviewSubmissions!.reverse();
    store.evidence = () => { throw new Error("Replay must not write evidence"); };
    assert.deepEqual(replaySnapshot(next, store), { profiles: 3, reviews: 4 });
    finalize(next);
    assert.equal(canonical(next), before);
    assert.deepEqual(readdirSync(join(directory, "evidence")), beforeFiles);
  } finally { rmSync(directory, { recursive: true }); }
});

test("CLI replay checks admitted manual records instead of passing native-only comparisons", () => {
  const { directory, store, snapshot, submit } = fixture();
  try {
    const reviewed = submit(snapshot);
    store.save(reviewed);
    const run = () => execFileSync(process.execPath, ["--import", "tsx", "scripts/readiness/cli.ts", "replay", "--directory", directory], { encoding: "utf8", timeout: 30_000, stdio: "pipe" });
    assert.match(run(), /2 native profiles and 1 review submissions/);
    reviewed.edges.find((edge) => edge.type === "service")!.verification = "verified";
    store.save(reviewed);
    assert.throws(run, (error: unknown) => {
      assert.match(String((error as { stderr: string }).stderr), /edges: replay mismatch/);
      return true;
    });
  } finally { rmSync(directory, { recursive: true }); }
});

test("overlapping packet scopes replay independently when findings touch different tools", () => {
  const { directory, store, snapshot, submit, findings } = fixture();
  try {
    const first = submit(snapshot, ["wallet", "other"], [findings[1]]);
    const firstReceipt = first.reviewSubmissions![0];
    const otherProfile = snapshot.profiles.find((profile) => profile.toolId === "other")!;
    const second = submit(first, ["other"], [{ ...findings[1], toolId: "other", profileId: otherProfile.id }]);
    const secondReceipt = second.reviewSubmissions!.find((receipt) => receipt.submissionEvidenceId !== firstReceipt.submissionEvidenceId)!;
    // The second packet contains no contribution from the first. Both are
    // independent, even though the first packet selected both tools.
    for (const receipts of [[secondReceipt, firstReceipt], [firstReceipt, secondReceipt]]) {
      const reordered = structuredClone(second); reordered.reviewSubmissions = receipts;
      assert.deepEqual(replaySnapshot(reordered, store), { profiles: 2, reviews: 2 });
    }
  } finally { rmSync(directory, { recursive: true }); }
});

test("replay rejects removed, added or altered manual graph records, decisions and coverage", () => {
  const { directory, store, snapshot, submit } = fixture();
  try {
    const reviewed = submit(snapshot);
    const mutations: ((s: Snapshot) => void)[] = [
      (s) => { s.edges.find((e) => e.type === "service")!.verification = "verified"; },
      (s) => { s.edges = s.edges.filter((e) => e.type !== "service"); },
      (s) => { s.decisions = []; },
      (s) => { s.capabilities![0].rationale = "Invented interpretation"; },
      (s) => { s.capabilityDecisions![0].method = "maintainer-confirmation"; },
      (s) => { s.artifacts.push({ ...s.artifacts[0], id: "extra" }); },
      (s) => { s.tools.find((t) => t.id === "wallet")!.gaps = []; },
      (s) => { s.tools.find((t) => t.id === "wallet")!.integration = "complete"; },
      (s) => { s.tools.find((t) => t.id === "wallet")!.evidenceIds = []; },
    ];
    for (const mutate of mutations) {
      const next = structuredClone(reviewed); mutate(next);
      assert.throws(() => replaySnapshot(next, store), /mismatch|Missing|altered/);
    }
  } finally { rmSync(directory, { recursive: true }); }
});

test("replay fails explicitly for legacy reviews, missing packet bytes and invalid archive references", () => {
  const { directory, store, snapshot, submit } = fixture();
  try {
    const reviewed = submit(snapshot);
    const legacy = structuredClone(reviewed); delete legacy.reviewSubmissions;
    assert.throws(() => replaySnapshot(legacy, store), /lacks archived packet context/);
    const wrong = structuredClone(reviewed);
    wrong.reviewSubmissions![0].packetEvidenceId = wrong.reviewSubmissions![0].submissionEvidenceId;
    assert.throws(() => replaySnapshot(wrong, store), /archived review context/);
    const receipt = reviewed.reviewSubmissions![0];
    const evidence = reviewed.evidence.find((e) => e.id === receipt.packetEvidenceId)!;
    unlinkSync(join(directory, evidence.path));
    assert.throws(() => replaySnapshot(reviewed, store), /ENOENT/);
    assert.equal(readdirSync(join(directory, "evidence")).includes(evidence.path.split("/").pop()!), false);
  } finally { rmSync(directory, { recursive: true }); }
});

test("archived context cannot introduce unproven predecessor graph records", () => {
  const { directory, store, snapshot, submit, findings } = fixture();
  try {
    const unretained = submit(snapshot);
    // Keep a manual edge as though it were a native input, but remove its admission history.
    const ids = new Set(unretained.reviewSubmissions!.flatMap((r) => [r.submissionEvidenceId, r.packetEvidenceId]));
    unretained.evidence = unretained.evidence.filter((e) => !ids.has(e.id));
    const nativeId = snapshot.profiles[0].nativeEvidenceId!;
    for (const t of unretained.tools) t.evidenceIds = t.evidenceIds.filter((id) => !ids.has(id));
    for (const e of unretained.edges) e.evidenceIds = e.evidenceIds.map((id) => ids.has(id) ? nativeId : id);
    for (const n of unretained.occurrences) n.evidenceIds = n.evidenceIds.map((id) => ids.has(id) ? nativeId : id);
    unretained.capabilities = []; unretained.capabilityDecisions = []; unretained.decisions = []; delete unretained.reviewSubmissions;
    const next = submit(finalize(unretained), ["wallet"], [findings[1]]);
    assert.throws(() => replaySnapshot(next, store), /Review input .*mismatch/);
  } finally { rmSync(directory, { recursive: true }); }
});
