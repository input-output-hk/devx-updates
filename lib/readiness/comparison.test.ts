import { test } from "node:test";
import assert from "node:assert/strict";
import type { Graph } from "../map-types";
import { compareSnapshots } from "./comparison";
import { finalize, inventory } from "./core";
import { resolveNative } from "./adapters";
import { mergeResolution } from "./store";
import type { NativeInput, Snapshot } from "./types";

function fixture(ids = ["one"]) {
  const snapshot = inventory({ nodes: ids.map((id) => ({ id, name: id.toUpperCase(), team: "Team", repo: `owner/${id}` })) } as Graph, "catalog");
  snapshot.evidence.push({ id: "evidence:fixture", digest: "a".repeat(64), path: `evidence/${"a".repeat(64)}.json.gz`, description: "Captured native fixture" });
  return snapshot;
}
function add(snapshot: Snapshot, toolId: string, version = "1", patch: Partial<NativeInput> = {}) {
  const input: NativeInput = { toolId, release: "v1", revision: "a".repeat(40), adapter: "npm-lock", rootNames: [toolId], platform: "all-lockfile-targets", features: [], command: "read lock", toolchain: "npm 10", origin: "source-reconstruction", ...patch };
  mergeResolution(snapshot, resolveNative({ lockfileVersion: 3, packages: {
    "": { name: toolId, version: "1", dependencies: { shared: version } },
    "node_modules/shared": { version, resolved: `https://registry.npmjs.org/shared/-/shared-${version}.tgz`, integrity: `sha512-${version}` },
    "node_modules/unreachable": { version, resolved: `https://registry.npmjs.org/unreachable/-/unreachable-${version}.tgz` },
  } }, input, { native: "evidence:fixture", configuration: "evidence:fixture" }));
  finalize(snapshot);
}

test("identical semantic snapshots have no detailed changes despite ordering and timestamps", () => {
  const before = fixture(); add(before, "one");
  const after = structuredClone(before);
  after.generatedAt = "later"; after.tools[0].lastAttempt = "later";
  after.artifacts.reverse(); after.edges.reverse(); finalize(after);
  const diff = compareSnapshots(before, after);
  assert.equal(diff.from, diff.to);
  assert.deepEqual(diff.tools, []); assert.deepEqual(diff.versions, []); assert.deepEqual(diff.reach, []);
});

test("equal reach counts still explain swapped consumers and retain removed-side evidence", () => {
  const before = fixture(["one"]); add(before, "one");
  const after = fixture(["two"]); add(after, "two");
  const diff = compareSnapshots(before, after);
  const reach = diff.reach.find((row) => row.artifact.name === "shared")!.buckets[0];
  assert.equal(reach.bucket, "required"); assert.equal(reach.before, 1); assert.equal(reach.after, 1);
  assert.equal(reach.added[0].toolId, "two"); assert.equal(reach.removed[0].toolId, "one");
  assert.ok(before.edges.some((edge) => edge.id === reach.removed[0].edges[0].id));
  assert.ok(after.edges.some((edge) => edge.id === reach.added[0].edges[0].id));
  assert.equal(reach.removed[0].nodes[0].label, "one@1");
  assert.equal(diff.tools.find((tool) => tool.toolId === "one")!.presentAfter, false);
  assert.ok(diff.evidence.before.some((e) => e.id === "evidence:fixture"));
});

test("reach witnesses select eligible parallel edges for verified, optional and potential paths", () => {
  const before = fixture();
  const after = fixture(); add(after, "one");
  const edge = after.edges[0];
  after.edges.push({ ...edge, id: "parallel:suggested", verification: "suggested" }, { ...edge, id: "parallel:build", scope: "build" }, { ...edge, id: "parallel:test", scope: "development" });
  const buckets = compareSnapshots(before, finalize(after)).reach.find((row) => row.artifact.name === "shared")!.buckets;
  assert.deepEqual(buckets.map((b) => b.bucket), ["required", "build", "development", "potential"]);
  for (const bucket of buckets) {
    const witness = bucket.added[0].edges;
    assert.ok(bucket.bucket === "potential" ? witness.some((edge) => edge.verification === "suggested") : witness.every((edge) => edge.verification === "verified"));
    if (bucket.bucket === "build" || bucket.bucket === "development") assert.equal(witness[0].scope, bucket.bucket);
  }
  const optional = fixture(); add(optional, "one"); optional.edges[0].optional = true; finalize(optional);
  const changed = compareSnapshots(optional, after).reach.find((row) => row.artifact.name === "shared")!.buckets;
  assert.equal(changed.find((b) => b.bucket === "optional")!.removed[0].edges[0].optional, true);
  assert.equal(changed.find((b) => b.bucket === "required")!.added[0].edges[0].optional, false);
});

