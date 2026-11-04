import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveNative } from "./adapters";
import type { NativeInput } from "./types";

const input: NativeInput = {
  toolId: "fixture", release: "1", revision: "a".repeat(40), platform: "amd64-Linux", features: [],
  command: "gradle readinessResolution", toolchain: "Gradle 7.5.1 / JDK 17.0.5", origin: "source-reconstruction",
  adapter: "gradle-resolution", rootNames: ["fixture:fixture"],
};
// Recorded native Gradle output, with the generating project/selection beside it.
function capture() { return JSON.parse(readFileSync("scripts/readiness/fixtures/gradle/resolution.json", "utf8")); }
const resolve = (raw = capture(), profile = input) => resolveNative(raw, profile, { native: "native", configuration: "configuration" });

test("native Gradle diamonds retain both paths and selected versions without treating constraints as dependencies", () => {
  const result = resolve();
  const node = (name: string) => result.occurrences.find((n) => JSON.parse(n.locator)[1] === "runtimeClasspath" && result.artifacts.find((a) => a.id === n.artifactId)!.name === name)!;
  const shared = node("fixture:shared"); const slf4j = node("org.slf4j:slf4j-api");
  assert.equal(result.artifacts.find((a) => a.id === slf4j.artifactId)!.version, "1.7.36");
  for (const parent of ["fixture:left", "fixture:right"]) {
    assert.ok(result.edges.some((e) => e.from === node(parent).id && e.to === shared.id));
    assert.ok(result.edges.some((e) => e.from === node(parent).id && e.to === slf4j.id));
  }
  assert.ok(result.edges.some((e) => e.from === node("fixture:left").id && e.to === slf4j.id && e.constraint === "org.slf4j:slf4j-api:1.7.32"));
  assert.ok(!result.edges.some((e) => e.from === node("fixture:platform").id));
  assert.equal(result.profile.coverage, "partial");
});

test("native Gradle variant dependencies and build/test classpaths do not leak into runtime exposure", () => {
  const result = resolve();
  const names = new Map(result.artifacts.map((a) => [a.id, a.name]));
  const reachableNames = (configuration: string) => {
    const root = result.occurrences.find((n) => result.profile.roots.includes(n.id) && JSON.parse(n.locator)[1] === configuration)!;
    const reachable = new Set([root.id]);
    for (const id of reachable) for (const edge of result.edges.filter((e) => e.from === id)) reachable.add(edge.to);
    return new Set(result.occurrences.filter((n) => reachable.has(n.id)).map((n) => names.get(n.artifactId)));
  };
  assert.ok(!reachableNames("runtimeClasspath").has("fixture:fixture-only"));
  assert.ok(!reachableNames("runtimeClasspath").has("fixture:generator"));
  assert.deepEqual(reachableNames("annotationProcessor"), new Set(["fixture:fixture", "fixture:generator"]));
  assert.ok(reachableNames("testRuntimeClasspath").has("fixture:fixture-only"));
  const sharedVariants = result.occurrences.filter((n) => names.get(n.artifactId) === "fixture:shared" && JSON.parse(n.locator)[1] === "testRuntimeClasspath");
  assert.equal(sharedVariants.length, 2);
  assert.equal(new Set(sharedVariants.map((n) => n.artifactId)).size, 1);
  assert.equal(sharedVariants.filter((n) => result.edges.some((e) => e.from === n.id)).length, 1);
  for (const edge of result.edges) {
    const n = result.occurrences.find((n) => n.id === edge.from)!;
    assert.equal(edge.scope, ({ runtimeClasspath: "runtime", annotationProcessor: "build", testRuntimeClasspath: "development" } as Record<string, string>)[JSON.parse(n.locator)[1]]);
  }
});

test("Gradle external identities remain capture-local while pinned local source identity is stable", () => {
  const raw = capture(); const first = resolve(raw);
  raw.repositories[0].repositories[0].url = "https://example.invalid/maven";
  const second = resolve(raw);
  assert.notEqual(first.artifacts.find((a) => a.name === "org.slf4j:slf4j-api")!.id, second.artifacts.find((a) => a.name === "org.slf4j:slf4j-api")!.id);
  assert.equal(first.artifacts.find((a) => a.name === "fixture:shared")!.id, second.artifacts.find((a) => a.name === "fixture:shared")!.id);
  assert.equal(first.artifacts.find((a) => a.name === "fixture:shared")!.source, `source:${input.revision}:shared`);
  assert.ok(first.gaps.some((g) => g.reason.includes("capture-local")));
  raw.sourceDirectory = "nested/sdk";
  const nested = resolve(raw);
  assert.equal(nested.artifacts.find((a) => a.name === "fixture:shared")!.source, `source:${input.revision}:nested/sdk/shared`);
  raw.sourceDirectory = "../outside";
  assert.throws(() => resolve(raw), /source directory/);
});

test("Gradle native failures remain gaps and explicit cyclic selections remain finite", () => {
  const raw = capture(); const graph = raw.graphs[0]; const root = graph.nodes.find((n: { id: string }) => n.id === graph.root);
  root.dependencies.push({ requested: "missing:module:1", constraint: false, failure: "not found in configured repositories" });
  const shared = graph.nodes.find((n: { component: { name: string } }) => n.component.name === "shared");
  shared.dependencies.push({ requested: "project :", constraint: false, target: graph.root });
  const result = resolve(raw);
  assert.ok(result.gaps.some((g) => g.reason.includes("missing:module:1 failed")));
  assert.ok(result.edges.some((e) => result.profile.roots.includes(e.to)));
  assert.equal(result.occurrences.length, 16);
});

test("malformed or unsupported Gradle captures fail closed", () => {
  const mutations: ((raw: ReturnType<typeof capture>) => void)[] = [
    (r) => { r.gradleVersion = "8.11"; },
    (r) => { r.formatVersion = 2; },
    (r) => { r.environment.arch = "other"; },
    (r) => { r.graphs = []; },
    (r) => { r.graphs.push(r.graphs[0]); },
    (r) => { r.graphs[0].scope = "unknown"; },
    (r) => { r.graphs[0].nodes.push(r.graphs[0].nodes[0]); },
    (r) => { delete r.graphs[0].nodes[0].dependencies; },
    (r) => { r.graphs[0].nodes[0].component.kind = "unknown"; },
    (r) => { r.graphs[0].nodes[1].component.path = "../outside"; },
    (r) => { r.graphs[0].nodes[1].dependencies[0].constraint = "false"; },
    (r) => { r.graphs[0].nodes[1].dependencies[0].target = "missing"; },
    (r) => { r.graphs[0].nodes[1].dependencies[0].failure = "also failed"; },
    (r) => { r.graphs[0].root = r.graphs[0].nodes[0].id; },
  ];
  for (const mutate of mutations) { const raw = capture(); mutate(raw); assert.throws(() => resolve(raw)); }
  assert.throws(() => resolve(capture(), { ...input, rootNames: ["fixture:fixture", "fixture:missing"] }));
});
