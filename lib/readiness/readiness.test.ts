import { compareSnapshots } from "./comparison";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Graph } from "../map-types";
import { finalize, inventory, validate } from "./core";
import { parseNativeInput, resolveNative } from "./adapters";
import { aggregateProjects, calculateImpact } from "./impact";
import { detectManifests, repositoryReference } from "./discovery";
import { addEvidence, mergeResolution, Store } from "./store";
import type { NativeInput } from "./types";
import { nativeEvidence, rebuildNative } from "./rebuild";

const catalog = { nodes: [{ id: "one", name: "One", repo: "owner/one", team: "Team" }, { id: "two", name: "Two", repo: null, team: "Team" }] } as Graph;
const base: NativeInput = { toolId: "one", release: "1.0.0", revision: "a".repeat(40), platform: "linux-x64", features: [], command: "npm install --package-lock-only --ignore-scripts", toolchain: "npm 10", origin: "source-reconstruction", adapter: "npm-lock", rootNames: ["app"] };
const lock = {
  name: "app", lockfileVersion: 3,
  packages: {
    "": { name: "app", version: "1.0.0", dependencies: { left: "1", right: "1" }, optionalDependencies: { optional: "1" }, devDependencies: { test: "1" } },
    "node_modules/left": { version: "1.0.0", resolved: "https://registry.npmjs.org/left/-/left-1.0.0.tgz", dependencies: { shared: "1" } },
    "node_modules/right": { version: "1.0.0", dependencies: { shared: "1" } },
    "node_modules/shared": { version: "1.0.0", resolved: "https://registry.npmjs.org/shared/-/shared-1.0.0.tgz", integrity: "sha512-test", dependencies: { left: "1" } },
    "node_modules/optional": { version: "1.0.0", dependencies: { shared: "1" } },
    "node_modules/test": { version: "1.0.0", dependencies: { helper: "1" } },
    "node_modules/helper": { version: "1.0.0" },
  },
};

test("versioned npm captures identify unnamed workspace roots through lock links and preserve legacy replay", () => {
  const workspaceLock = { name: "monorepo", lockfileVersion: 3, packages: {
    "": { name: "monorepo" },
    "apps/mobile": { version: "2.4.0", dependencies: { "@wallet/crypto": "*" } },
    "packages/crypto": { version: "1.0.0" },
    "node_modules/wallet-mobile": { link: true, resolved: "apps/mobile" },
    "node_modules/@wallet/crypto": { link: true, resolved: "packages/crypto" },
  } };
  const evidence = { native: "native", configuration: "configuration" };
  const input = { ...base, rootNames: ["wallet-mobile"] };
  const result = resolveNative({ formatVersion: 1, lock: workspaceLock }, input, evidence);
  const root = result.occurrences.find((n) => n.id === result.profile.roots[0])!;
  assert.equal(root.locator, "apps/mobile");
  assert.equal(result.artifacts.find((a) => a.id === root.artifactId)!.name, "wallet-mobile");
  const dependency = result.occurrences.find((n) => n.locator === "packages/crypto")!;
  assert.equal(result.artifacts.find((a) => a.id === dependency.artifactId)!.name, "@wallet/crypto");
  assert.ok(result.edges.some((e) => e.from === root.id && e.to === dependency.id && e.scope === "runtime"));
  const legacy = resolveNative(workspaceLock, { ...base, rootNames: ["apps/mobile"] }, evidence);
  assert.ok(legacy.artifacts.some((a) => a.name === "apps/mobile"));
  assert.ok(legacy.artifacts.some((a) => a.name === "packages/crypto"));
  assert.throws(() => resolveNative({ formatVersion: 2, lock: workspaceLock }, input, evidence), /Unsupported npm/);
  const ambiguous = { ...workspaceLock, packages: { ...workspaceLock.packages, "node_modules/crypto-alias": { link: true, resolved: "packages/crypto" } } };
  const uncertain = resolveNative({ formatVersion: 1, lock: ambiguous }, input, evidence);
  assert.ok(uncertain.gaps.some((g) => g.reason.includes("packages/crypto") && g.reason.includes("ambiguous")));
  assert.equal(uncertain.profile.coverage, "partial");
});

