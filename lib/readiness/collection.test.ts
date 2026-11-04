import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Graph } from "../map-types";
import { inventory } from "./core";
import { Store } from "./store";
import { collectionCandidates } from "./candidates";
import { collectionKey, collectionRequests, publishCollection, reuseCollection, type CollectionSelection } from "./collection";
import { refreshNative } from "./collect";
import type { NativeInput } from "./types";
import { normalizeNativePaths } from "./source";

test("collection cache requires retained bytes and distinguishes Python and Go configurations", (t) => {
  t.mock.method(console, "log", () => {});
  const directory = mkdtempSync(join(tmpdir(), "readiness-collection-"));
  try {
    const store = new Store(directory);
    const snapshot = inventory({ nodes: [{ id: "tool", name: "Tool", repo: "owner/repo", team: "Team" }] } as Graph, "catalog");
    const selection: CollectionSelection = { revision: "a".repeat(40), adapter: "npm-lock", roots: ["app"], path: "package-lock.json", platform: "all-lockfile-targets", resolverContext: "committed-lockfile" };
    const profile: NativeInput = { toolId: "tool", release: "v1", ...selection, features: [], command: "read lock", toolchain: "npm v3", origin: "source-reconstruction", rootNames: selection.roots };
    const options = { ...selection, toolId: "tool", stateDir: directory };
    publishCollection(snapshot, store, selection, profile, { lockfileVersion: 3, packages: { "": { name: "app", version: "1.0.0" } } }, [], "https://github.com/owner/repo");
    assert.equal(reuseCollection(snapshot, store, options, selection)?.id, snapshot.profiles[0].id);
    assert.equal(reuseCollection(snapshot, store, { ...options, refresh: true }, selection), undefined);
    assert.notEqual(collectionKey({ ...selection, pythonVersion: "3.13" }), collectionKey({ ...selection, pythonVersion: "3.14" }));
    assert.notEqual(collectionKey({ ...selection, patterns: ["./cmd/tool"], tags: [] }), collectionKey({ ...selection, patterns: ["./cmd/tool"], tags: ["integration"] }));
    const native = snapshot.evidence.find((e) => e.id === snapshot.profiles[0].nativeEvidenceId)!;
    writeFileSync(join(directory, native.path), "corrupt bytes");
    assert.equal(reuseCollection(snapshot, store, options, selection), undefined);
    assert.throws(() => store.evidence({ lockfileVersion: 3, packages: { "": { name: "app", version: "1.0.0" } } }, "recollection"), /header|gzip|compression/i, "corrupt evidence cannot silently survive a successful recollection");
    unlinkSync(join(directory, native.path));
    assert.equal(reuseCollection(snapshot, store, options, selection), undefined, "a cached graph cannot conceal missing evidence");
  } finally { rmSync(directory, { recursive: true }); }
});

test("native path normalization preserves relationships across relocated checkouts", () => {
  const native = (root: string) => ({ workspace_root: root, resolution: { [`local:${root}/sdk`]: { source: { virtual: `${root}/sdk` }, dependencies: [{ id: `local:${root}/lib` }] } } });
  assert.deepEqual(normalizeNativePaths(native("/first/checkout"), { "/first/checkout": "/source" }), normalizeNativePaths(native("/second/checkout"), { "/second/checkout": "/source" }));
});

test("Go loading failures remain retryable with unchanged request inputs", (t) => {
  t.mock.method(console, "log", () => {});
  const directory = mkdtempSync(join(tmpdir(), "readiness-go-retry-"));
  try {
    const store = new Store(directory);
    const snapshot = inventory({ nodes: [{ id: "tool", name: "Tool", team: "Team" }] } as Graph, "catalog");
    const selection: CollectionSelection = { revision: "a".repeat(40), adapter: "go-packages", roots: ["example.org/app"], path: "go.mod", platform: "linux/amd64", resolverContext: "go environment" };
    const profile: NativeInput = { ...selection, toolId: "tool", release: "v1", features: [], command: "go list", toolchain: "go1.26.8", origin: "source-reconstruction", rootNames: selection.roots };
    publishCollection(snapshot, store, selection, profile, { formatVersion: 1, sourceRoot: "/source", environment: { GOOS: "linux", GOARCH: "amd64", CGO_ENABLED: "0", GOVERSION: "go1.26.8" }, packages: [{ ImportPath: "example.org/app", Module: { Main: true, Path: "example.org/app", Dir: "/source" }, Error: { Err: "module proxy unavailable" } }], tests: [] }, [], "https://github.com/owner/repo");
    assert.equal(snapshot.profiles[0].coverage, "partial");
    assert.equal(reuseCollection(snapshot, store, { ...selection, toolId: "tool", stateDir: directory }, selection), undefined);
  } finally { rmSync(directory, { recursive: true }); }
});

