import { compareSnapshots } from "./comparison";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Graph } from "../map-types";
import { canonical, digest, finalize, inventory } from "./core";
import { parseNativeInput, resolveNative } from "./adapters";
import { addEvidence, mergeResolution, readJson, readSnapshot, Store, writeJson } from "./store";
import { decodeSnapshot, MAX_SNAPSHOT_CHUNK_BYTES, snapshotFiles } from "./snapshot-storage";
import { aggregateProjects, calculateImpact } from "./impact";
import { reviewPacket } from "./review";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "readiness-storage-"));
  const store = new Store(directory);
  const snapshot = inventory({ nodes: [{ id: "one", name: "One", team: "Team" }, { id: "two", name: "Two", team: "Team" }] } as Graph, "catalog", "2026-10-18T00:00:00Z");
  const raw = { lockfileVersion: 3, packages: { "": { name: "app", version: "1", dependencies: { shared: "1" }, optionalDependencies: { provider: "1" } }, "node_modules/shared": { version: "1", dependencies: { provider: "1" } }, "node_modules/provider": { version: "1" } } };
  const input = parseNativeInput({ toolId: "one", release: "v1", revision: "a".repeat(40), adapter: "npm-lock", rootNames: ["app"], platform: "all-lockfile-targets", features: [], command: "read lock", toolchain: "npm 10", origin: "source-reconstruction" });
  const native = store.evidence(raw, "Native output"); const config = store.evidence(input, "Configuration");
  addEvidence(snapshot, native); addEvidence(snapshot, config);
  const refs = { native: native.id, configuration: config.id };
  mergeResolution(snapshot, resolveNative(raw, input, refs));
  finalize(snapshot);
  return { directory, store, snapshot, raw, input, refs };
}

test("legacy and partitioned snapshots preserve graph identity, reports, review inputs, and manual decisions", () => {
  const f = fixture();
  try {
    f.snapshot.edges[0].verification = "disputed";
    f.snapshot.decisions.push({ id: "decision:test", packetId: "packet:test", edgeId: f.snapshot.edges[0].id, verification: "disputed", rationale: "Review evidence", method: "source-review", evidenceIds: [f.refs.native] });
    finalize(f.snapshot);
    const original = canonical(f.snapshot);
    writeJson(join(f.directory, "snapshot.json"), f.snapshot);
    assert.equal(canonical(f.store.load()), original, "old monolithic snapshots still load");
    f.store.save(f.snapshot, { preserveTimestamp: true });
    assert.equal((readJson(join(f.directory, "snapshot.json")) as { storageVersion: number }).storageVersion, 1);
    const restored = f.store.load();
    assert.equal(canonical(restored), original);
    assert.deepEqual(calculateImpact(restored), calculateImpact(f.snapshot));
    assert.deepEqual(aggregateProjects(restored), aggregateProjects(f.snapshot));
    assert.equal(canonical(reviewPacket(restored, ["one"])), canonical(reviewPacket(f.snapshot, ["one"])));
    assert.deepEqual(compareSnapshots(f.snapshot, restored).edges.changed, []);
    const exported = join(f.directory, "export.json"); writeJson(exported, restored);
    assert.equal(canonical(readSnapshot(exported)), original, "exports remain self-contained legacy-format snapshots");
    const neighbor = [...restored.edges[1].evidenceIds];
    restored.edges[0].evidenceIds.push("a-new-review-citation");
    assert.deepEqual(restored.edges[1].evidenceIds, neighbor, "shared storage must not alias mutable arrays");
  } finally { rmSync(f.directory, { recursive: true }); }
});