function setup() {
  const directory = mkdtempSync(join(tmpdir(), "readiness-test-"));
  const store = new Store(directory);
  const snapshot = inventory(catalog, "revision", "2026-10-17T00:00:00Z");
  const evidence = store.evidence(lock, "Native lock"); addEvidence(snapshot, evidence);
  return { directory, store, snapshot, evidence };
}

test("inventory accounts for source-unavailable tools without treating absence as readiness", () => {
  const snapshot = inventory(catalog, "revision");
  assert.equal(snapshot.tools.length, 2);
  assert.equal(snapshot.tools[1].readiness, "unassessed");
  assert.equal(snapshot.tools[1].resolution, "unresolved");
  assert.match(snapshot.tools[1].gaps.find((g) => g.area === "artifact")!.reason, /No repository/);
  assert.throws(() => inventory({ nodes: [catalog.nodes[0], catalog.nodes[0]] } as Graph, "revision"), /Duplicate/);
});

test("diamond paths and cycles count tools once, required reach takes precedence over optional", () => {
  const { directory, snapshot, evidence } = setup();
  try {
    for (const toolId of ["one", "two"]) mergeResolution(snapshot, resolveNative(lock, { ...base, toolId }, { native: evidence.id, configuration: evidence.id }));
    finalize(snapshot);
    const shared = snapshot.artifacts.find((a) => a.name === "shared")!;
    assert.equal(snapshot.artifacts.filter((a) => a.name === "shared").length, 1);
    const impact = calculateImpact(snapshot).find((i) => i.artifactId === shared.id)!;
    assert.deepEqual(impact.required, ["one", "two"]);
    assert.deepEqual(impact.optional, []);
    const helper = snapshot.artifacts.find((a) => a.name === "helper")!;
    assert.deepEqual(calculateImpact(snapshot).find((i) => i.artifactId === helper.id)!.development, ["one", "two"]);
  } finally { rmSync(directory, { recursive: true }); }
});

test("separate consumer contexts do not leak upstream outgoing dependencies", () => {
  const { directory, snapshot, evidence } = setup();
  try {
    mergeResolution(snapshot, resolveNative(lock, base, { native: evidence.id, configuration: evidence.id }));
    const other = structuredClone(lock);
    other.packages["node_modules/shared"].dependencies = { left: "2" };
    other.packages["node_modules/left"].version = "2.0.0";
    other.packages["node_modules/left"].resolved = "https://registry.npmjs.org/left/-/left-2.0.0.tgz";
    mergeResolution(snapshot, resolveNative(other, { ...base, toolId: "two", features: ["alternate"] }, { native: evidence.id, configuration: evidence.id }));
    const v2 = snapshot.artifacts.find((a) => a.name === "left" && a.version === "2.0.0")!;
    assert.deepEqual(calculateImpact(snapshot).find((i) => i.artifactId === v2.id)!.required, ["two"]);
    assert.equal(snapshot.artifacts.filter((a) => a.name === "shared").length, 1);
  } finally { rmSync(directory, { recursive: true }); }
});

test("suggested edges affect potential reach only", () => {
  const { directory, snapshot, evidence } = setup();
  try {
    const result = resolveNative(lock, base, { native: evidence.id, configuration: evidence.id });
    result.edges.forEach((e) => { if (e.from === result.profile.roots[0]) e.verification = "suggested"; });
    mergeResolution(snapshot, result);
    const impacts = calculateImpact(snapshot);
    assert.ok(impacts.every((i) => i.required.length === 0));
    assert.ok(impacts.some((i) => i.potential.includes("one")));
  } finally { rmSync(directory, { recursive: true }); }
});

