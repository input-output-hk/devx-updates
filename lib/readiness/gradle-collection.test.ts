import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Graph } from "../map-types";
import { inventory } from "./core";
import { Store } from "./store";
import { collectionKey, collectionRequests, publishCollection, reuseCollection, type CollectionSelection } from "./collection";
import { collect, refreshNative } from "./collect";
import { gradleCaptureContext } from "./collect-gradle";
import { gradleConfigurations } from "./gradle-selection";
import { parseCollectionBatch } from "./batch";
import { collectionCandidates } from "./candidates";
import { runGradleWorker } from "./gradle-worker";
import type { NativeInput } from "./types";

const configurations = [{ projectPath: ":", configuration: "runtimeClasspath", scope: "runtime" as const }];
const fixture = () => JSON.parse(readFileSync("scripts/readiness/fixtures/gradle/resolution.json", "utf8"));

test("Gradle requests require explicit unique selections and retain them for offline refresh", async (t) => {
  t.mock.method(console, "log", () => {}); t.mock.method(console, "error", () => {});
  const directory = mkdtempSync(join(tmpdir(), "readiness-gradle-"));
  try {
    const store = new Store(directory);
    const snapshot = inventory({ nodes: [{ id: "tool", name: "Tool", repo: "owner/repo", team: "Team" }] } as Graph, "catalog");
    const selection: CollectionSelection = { revision: "a".repeat(40), adapter: "gradle-resolution", roots: ["fixture:fixture"], path: "build.gradle", platform: "amd64-Linux", configurations, resolverContext: gradleCaptureContext().fingerprint };
    Object.assign(snapshot.tools[0], { revision: selection.revision, release: "v1", manifests: ["build.gradle", "sub/build.gradle", "nested/build.gradle.kts", "nested/settings.gradle.kts"] });
    assert.deepEqual(collectionCandidates(snapshot)[0].candidates.map((c) => c.path), ["build.gradle", "nested/build.gradle.kts"]);
    const request = { toolId: "tool", revision: selection.revision, adapter: selection.adapter, roots: selection.roots, path: selection.path, platform: selection.platform, configurations };
    const batch = (configurations: unknown, adapter = "gradle-resolution") => ({ schemaVersion: 1, requests: [{ ...request, adapter, configurations }] });
    assert.deepEqual(parseCollectionBatch(batch(configurations), snapshot), [request]);
    for (const value of [undefined, [], [...configurations, ...configurations], [{ ...configurations[0], scope: "test" }], [{ ...configurations[0], typo: true }]]) assert.throws(() => parseCollectionBatch(batch(value), snapshot));
    assert.throws(() => parseCollectionBatch(batch(configurations, "npm-lock"), snapshot), /only apply/);
    const profile: NativeInput = { toolId: "tool", release: "v1", ...selection, features: [], command: "native Gradle", toolchain: "Gradle 7.5.1", origin: "source-reconstruction", rootNames: selection.roots };
    const raw = fixture(); raw.graphs = raw.graphs.filter((g: { configuration: string }) => g.configuration === "runtimeClasspath");
    publishCollection(snapshot, store, selection, profile, raw, [], "https://github.com/owner/repo");
    assert.deepEqual(collectionRequests(snapshot, store)[0].configurations, configurations);
    const options = { ...request, stateDir: join(directory, "absent-checkout") };
    await assert.rejects(collect(snapshot, store, { ...options, path: "sub/build.gradle" }), /build root with its own settings/);
    assert.equal((await collect(snapshot, store, options)).id, snapshot.profiles[0].id, "cache reuse must precede checkout and Docker");
    assert.deepEqual(await refreshNative(snapshot, store, options.stateDir), { profilesRequested: 1, failed: 0 });
    for (const changed of [{ resolverContext: "changed script" }, { revision: "b".repeat(40) }, { configurations: [{ ...configurations[0], scope: "build" as const }] }]) assert.notEqual(collectionKey(selection), collectionKey({ ...selection, ...changed }));
    raw.graphs[0].nodes[0].dependencies.push({ requested: "missing:module:1", constraint: false, failure: "repository unavailable" });
    const failed = publishCollection(snapshot, store, selection, profile, raw, [], "https://github.com/owner/repo");
    assert.equal(failed.profile.coverage, "partial");
    assert.equal(reuseCollection(snapshot, store, options, selection), undefined, "native resolution failures must be retried");
    assert.deepEqual(gradleConfigurations([...configurations, { projectPath: ":a", configuration: "compileClasspath", scope: "build" }].reverse(), "gradle-resolution"), [...configurations, { projectPath: ":a", configuration: "compileClasspath", scope: "build" }]);
  } finally { rmSync(directory, { recursive: true }); }
});

test("Gradle workers remove their exact container on success, native failure and timeout", async () => {
  const directory = mkdtempSync(join(tmpdir(), "readiness-gradle-worker-"));
  try {
    for (const outcome of ["success", "native failure", "timeout", "cleanup failure", "missing image"] as const) {
      const calls: { args: string[]; timeout: number }[] = [];
      const run: NonNullable<Parameters<typeof runGradleWorker>[3]> = async (file, args, options) => {
        assert.equal(file, "docker"); calls.push({ args, timeout: options.timeout });
        if (args[0] === "image" && outcome === "missing image") throw new Error("No such image");
        if (args[0] === "start" && ["native failure", "timeout", "cleanup failure"].includes(outcome)) throw Object.assign(new Error(outcome), { cmd: "docker start", code: 7, signal: "SIGKILL", stderr: "native diagnostics" });
        if (args[0] === "rm" && outcome === "cleanup failure") throw new Error("daemon unavailable");
        return { stdout: args[0] === "start" ? "native graph" : "", stderr: "capture log" };
      };
      const pending = runGradleWorker(directory, directory, "nested", run, 1500);
      if (outcome === "cleanup failure") await assert.rejects(pending, (error: unknown) => {
        const failure = error as Error & { cmd: string; code: number; signal: string; stderr: string };
        assert.match(failure.message, /cleanup failed/); assert.equal(failure.cmd, "docker start"); assert.equal(failure.code, 7); assert.equal(failure.signal, "SIGKILL"); assert.equal(failure.stderr, "native diagnostics"); return true;
      });
      else if (["native failure", "timeout"].includes(outcome)) await assert.rejects(pending, new RegExp(outcome));
      else assert.equal((await pending).stdout, "native graph");
      const created = calls.find((c) => c.args[0] === "create")!;
      const name = created.args[created.args.indexOf("--name") + 1];
      assert.deepEqual(calls.at(-1)!.args, ["rm", "--force", "--volumes", name]);
      assert.deepEqual(calls.find((c) => c.args[0] === "start"), { args: ["start", "--attach", name], timeout: 1500 });
      assert.ok(created.args.includes("--read-only") && created.args.includes("--cap-drop=ALL"));
      const mounts = created.args.filter((_, i) => created.args[i - 1] === "--mount");
      assert.equal(mounts.length, 2); assert.ok(mounts.every((m) => m.endsWith(",readonly")));
      assert.ok(!created.args.some((arg) => arg.includes("docker.sock") || arg === "--env" || arg === "--privileged"));
      assert.equal(calls.filter((c) => c.args[0] === "pull").length, outcome === "missing image" ? 1 : 0);
    }
  } finally { rmSync(directory, { recursive: true }); }
});
