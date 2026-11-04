import { test } from "node:test";
import assert from "node:assert/strict";
import { artifact, inventory, finalize, canonical } from "./core";
import { resolveNative } from "./adapters";
import { mergeResolution } from "./store";
import { coverageTaskId, parseAssignments, summarizeWork, workReport } from "./work";
import { aggregateProjects } from "./impact";
import type { Graph } from "../map-types";

function fixture() {
  const snapshot = inventory({ nodes: ["consumer", "second", "component", "unresolved"].map((id) => ({ id, name: id, repo: null, team: "Catalog hint" })) } as Graph, "catalog");
  snapshot.evidence.push({ id: "evidence:fixture", digest: "fixture", path: "fixture", description: "Fixture" });
  for (const [toolId, version] of [["consumer", "1"], ["second", "2"], ["component", "1"]]) {
    const packages = toolId === "component" ? { "": { name: "shared", version, resolved: "https://registry.npmjs.org/shared/-/shared-1.tgz" } } : {
      "": { name: toolId, version: "1", dependencies: { shared: version, helper: "1" } },
      "node_modules/shared": { name: "shared", version, resolved: `https://registry.npmjs.org/shared/-/shared-${version}.tgz` },
      "node_modules/helper": { name: "helper", version: "1", dependencies: { shared: version }, resolved: "https://registry.npmjs.org/helper/-/helper-1.tgz" },
    };
    mergeResolution(snapshot, resolveNative({ lockfileVersion: 3, packages }, {
      toolId, adapter: "npm-lock", release: version, revision: "a".repeat(40), platform: "all", features: [], command: "read lock", toolchain: "npm", origin: "source-reconstruction", rootNames: [toolId === "component" ? "shared" : toolId],
    }, { native: "evidence:fixture", configuration: "evidence:fixture" }));
    snapshot.tools.find((tool) => tool.id === toolId)!.revision = "a".repeat(40);
  }
  // Exact identity is required for attribution. Simulate a root identified as the
  // same published artifact selected by a consumer, with its native evidence.
  const componentProfile = snapshot.profiles.find((profile) => profile.toolId === "component")!;
  const root = snapshot.occurrences.find((occurrence) => occurrence.id === componentProfile.roots[0])!;
  root.artifactId = snapshot.artifacts.find((artifact) => artifact.name === "shared" && artifact.version === "1" && artifact.source.startsWith("https://registry"))!.id;
  return finalize(snapshot);
}

test("investigation groups versions, preserves consumer profiles, and never inherits consumer capabilities", () => {
  const snapshot = fixture();
  const profile = snapshot.profiles.find((p) => p.toolId === "consumer")!;
  snapshot.capabilities = [{ id: "consumer-capability", toolId: "consumer", profileId: profile.id, capability: "submission", scope: "runtime", condition: null, verification: "verified", rationale: "Consumer behavior", evidenceIds: ["evidence:fixture"] }];
  const before = canonical(snapshot);
  const report = workReport(snapshot);
  const shared = report.investigations.find((item) => item.name === "shared")!;
  assert.deepEqual(shared.versions, ["1", "2"]);
  assert.equal(shared.factors.verifiedConsumers, 2, "diamond paths and versions count distinct consumers");
  assert.equal(shared.paths.length, 2);
  assert.equal(new Set(shared.paths.map((path) => path.profileId)).size, 2);
  assert.equal(shared.capabilities.length, 0, "consumer capability cannot imply dependency behavior");
  assert.match(shared.uncertainties[0], /No current/);
  assert.equal(shared.owner, null, "catalog maintainer is not the task owner");
  assert.equal(shared.maintainerHints[0].toolId, "component");
  assert.ok(report.coverage.some((item) => item.toolId === "unresolved"));
  assert.equal(report.catalogTools, 4);
  const summary = summarizeWork(report);
  const compact = summary.investigations.find((item) => item.projectId === shared.projectId)!;
  assert.ok(!("paths" in compact));
  const project = aggregateProjects(snapshot).find((item) => item.id === compact.pathsRef.projectId)!;
  assert.equal(Object.keys(project.impact.paths).length, shared.paths.length);
  for (const path of shared.paths) assert.ok(Object.values(project.impact.paths).some((ids) => canonical(ids) === canonical(path.occurrenceIds)));
  assert.equal(canonical(snapshot), before);
});

test("ranking exposes current root capability, historical scope and potential relationships separately", () => {
  const snapshot = fixture();
  const profile = snapshot.profiles.find((p) => p.toolId === "component")!;
  snapshot.capabilities = [{ id: "root-capability", toolId: "component", profileId: profile.id, capability: "serialization", scope: "runtime", condition: null, verification: "suggested", rationale: "Needs review", evidenceIds: ["evidence:fixture"] }];
  const consumer = snapshot.profiles.find((p) => p.toolId === "consumer")!;
  for (const edge of snapshot.edges) if (snapshot.occurrences.find((n) => n.id === edge.from)?.profileId === consumer.id) edge.verification = "suggested";
  let shared = workReport(snapshot).investigations.find((item) => item.name === "shared")!;
  assert.equal(shared.factors.verifiedCapabilities, 0);
  assert.equal(shared.factors.potentialCapabilities, 1);
  assert.equal(shared.factors.verifiedConsumers, 1);
  assert.equal(shared.factors.potentialConsumers, 1);
  assert.deepEqual(new Set(shared.paths.map((path) => path.exposure)), new Set(["required", "potential"]));
  snapshot.capabilities[0].verification = "verified";
  assert.equal(workReport(snapshot).investigations[0].factors.verifiedCapabilities, 1);
  snapshot.tools.find((t) => t.id === "component")!.revision = "b".repeat(40);
  shared = workReport(snapshot).investigations.find((item) => item.name === "shared")!;
  assert.equal(shared.factors.verifiedCapabilities, 0);
  assert.equal(shared.capabilities[0].current, false);
  snapshot.capabilities[0].verification = "rejected";
  assert.equal(workReport(snapshot).investigations.find((item) => item.name === "shared")!.capabilities.length, 0);
});