test("npm workspace links resolve in consumer context and missing dependencies create gaps", () => {
  const result = resolveNative({ name: "workspace", lockfileVersion: 3, packages: {
    "": { name: "workspace", version: "1", dependencies: { child: "*", absent: "1" } },
    "node_modules/child": { link: true, resolved: "packages/child" },
    "packages/child": { name: "child", version: "1", dependencies: { hoisted: "1" } },
    "node_modules/hoisted": { version: "1" },
  } }, { ...base, rootNames: ["workspace"] }, { native: "test", configuration: "test" });
  assert.equal(result.occurrences.length, 3);
  assert.equal(result.edges.length, 2);
  assert.equal(result.profile.coverage, "partial");
  assert.ok(result.gaps.some((g) => g.reason.includes("absent")));
});

test("Cargo metadata preserves target conditions and build/test kinds", () => {
  const result = resolveNative({ workspace_root: "/src", workspace_members: ["app"], packages: [
    { id: "app", name: "app", version: "1", source: null, manifest_path: "/src/Cargo.toml", dependencies: [{ name: "dep", kind: "build", target: null, optional: false }, { name: "dep", kind: "dev", target: "cfg(unix)", optional: false }] },
    { id: "dep", name: "dep", version: "2", source: "registry+https://example.org", manifest_path: "/cache/dep/Cargo.toml" },
  ], resolve: { nodes: [{ id: "app", deps: [{ name: "dep", pkg: "dep", dep_kinds: [{ kind: "build", target: null }, { kind: "dev", target: "cfg(unix)" }] }] }, { id: "dep", deps: [] }] } }, { ...base, adapter: "cargo-metadata", command: "cargo metadata --locked --filter-platform x86_64-unknown-linux-gnu" }, { native: "test", configuration: "test" });
  assert.equal(result.edges[0].scope, "build");
  assert.equal(result.edges[1].scope, "development");
  assert.equal(result.edges[1].optional, true);
  assert.equal(result.profile.coverage, "complete");
  assert.throws(() => resolveNative({ packages: [], workspace_members: [], resolve: null }, { ...base, adapter: "cargo-metadata" }, { native: "test", configuration: "test" }), /resolve/);
});

test("Cabal plans retain pre-existing units and executable build dependencies", () => {
  const result = resolveNative({ "compiler-id": "ghc-9.6.6", "install-plan": [
    { id: "app", "pkg-name": "app", "pkg-version": "1", style: "local", components: { lib: { depends: ["base"], "exe-depends": ["generator"] } } },
    { id: "base", "pkg-name": "base", "pkg-version": "4.18", type: "pre-existing", depends: [] },
    { id: "generator", "pkg-name": "generator", "pkg-version": "1", style: "global", depends: ["base"] },
  ] }, { ...base, adapter: "cabal-plan" }, { native: "test", configuration: "test" });
  assert.equal(result.occurrences.length, 3);
  assert.equal(result.edges.filter((e) => e.scope === "build").length, 1);
  assert.equal(result.profile.roots.length, 1);
});

test("snapshot replay ignores timestamps and evidence survives round trips", () => {
  const { directory, store, snapshot, evidence } = setup();
  try {
    mergeResolution(snapshot, resolveNative(lock, base, { native: evidence.id, configuration: evidence.id }));
    store.save(snapshot); const before = snapshot.semanticDigest;
    snapshot.generatedAt = "later"; snapshot.tools[0].lastAttempt = "later";
    store.save(snapshot);
    assert.equal(snapshot.semanticDigest, before);
    assert.deepEqual(store.readEvidence(evidence), lock);
    assert.equal(store.load().semanticDigest, before);
    store.verify(snapshot);
    assert.throws(() => store.readEvidence({ ...evidence, path: "../secret" }), /Invalid evidence path/);
  } finally { rmSync(directory, { recursive: true }); }
});

test("imports reject ambiguous revisions, unknown roots, and cross-profile edges", () => {
  assert.throws(() => parseNativeInput({ ...base, revision: "main" }), /immutable/);
  assert.throws(() => resolveNative(lock, { ...base, rootNames: ["missing"] }, { native: "test", configuration: "test" }), /No roots/);
  const { directory, snapshot, evidence } = setup();
  try {
    mergeResolution(snapshot, resolveNative(lock, base, { native: evidence.id, configuration: evidence.id }));
    mergeResolution(snapshot, resolveNative(lock, { ...base, toolId: "two" }, { native: evidence.id, configuration: evidence.id }));
    snapshot.edges[0].to = snapshot.profiles[1].roots[0];
    assert.throws(() => validate(snapshot), /cross resolution/);
  } finally { rmSync(directory, { recursive: true }); }
});

