import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Graph } from "../map-types";
import { inventory } from "./core";
import { parseNativeInput, resolveNative } from "./adapters";
import { parseCollectionBatch } from "./batch";
import { collectionKey, collectionRequests, publishCollection, reuseCollection } from "./collection";
import { collect, refreshNative } from "./collect";
import { Store } from "./store";
import type { NativeInput } from "./types";

const input: NativeInput = { toolId: "connector", adapter: "npm-lock", rootNames: ["connector"], revision: "a".repeat(40), release: "v1", platform: "all-lockfile-targets", features: [], command: "read committed lock", toolchain: "npm lock v3", origin: "source-reconstruction" };
const raw = { formatVersion: 1, lock: { lockfileVersion: 3, packages: {
  "": { name: "connector", devDependencies: { tooling: "1" } },
  react: { name: "connector", version: "1.0.0", dependencies: { core: "*" } },
  core: { name: "core", version: "1.0.0" },
  "node_modules/core": { link: true, resolved: "core" },
  "node_modules/tooling": { version: "1.0.0" },
} } };
const evidence = { native: "native", configuration: "configuration" };
const inventoryFixture = () => inventory({ nodes: [{ id: "connector", name: "Connector", repo: "owner/repo", team: "Team" }] } as Graph, "catalog");

test("explicit npm workspace paths isolate same-named production roots while retaining the complete lock", () => {
  const legacy = resolveNative(raw, input, evidence);
  assert.deepEqual(legacy.profile.roots.map((id) => legacy.occurrences.find((o) => o.id === id)!.locator), ["", "react"]);
  const selected = resolveNative(raw, { ...input, rootPaths: ["react"] }, evidence);
  assert.deepEqual(selected.profile.roots.map((id) => selected.occurrences.find((o) => o.id === id)!.locator), ["react"]);
  assert.equal(selected.occurrences.length, legacy.occurrences.length, "unselected lock entries remain auditable");
  const reachable = new Set(selected.profile.roots);
  for (const edge of selected.edges) if (reachable.has(edge.from)) reachable.add(edge.to);
  assert.deepEqual(selected.occurrences.filter((o) => reachable.has(o.id)).map((o) => o.locator), ["react", "core"], "root orchestration and its development tooling cannot enter selected reach");
  assert.notEqual(selected.profile.id, legacy.profile.id);
  const rootOnly = resolveNative(raw, { ...input, rootPaths: ["."] }, evidence);
  assert.equal(rootOnly.occurrences.find((o) => o.id === rootOnly.profile.roots[0])!.locator, "");
  for (const selection of [{ rootPaths: ["react", "missing"] }, { rootPaths: ["core"] }, { rootPaths: ["react"], rootNames: ["connector", "missing"] }]) {
    assert.throws(() => resolveNative(raw, { ...input, ...selection }, evidence), /Selected root/);
  }
});

test("npm path selection rejects invalid paths and other adapters at import, batch and direct collection boundaries", async () => {
  const snapshot = inventoryFixture();
  Object.assign(snapshot.tools[0], { revision: input.revision, release: input.release });
  const request = { toolId: input.toolId, revision: input.revision, adapter: input.adapter, roots: input.rootNames, platform: input.platform };
  for (const rootPaths of [[], ["react", "react"], [""], ["../react"], ["/react"], ["react/"], ["react//nested"], ["./react"], ["react\\nested"], ["node_modules/tooling"], ["nested/node_modules/tooling"], [null], "react"]) {
    assert.throws(() => parseNativeInput({ ...input, rootPaths }));
    assert.throws(() => parseCollectionBatch({ schemaVersion: 1, requests: [{ ...request, rootPaths }] }, snapshot));
  }
  assert.throws(() => parseNativeInput({ ...input, adapter: "yarn-lock", rootPaths: ["react"] }), /only apply to npm/);
  assert.throws(() => parseCollectionBatch({ schemaVersion: 1, requests: [{ ...request, adapter: "yarn-lock", rootPaths: ["react"] }] }, snapshot), /only apply to npm/);
  await assert.rejects(collect(snapshot, new Store("/unused"), { ...request, adapter: "yarn-lock", rootPaths: ["react"], stateDir: "/unused" }), /only apply to npm/);
  assert.deepEqual(parseCollectionBatch({ schemaVersion: 1, requests: [{ ...request, rootPaths: ["react"] }] }, snapshot)[0].rootPaths, ["react"]);
});

test("explicit npm root paths survive retained registration, cache lookup and refresh", async (t) => {
  t.mock.method(console, "log", () => {}); t.mock.method(console, "error", () => {});
  const directory = mkdtempSync(join(tmpdir(), "readiness-npm-roots-"));
  try {
    const store = new Store(directory);
    const snapshot = inventoryFixture();
    // No manifest is discoverable: refresh can only succeed if it hits this exact cache.
    Object.assign(snapshot.tools[0], { revision: input.revision, release: input.release, manifests: [] });
    const selection = { revision: input.revision, adapter: "npm-lock" as const, roots: input.rootNames, rootPaths: ["react"], path: "", platform: input.platform, resolverContext: "committed-lockfile:npm-workspaces-v1" };
    const result = publishCollection(snapshot, store, selection, { ...input, rootPaths: selection.rootPaths }, raw, [], "https://github.com/owner/repo");
    const options = { ...selection, toolId: input.toolId, stateDir: directory };
    assert.equal(reuseCollection(snapshot, store, options, selection)!.id, result.profile.id);
    assert.equal(reuseCollection(snapshot, store, options, { ...selection, rootPaths: ["."] }), undefined);
    assert.notEqual(collectionKey(selection), collectionKey({ ...selection, rootPaths: undefined }));
    const retained = store.load();
    assert.deepEqual(collectionRequests(retained, store)[0].rootPaths, ["react"]);
    assert.deepEqual(await refreshNative(retained, store, directory), { profilesRequested: 1, failed: 0 });
    assert.equal(store.load().semanticDigest, retained.semanticDigest);
    assert.equal(retained.profiles.length, 1);
  } finally { rmSync(directory, { recursive: true }); }
});
