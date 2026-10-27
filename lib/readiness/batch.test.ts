import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Graph } from "../map-types";
import { inventory } from "./core";
import { collectBatch, parseCollectionBatch, type CollectionQueue, type PinnedRequest } from "./batch";
import { publishCollection } from "./collection";
import { readJson, Store, writeJson } from "./store";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "readiness-batch-"));
  const store = new Store(directory);
  const snapshot = inventory({ nodes: ["alpha", "beta", "gamma"].map((id) => ({ id, name: id, repo: "owner/repo", team: "Team" })) } as Graph, "catalog");
  for (const tool of snapshot.tools) Object.assign(tool, { revision: "a".repeat(40), release: "v1", manifests: [] });
  const request = (toolId: string): PinnedRequest => ({ toolId, revision: "a".repeat(40), adapter: "npm-lock", roots: [toolId], platform: "all-lockfile-targets" });
  const publish = (toolId: string) => {
    const input = request(toolId);
    const selection = { revision: input.revision, adapter: input.adapter, roots: input.roots, platform: input.platform, path: "", resolverContext: "committed-lockfile:npm-workspaces-v1" };
    return publishCollection(snapshot, store, selection, { ...input, release: "v1", rootNames: input.roots, features: [], command: "Read committed lock", toolchain: "npm v3", origin: "source-reconstruction" }, { formatVersion: 1, lock: { lockfileVersion: 3, packages: { "": { name: toolId, version: "1.0.0" } } } }, [], "https://github.com/owner/repo");
  };
  const queuePath = join(directory, "collection-queue.json");
  return { directory, store, snapshot, request, publish, queuePath, queue: () => readJson(queuePath) as CollectionQueue, options: { stateDir: directory } };
}

test("batch checkpoints successes, retains first-time failures, and resumes without starving pending work", async (t) => {
  t.mock.method(console, "log", () => {}); t.mock.method(console, "error", () => {});
  const f = fixture();
  try {
    f.publish("alpha"); f.publish("gamma");
    const batch = { schemaVersion: 1, requests: [f.request("beta"), f.request("alpha"), f.request("gamma")] };
    assert.deepEqual(await collectBatch(f.snapshot, f.store, batch, { ...f.options, limit: 2 }), { requested: 3, attempted: 2, failed: 1, succeeded: 1, pending: 1, deferred: 0 });
    assert.deepEqual(f.queue().jobs.map((job) => job.status), ["failed", "succeeded", "pending"]);
    assert.match(f.queue().jobs[0].error!, /No discovered manifest/);
    assert.ok(f.store.load().tools.find((tool) => tool.id === "beta")!.gaps.some((gap) => gap.code === "native-collection-failed:npm-lock"));
    assert.deepEqual(await collectBatch(f.snapshot, f.store, batch, { ...f.options, limit: 1 }), { requested: 3, attempted: 1, failed: 1, succeeded: 2, pending: 0, deferred: 0 }, "a limited run must still report the outstanding selected failure");
    assert.equal(f.queue().jobs[0].attempts, 1, "pending gamma advances ahead of failed beta");
    f.publish("beta");
    assert.deepEqual(await collectBatch(f.snapshot, f.store, batch, f.options), { requested: 3, attempted: 1, failed: 0, succeeded: 3, pending: 0, deferred: 0 });
    assert.equal(f.queue().jobs[0].attempts, 2);
    assert.equal((await collectBatch(f.snapshot, f.store, batch, f.options)).attempted, 0);
    const queue = f.queue(); queue.jobs[1].status = "running"; writeJson(f.queuePath, queue);
    assert.equal((await collectBatch(f.snapshot, f.store, batch, f.options)).attempted, 1, "interrupted attempts recover using the saved native profile");
    assert.equal(f.queue().jobs[1].status, "succeeded");
    assert.equal((await collectBatch(f.snapshot, f.store, batch, { ...f.options, refresh: true, toolIds: ["beta"] })).failed, 1, "refresh deliberately bypasses saved results and native cache");
    assert.equal(f.queue().jobs[1].status, "succeeded", "unselected jobs are preserved");
  } finally { rmSync(f.directory, { recursive: true }); }
});

test("batch defers changed revisions and never trusts success without retained evidence", async (t) => {
  t.mock.method(console, "log", () => {}); t.mock.method(console, "error", () => {});
  const f = fixture();
  try {
    const result = f.publish("alpha");
    const batch = { schemaVersion: 1, requests: [f.request("alpha")] };
    f.snapshot.tools[0].revision = "b".repeat(40);
    assert.equal((await collectBatch(f.snapshot, f.store, batch, f.options)).deferred, 1);
    assert.equal(f.queue().jobs[0].attempts, 0);
    f.snapshot.tools[0].revision = "a".repeat(40);
    assert.equal((await collectBatch(f.snapshot, f.store, batch, f.options)).succeeded, 1);
    const evidence = f.snapshot.evidence.find((evidence) => evidence.id === result.profile.nativeEvidenceId)!;
    unlinkSync(join(f.directory, evidence.path));
    assert.equal((await collectBatch(f.snapshot, f.store, batch, f.options)).failed, 1);
    assert.equal(f.queue().jobs[0].status, "failed", "missing bytes cannot be concealed by a succeeded queue entry");
  } finally { rmSync(f.directory, { recursive: true }); }
});

test("batch rejects invalid requests and limits before queue writes and detects corrupt state", async () => {
  const f = fixture();
  try {
    const request = f.request("alpha");
    const batch = { schemaVersion: 1, requests: [request] };
    assert.equal(parseCollectionBatch({ ...batch, requests: [request, request] }, f.snapshot).length, 1);
    for (const patch of [{ toolId: "missing" }, { revision: "main" }, { roots: [] }, { roots: ["alpha", "alpha"] }, { path: "../package-lock.json" }, { adapter: "cabal-plan" }, { platfrom: "linux" }, { pythonVersion: "3.13" }]) {
      await assert.rejects(collectBatch(f.snapshot, f.store, { ...batch, requests: [request, { ...request, ...patch }] }, f.options));
      assert.equal(existsSync(f.queuePath), false);
    }
    await assert.rejects(collectBatch(f.snapshot, f.store, batch, { ...f.options, limit: 0 }), /positive integer/);
    await assert.rejects(collectBatch(f.snapshot, f.store, batch, { ...f.options, toolIds: ["beta"] }), /not in this batch/);
    assert.equal(existsSync(f.queuePath), false);
    writeJson(f.queuePath, { schemaVersion: 1, jobs: [{ id: "corrupt", request, status: "succeeded", attempts: 1 }] });
    await assert.rejects(collectBatch(f.snapshot, f.store, batch, f.options), /Invalid collection queue job/);
  } finally { rmSync(f.directory, { recursive: true }); }
});