test("collection candidates include nested native inputs without guessing package identities", () => {
  const snapshot = inventory({ nodes: [{ id: "tool", name: "Tool", team: "Team" }] } as Graph, "catalog");
  snapshot.tools[0].manifests = ["sdk/pnpm-lock.yaml", "native/Cargo.lock", "native/Cargo.toml", "python/pyproject.toml", "python/uv.lock", "go/go.mod", "docs/package-lock.json", "unsupported/yarn.lock", "orphan/Cargo.lock"];
  const [tool] = collectionCandidates(snapshot);
  assert.equal(tool.candidates.length, 5);
  assert.ok(tool.candidates.some((c) => c.adapter === "uv-tree" && c.path === "python/pyproject.toml"));
  assert.ok(tool.candidates.some((c) => c.adapter === "cargo-metadata" && c.path === "native/Cargo.toml"));
  assert.equal(tool.packageHint, null);
  assert.throws(() => collectionCandidates(snapshot, ["missing"]), /Unknown tool/);
});

test("native refresh selects and bounds deduplicated requests before running collectors", async (t) => {
  t.mock.method(console, "log", () => {});
  const progress = t.mock.method(console, "error", () => {});
  const directory = mkdtempSync(join(tmpdir(), "readiness-refresh-"));
  try {
    const store = new Store(directory);
    const snapshot = inventory({ nodes: ["alpha", "beta", "unregistered"].map((id) => ({ id, name: id, repo: "owner/repo", team: "Team" })) } as Graph, "catalog");
    for (const [toolId, revision] of [["beta", "a".repeat(40)], ["alpha", "a".repeat(40)], ["alpha", "b".repeat(40)]]) {
      const tool = snapshot.tools.find((tool) => tool.id === toolId)!;
      Object.assign(tool, { revision, release: "v1", manifests: ["package-lock.json"] });
      // Empty path is the recorded default used by the npm collector.
      const selection: CollectionSelection = { revision, adapter: "npm-lock", roots: ["app"], path: "", platform: "all-lockfile-targets", resolverContext: "committed-lockfile:npm-workspaces-v1" };
      const profile: NativeInput = { ...selection, toolId, release: "v1", features: [], command: "read lock", toolchain: "npm v3", origin: "source-reconstruction", rootNames: selection.roots };
      publishCollection(snapshot, store, selection, profile, { formatVersion: 1, lock: { lockfileVersion: 3, packages: { "": { name: "app", version: "1.0.0" } } } }, [], "https://github.com/owner/repo");
    }
    assert.equal(snapshot.collections!.length, 3);
    assert.deepEqual(collectionRequests(snapshot, store).map((r) => r.toolId), ["alpha", "beta"], "historical revisions do not duplicate a refresh request");
    assert.deepEqual(collectionRequests(snapshot, store, { toolIds: ["beta"], limit: 1 }).map((r) => r.toolId), ["beta"]);
    for (const limit of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => collectionRequests(snapshot, store, { limit }), /positive integer/);
    assert.throws(() => collectionRequests(snapshot, store, { toolIds: ["missing"] }), /Unknown tool/);
    assert.throws(() => collectionRequests(snapshot, store, { toolIds: ["unregistered"] }), /No registered/);
    const original = store.load().semanticDigest;
    assert.deepEqual(await refreshNative(snapshot, store, directory, false, { toolIds: ["beta"], limit: 1 }), { profilesRequested: 1, failed: 0 });
    assert.equal(store.load().semanticDigest, original, "a selected cache hit leaves the retained snapshot unchanged");
    assert.match(String(progress.mock.calls[0].arguments[0]), /1\/1: beta/);
    // A failed request must not prevent the next registered request from running.
    snapshot.tools.find((tool) => tool.id === "alpha")!.revision = undefined;
    assert.deepEqual(await refreshNative(snapshot, store, directory), { profilesRequested: 2, failed: 1 });
    assert.ok(progress.mock.calls.some((call) => String(call.arguments[0]).includes("2/2: beta")));
  } finally { rmSync(directory, { recursive: true }); }
});
