import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Graph } from "../map-types";
import { inventory, object } from "./core";
import { detectManifests, discover } from "./discovery";
import { readJson, Store, writeJson } from "./store";

test("Gradle production inputs have their own ecosystem without swallowing unrelated JVM manifests", () => {
  const paths = ["sdk/build.gradle", "service/build.gradle.kts", "settings.gradle.kts", "gradle/libs.versions.toml", "gradle/wrapper/gradle-wrapper.properties", "gradle.properties"];
  assert.deepEqual(detectManifests(paths).ecosystems, ["gradle"]);
  assert.deepEqual(detectManifests(paths).manifests, [...paths].sort());
  assert.deepEqual(detectManifests([...paths, "other/pom.xml", "web/package.json"]).ecosystems, ["gradle", "npm", "other"]);
});

test("discovery resumes interrupted jobs, retains successful evidence on failure, and reuses completed work", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "readiness-discovery-"));
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "error", () => {});
  try {
    const store = new Store(join(directory, "data"));
    const stateDir = join(directory, "state");
    const snapshot = inventory({ nodes: [{ id: "tool", name: "Tool", repo: "owner/repo", team: "Team" }] } as Graph, "catalog");
    let calls = 0;
    const revision = "a".repeat(40);
    const request = async (endpoint: string): Promise<unknown> => {
      calls++;
      if (endpoint === "repos/owner/repo") return { full_name: "owner/repo", default_branch: "main" };
      if (endpoint.endsWith("/releases/latest")) return { tag_name: "v1", html_url: "https://github.com/owner/repo/releases/tag/v1" };
      if (endpoint.endsWith("/commits/v1")) return { sha: revision };
      if (endpoint.includes("/git/trees/")) return { sha: revision, truncated: false, tree: [{ path: "package.json", type: "blob" }, { path: "build.gradle", type: "blob" }] };
      throw new Error(`Unexpected request ${endpoint}`);
    };
    await discover(snapshot, store, { stateDir, request });
    assert.equal(calls, 4);
    const successfulAt = snapshot.tools[0].lastSuccess;
    const evidenceIds = [...snapshot.tools[0].evidenceIds];
    await discover(snapshot, store, { stateDir, request });
    assert.equal(calls, 4, "successful work is reused");
    const statePath = join(stateDir, "discovery.json");
    const jobs = object(readJson(statePath));
    object(object(jobs["owner/repo"]).result).ecosystems = ["npm", "other"];
    writeJson(statePath, jobs);
    await discover(snapshot, store, { stateDir, request });
    assert.equal(calls, 4, "new classification reuses the captured tree");
    assert.deepEqual(snapshot.tools[0].ecosystems, ["gradle", "npm"]);
    object(jobs["owner/repo"]).status = "running";
    writeJson(statePath, jobs);
    await discover(snapshot, store, { stateDir, request: async () => { throw new Error("Network unavailable"); } });
    assert.equal(snapshot.tools[0].lastSuccess, successfulAt);
    assert.deepEqual(snapshot.tools[0].evidenceIds, evidenceIds);
    assert.match(snapshot.tools[0].discoveryError!, /Network unavailable/);
    assert.equal(object(object(readJson(statePath))["owner/repo"]).status, "failed");
    await discover(snapshot, store, { stateDir, request });
    assert.equal(calls, 8, "failed work is retried without a refresh flag");
    assert.equal(snapshot.tools[0].discoveryError, undefined);
    store.verify(store.load());
  } finally { rmSync(directory, { recursive: true }); }
});