test("manifest discovery includes nested workspaces and unsupported ecosystems", () => {
  const found = detectManifests(["packages/a/package.json", "Cargo.toml", "haskell/a.cabal", "flake.lock", "aiken.toml", ".github/workflows/release.yml", "README.md"]);
  assert.deepEqual(found.ecosystems, ["cabal", "cargo", "nix", "npm", "other"]);
  assert.equal(found.manifests.length, 5);
  assert.equal(found.reviewFiles.length, 2);
});

test("repository normalization accepts GitHub URLs without guessing repositories for hosted services", () => {
  assert.equal(repositoryReference("github.com/ODATANO/ODATANO"), "ODATANO/ODATANO");
  assert.equal(repositoryReference("https://github.com/owner/repo.git"), "owner/repo");
  assert.equal(repositoryReference("github.com/MeshJS"), null);
  assert.equal(repositoryReference("docs.txpipe.io/balius"), null);
});

test("project reach unions versions instead of summing them, and snapshot diffs include changed verification", () => {
  const { directory, snapshot, evidence } = setup();
  try {
    mergeResolution(snapshot, resolveNative(lock, base, { native: evidence.id, configuration: evidence.id }));
    const other = structuredClone(lock);
    other.packages["node_modules/left"].version = "2.0.0";
    other.packages["node_modules/left"].resolved = "https://registry.npmjs.org/left/-/left-2.0.0.tgz";
    mergeResolution(snapshot, resolveNative(other, { ...base, release: "2.0.0" }, { native: evidence.id, configuration: evidence.id }));
    const project = aggregateProjects(snapshot).find((p) => p.name === "left")!;
    assert.equal(project.artifactIds.length, 2);
    assert.deepEqual(project.impact.required, ["one"]);
    const before = structuredClone(snapshot);
    snapshot.edges[0].verification = "disputed";
    assert.deepEqual(compareSnapshots(before, snapshot).edges.changed, [snapshot.edges[0].id]);
  } finally { rmSync(directory, { recursive: true }); }
});

test("Cargo missing resolution nodes cannot become complete leaf graphs", () => {
  const root = { id: "app", name: "app", version: "1", source: null, manifest_path: "/src/Cargo.toml", dependencies: [{ name: "dep", optional: false, kind: null, target: null }] };
  const output = { workspace_root: "/src", workspace_members: ["app"], packages: [root, { id: "dep", name: "dep", version: "1", source: "registry+https://example.org", manifest_path: "/cache/dep/Cargo.toml", dependencies: [] }], resolve: { nodes: [] as unknown[] } };
  const input = { ...base, adapter: "cargo-metadata" as const, command: "cargo metadata --locked --filter-platform x86_64-unknown-linux-gnu" };
  const refs = { native: "test", configuration: "test" };
  const absentRoot = resolveNative(output, input, refs);
  assert.equal(absentRoot.profile.coverage, "partial");
  assert.ok(absentRoot.gaps.some((g) => g.reason.includes("app is missing")));
  output.resolve.nodes.push({ id: "app", deps: [{ name: "dep", pkg: "dep", dep_kinds: [{ kind: null, target: null }] }] });
  const absentTransitive = resolveNative(output, input, refs);
  assert.equal(absentTransitive.profile.coverage, "partial");
  assert.ok(absentTransitive.gaps.some((g) => g.reason.includes("dep is missing")));
});