test("graph chunks are deterministic, bounded, and unaffected by another profile's addition", () => {
  const f = fixture();
  try {
    for (let index = 0; index < 1600; index++) f.snapshot.occurrences.push({ ...f.snapshot.occurrences[0], id: `occurrence:large-${index}`, locator: "x".repeat(2000) });
    finalize(f.snapshot);
    const first = snapshotFiles(f.snapshot);
    assert.deepEqual(snapshotFiles(f.snapshot), first);
    assert.ok(first.manifest.tables.occurrences.length > 1);
    assert.ok(first.chunks.every((chunk) => Buffer.byteLength(chunk.content) <= MAX_SNAPSHOT_CHUNK_BYTES));
    const files = new Map(first.chunks.map((chunk) => [chunk.path, chunk.content]));
    assert.equal(canonical(decodeSnapshot(first.manifest, (path) => files.get(path)!)), canonical(f.snapshot));
    mergeResolution(f.snapshot, resolveNative(f.raw, { ...f.input, toolId: "two" }, f.refs));
    finalize(f.snapshot);
    const second = snapshotFiles(f.snapshot);
    for (const kind of ["occurrences", "edges"] as const) for (const reference of first.manifest.tables[kind]) {
      assert.ok(second.manifest.tables[kind].some((next) => next.path === reference.path), "unrelated profiles retain their immutable chunks");
    }
  } finally { rmSync(f.directory, { recursive: true }); }
});

test("storage rejects missing, altered, misreferenced, and semantically inconsistent chunks", () => {
  const f = fixture();
  try {
    f.store.save(f.snapshot);
    const encoded = snapshotFiles(f.snapshot);
    const files = new Map(encoded.chunks.map((chunk) => [chunk.path, chunk.content]));
    const read = (path: string) => files.get(path)!;
    const reference = encoded.manifest.tables.edges[0];
    const content = read(reference.path);
    files.set(reference.path, `${content} `);
    assert.throws(() => decodeSnapshot(encoded.manifest, read), /checksum mismatch/);
    files.set(reference.path, content);
    const escaped = structuredClone(encoded.manifest); escaped.tables.edges[0].path = "../secrets";
    assert.throws(() => decodeSnapshot(escaped, read), /Invalid snapshot chunk path/);
    const wrongCount = structuredClone(encoded.manifest); wrongCount.tables.edges[0].records++;
    assert.throws(() => decodeSnapshot(wrongCount, read), /record count mismatch/);
    const duplicate = structuredClone(encoded.manifest); duplicate.tables.edges.push(reference);
    assert.throws(() => decodeSnapshot(duplicate, read), /Duplicate snapshot chunk/);
    const badIndex = JSON.parse(content); badIndex.records[0].evidenceSet = -1;
    const changed = JSON.stringify(badIndex); const hash = digest(changed); const path = `snapshots/edges/${hash}.json`;
    files.set(path, changed);
    const badManifest = structuredClone(encoded.manifest); badManifest.tables.edges[0] = { ...reference, path, digest: hash };
    assert.throws(() => decodeSnapshot(badManifest, read), /evidence-set reference/);
    const wrongDigest = structuredClone(encoded.manifest); wrongDigest.snapshot.semanticDigest = "wrong";
    assert.throws(() => decodeSnapshot(wrongDigest, read), /semantic digest mismatch/);
    unlinkSync(join(f.directory, reference.path));
    assert.throws(() => f.store.load(), /ENOENT/);
  } finally { rmSync(f.directory, { recursive: true }); }
});

test("failed chunk writes leave the previous manifest usable and old manifests retain their chunks", () => {
  const f = fixture();
  try {
    f.store.save(f.snapshot);
    const manifestPath = join(f.directory, "snapshot.json");
    const previous = readFileSync(manifestPath, "utf8");
    const originalDigest = f.snapshot.semanticDigest;
    f.snapshot.edges[0].verification = "suggested"; finalize(f.snapshot);
    const next = snapshotFiles(f.snapshot);
    const existing = JSON.parse(previous).tables.edges.map((reference: { path: string }) => reference.path);
    const changed = next.chunks.find((chunk) => chunk.path.startsWith("snapshots/edges/") && !existing.includes(chunk.path))!;
    writeFileSync(join(f.directory, changed.path), "interrupted or corrupt bytes");
    assert.throws(() => f.store.save(f.snapshot), /Corrupt existing snapshot chunk/);
    assert.equal(readFileSync(manifestPath, "utf8"), previous);
    assert.equal(f.store.load().semanticDigest, originalDigest);
    unlinkSync(join(f.directory, changed.path));
    f.store.save(f.snapshot);
    assert.equal(f.store.load().semanticDigest, f.snapshot.semanticDigest);
    assert.equal(decodeSnapshot(JSON.parse(previous), (path) => readFileSync(join(f.directory, path), "utf8")).semanticDigest, originalDigest);
  } finally { rmSync(f.directory, { recursive: true }); }
});