test("assignments survive report refresh, preserve unmatched tasks, and cannot rewrite evidence", () => {
  const snapshot = fixture();
  const first = workReport(snapshot);
  const investigation = first.investigations[0];
  const gap = first.coverage[0];
  assert.equal(gap.taskId, coverageTaskId(gap.toolId, gap.id));
  const assignments = parseAssignments([
    { taskId: investigation.taskId, owner: "Investigator", issueUrl: "https://github.com/example/repo/issues/1", nextAction: "Inspect the pinned entry point." },
    { taskId: gap.taskId, owner: "Collector", issueUrl: null, nextAction: null },
    { taskId: "retired-task", owner: "Prior owner", issueUrl: null, nextAction: null },
  ]);
  const next = workReport(snapshot, assignments);
  assert.equal(next.investigations.find((row) => row.taskId === investigation.taskId)!.owner, "Investigator");
  assert.equal(next.coverage.find((row) => row.taskId === gap.taskId)!.nextAction, gap.nextAction);
  assert.equal(next.unmatchedAssignments[0].taskId, "retired-task");
  const reordered = structuredClone(snapshot); reordered.tools.reverse(); reordered.profiles.reverse(); reordered.edges.reverse();
  assert.equal(canonical(workReport(reordered, assignments)), canonical(next));
  assert.throws(() => parseAssignments([...assignments, assignments[0]]), /Duplicate/);
  assert.throws(() => parseAssignments([{ ...assignments[0], issueUrl: "javascript:alert(1)" }]), /HTTPS/);
  assert.throws(() => parseAssignments([{ ...assignments[0], verification: "verified" }]), /Unknown/);
});

test("a chain-facing root with no downstream consumers remains an explainable investigation", () => {
  const snapshot = inventory({ nodes: [{ id: "standalone", name: "Standalone", repo: null, team: "Hint" }] } as Graph, "catalog");
  snapshot.evidence.push({ id: "evidence:fixture", digest: "fixture", path: "fixture", description: "Fixture" });
  mergeResolution(snapshot, resolveNative({ lockfileVersion: 3, packages: { "": { name: "standalone", version: "1" } } }, {
    toolId: "standalone", adapter: "npm-lock", release: "1", revision: "a".repeat(40), platform: "all", features: [], command: "read lock", toolchain: "npm", origin: "source-reconstruction", rootNames: ["standalone"],
  }, { native: "evidence:fixture", configuration: "evidence:fixture" }));
  snapshot.tools[0].revision = "a".repeat(40);
  snapshot.capabilities = [{ id: "standalone-capability", toolId: "standalone", profileId: snapshot.profiles[0].id, capability: "submission", scope: "runtime", condition: null, verification: "verified", rationale: "Root behavior", evidenceIds: ["evidence:fixture"] }];
  const report = workReport(finalize(snapshot));
  assert.equal(report.investigations.length, 1);
  const item = report.investigations[0];
  assert.equal(item.factors.verifiedCapabilities, 1);
  assert.equal(item.factors.verifiedConsumers, 0);
  assert.equal(item.paths.length, 0);
  assert.equal(item.rootScopes[0].profileId, snapshot.profiles[0].id);
  assert.deepEqual(item.rootScopes[0].evidenceIds, ["evidence:fixture"]);
  assert.ok(item.uncertainties.some((reason) => reason.includes("Standalone:")));
});

test("same-named sources, build behavior and multi-root profiles cannot establish dependency runtime capabilities", () => {
  const snapshot = fixture();
  const profile = snapshot.profiles.find((p) => p.toolId === "component")!;
  const root = snapshot.occurrences.find((n) => n.id === profile.roots[0])!;
  snapshot.capabilities = [{ id: "root-capability", toolId: "component", profileId: profile.id, capability: "submission", scope: "runtime", condition: null, verification: "verified", rationale: "Root behavior", evidenceIds: ["evidence:fixture"] }];
  const registryArtifact = root.artifactId;
  const original = snapshot.artifacts.find((a) => a.id === root.artifactId)!;
  const fork = artifact({ ecosystem: original.ecosystem, name: original.name, version: original.version, integrity: original.integrity, source: "git+https://example.com/fork#pinned-revision" });
  snapshot.artifacts.push(fork); root.artifactId = fork.id;
  let registry = workReport(snapshot).investigations.find((item) => item.name === "shared" && item.source === "https://registry.npmjs.org")!;
  assert.equal(registry.capabilities.length, 0);
  root.artifactId = registryArtifact;
  snapshot.capabilities[0].scope = "build";
  registry = workReport(snapshot).investigations.find((item) => item.name === "shared" && item.source === "https://registry.npmjs.org")!;
  assert.equal(registry.factors.verifiedCapabilities, 0);
  assert.equal(registry.capabilities[0].scope, "build");
  snapshot.capabilities[0].scope = "runtime";
  const secondRoot = { ...root, id: "second-root", locator: "second-root", artifactId: snapshot.artifacts.find((a) => a.name === "helper")!.id };
  snapshot.occurrences.push(secondRoot); profile.roots.push(secondRoot.id);
  registry = workReport(finalize(snapshot)).investigations.find((item) => item.name === "shared" && item.source === "https://registry.npmjs.org")!;
  assert.equal(registry.factors.verifiedCapabilities, 0);
  assert.equal(registry.capabilities[0].attribution, "multiple-roots");
});