test("Cargo optional declarations survive default-feature activation and renamed bindings", () => {
  const output = { workspace_root: "/src", workspace_members: ["app"], packages: [
    { id: "app", name: "app", version: "1", source: null, manifest_path: "/src/Cargo.toml", features: { default: ["dep:provider"] }, dependencies: [{ name: "provider-impl", rename: "provider", optional: true, kind: null, target: null }] },
    { id: "provider", name: "provider-impl", version: "1", source: "registry+https://example.org", manifest_path: "/cache/provider/Cargo.toml", dependencies: [] },
  ], resolve: { nodes: [{ id: "app", features: ["default", "provider"], deps: [{ name: "provider", pkg: "provider", dep_kinds: [{ kind: null, target: null }] }] }, { id: "provider", deps: [] }] } };
  const result = resolveNative(output, { ...base, adapter: "cargo-metadata", command: "cargo metadata --locked --filter-platform x86_64-unknown-linux-gnu" }, { native: "test", configuration: "test" });
  assert.equal(result.profile.coverage, "complete");
  assert.equal(result.edges[0].optional, true);
  assert.match(result.edges[0].condition!, /feature-gated dependency provider/);
});

test("optional exposure survives required exposure in a different profile at both artifact and project levels", () => {
  const { directory, snapshot, evidence } = setup();
  try {
    const required = { name: "app", lockfileVersion: 3, packages: { "": { name: "app", version: "1", dependencies: { shared: "1" } }, "node_modules/shared": { version: "1", resolved: "https://registry.npmjs.org/shared/-/shared-1.tgz" } } };
    const optional = { ...required, packages: { ...required.packages, "": { name: "app", version: "1", optionalDependencies: { shared: "1" } } } };
    const refs = { native: evidence.id, configuration: evidence.id };
    mergeResolution(snapshot, resolveNative(required, base, refs));
    mergeResolution(snapshot, resolveNative(optional, { ...base, features: ["optional-provider"] }, refs));
    const impact = calculateImpact(snapshot)[0];
    assert.deepEqual(impact.required, ["one"]); assert.deepEqual(impact.optional, ["one"]);
    const project = aggregateProjects(snapshot)[0];
    assert.deepEqual(project.impact.required, ["one"]); assert.deepEqual(project.impact.optional, ["one"]);
  } finally { rmSync(directory, { recursive: true }); }
});

test("Cargo library target names can differ from dependency package names", () => {
  const output = { workspace_root: "/src", workspace_members: ["app"], packages: [
    { id: "app", name: "app", version: "1", source: null, manifest_path: "/src/Cargo.toml", dependencies: [{ name: "md-5", rename: null, optional: false, kind: null, target: null }] },
    { id: "md-5", name: "md-5", version: "1", source: "registry+https://example.org", manifest_path: "/cache/md-5/Cargo.toml", dependencies: [], targets: [{ name: "md5", kind: ["lib"] }] },
  ], resolve: { nodes: [{ id: "app", deps: [{ name: "md5", pkg: "md-5", dep_kinds: [{ kind: null, target: null }] }] }, { id: "md-5", deps: [] }] } };
  const result = resolveNative(output, { ...base, adapter: "cargo-metadata", command: "cargo metadata --locked --filter-platform x86_64-unknown-linux-gnu" }, { native: "test", configuration: "test" });
  assert.equal(result.profile.coverage, "complete"); assert.equal(result.edges[0].optional, false);
});

test("named evidence roles survive reordering and native rebuilds preserve source evidence", () => {
  const { directory, snapshot, evidence, store } = setup();
  try {
    const configuration = store.evidence(base, "Collection profile"); addEvidence(snapshot, configuration);
    mergeResolution(snapshot, resolveNative(lock, base, { native: evidence.id, configuration: configuration.id }));
    snapshot.profiles[0].evidenceIds.reverse();
    const refs = nativeEvidence(snapshot.profiles[0]);
    assert.equal(refs.native, evidence.id); assert.equal(refs.configuration, configuration.id);
    const next = rebuildNative(snapshot, store);
    assert.equal(next.profiles.length, 1); assert.equal(next.profiles[0].id, snapshot.profiles[0].id);
    assert.equal(next.edges.length, snapshot.edges.length);
    assert.deepEqual(next.evidence, snapshot.evidence.sort((a, b) => a.id.localeCompare(b.id)));
    const edge = next.edges[0]; edge.type = "service";
    assert.throws(() => rebuildNative(next, store), /invalidate manual/);
  } finally { rmSync(directory, { recursive: true }); }
});