test("version inventories retain historical selections, exclude unreachable records and keep registries separate", () => {
  const before = fixture(); add(before, "one");
  const after = structuredClone(before); add(after, "one", "2", { release: "v2", revision: "b".repeat(40) });
  let diff = compareSnapshots(before, after);
  const versions = diff.versions.find((row) => row.name === "shared")!;
  assert.deepEqual(versions.before, ["1"]); assert.deepEqual(versions.after, ["1", "2"]);
  assert.ok(!diff.versions.some((row) => row.name === "unreachable"));
  assert.ok(diff.tools[0].observations.includes("Additional release/source profile recorded"));
  after.artifacts.find((a) => a.name === "shared" && a.version === "2")!.source = "https://private.example/shared";
  diff = compareSnapshots(before, after);
  assert.equal(diff.versions.filter((row) => row.name === "shared").length, 1);
  assert.equal(diff.versions.find((row) => row.name === "shared")!.source, "https://private.example/shared");
});

test("comparison distinguishes observed configuration/toolchain changes and leaves input causes uncertain", () => {
  const before = fixture(); add(before, "one");
  const configured = structuredClone(before); add(configured, "one", "2", { features: ["provider"] });
  assert.ok(compareSnapshots(before, configured).tools[0].observations.includes("Configuration added or changed"));
  const toolchain = structuredClone(before); add(toolchain, "one", "2", { toolchain: "npm 11" });
  assert.ok(compareSnapshots(before, toolchain).tools[0].observations.includes("Collection command/toolchain changed"));
  const recaptured = structuredClone(before); add(recaptured, "one", "2");
  assert.ok(compareSnapshots(before, recaptured).tools[0].observations.some((observation) => observation.includes("does not identify which")));
  const failed = structuredClone(before); failed.tools[0].discoveryError = "Network unavailable"; failed.tools[0].resolution = "unresolved"; finalize(failed);
  const diff = compareSnapshots(before, failed);
  assert.deepEqual(diff.tools[0].fields.find((field) => field.field === "resolution"), { field: "resolution", before: "partial", after: "unresolved" });
  assert.equal(diff.reach.length, 0);
});

test("manual decision and capability corrections remain visible without a native-profile change", () => {
  const before = fixture(); add(before, "one");
  const after = structuredClone(before);
  after.edges[0].verification = "disputed";
  after.decisions.push({ id: "decision:one", packetId: "packet:one", edgeId: after.edges[0].id, verification: "disputed", rationale: "Counterevidence", method: "review", evidenceIds: ["evidence:fixture"] });
  after.capabilities = [{ id: "capability:one", toolId: "one", profileId: after.profiles[0].id, capability: "query", scope: "runtime", condition: null, verification: "suggested", rationale: "Candidate", evidenceIds: ["evidence:fixture"] }];
  const diff = compareSnapshots(before, finalize(after));
  assert.deepEqual(diff.profiles.changed, []);
  assert.ok(diff.tools[0].observations.includes("Review decisions changed"));
  assert.ok(diff.tools[0].observations.includes("Capability evidence changed"));
  assert.ok(diff.tools[0].observations.includes("Relationship evidence changed within retained profiles"));
  assert.equal(diff.reach.find((row) => row.artifact.name === "shared")!.buckets.find((b) => b.bucket === "required")!.after, 0);
});

test("integration evidence remains inspectable when adding, correcting or removing it does not change reach", () => {
  const before = fixture(); add(before, "one");
  const after = structuredClone(before);
  after.edges.push({ ...after.edges[0], id: "edge:integration", type: "protocol", condition: "Node query interface" });
  const added = compareSnapshots(before, finalize(after));
  assert.equal(added.reach.length, 0);
  const relationship = added.relationships.find((row) => row.id === "edge:integration")!;
  assert.equal(relationship.change, "added"); assert.equal(relationship.before, null);
  assert.equal(relationship.after!.to.label, "shared@1");
  assert.equal(relationship.after!.edge.type, "protocol");
  assert.equal(added.evidence.after[0].id, "evidence:fixture");
  const corrected = structuredClone(after); corrected.edges.find((edge) => edge.id === "edge:integration")!.condition = "Optional endpoint";
  const correction = compareSnapshots(after, finalize(corrected));
  assert.equal(correction.reach.length, 0);
  assert.equal(correction.relationships[0].before!.edge.condition, "Node query interface");
  assert.equal(correction.relationships[0].after!.edge.condition, "Optional endpoint");
  const removed = compareSnapshots(after, before);
  assert.equal(removed.relationships[0].change, "removed"); assert.equal(removed.relationships[0].after, null);
  assert.equal(removed.relationships[0].before!.from.label, "one@1");
  assert.equal(removed.evidence.before[0].id, "evidence:fixture");
});

test("a newly cataloged unresolved tool does not invent a release or revision change", () => {
  const diff = compareSnapshots(fixture([]), fixture(["unknown"]));
  assert.ok(diff.tools[0].observations.includes("Catalog tool added"));
  assert.ok(!diff.tools[0].observations.includes("Discovered release/source changed"));
  assert.ok(!diff.tools[0].fields.some((field) => ["release", "revision"].includes(field.field)));
});
