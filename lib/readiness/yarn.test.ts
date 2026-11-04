import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseYarnLock, YARN_CAPTURE_CONTEXT } from "./collect-yarn";
import { resolveNative } from "./adapters";
import { inventory, finalize } from "./core";
import { mergeResolution, Store } from "./store";
import { publishCollection } from "./collection";
import { refreshNative } from "./collect";
import { calculateImpact } from "./impact";
import { collectionCandidates } from "./candidates";
import type { Graph } from "../map-types";
import type { NativeInput } from "./types";

const input: NativeInput = { toolId: "wallet", release: "v1", revision: "a".repeat(40), platform: "all-lockfile-targets", features: [], command: "Read committed lock", toolchain: "Yarn", origin: "source-reconstruction", adapter: "yarn-lock", rootNames: ["wallet"] };
const evidence = { native: "native", configuration: "config" };
const classic = `# yarn lockfile v1
left@^1, left@1.0.0:
  version "1.0.0"
  resolved "https://registry.yarnpkg.com/left/-/left-1.0.0.tgz#${"b".repeat(40)}"
  dependencies:
    shared "^1"
right@^1:
  version "1.0.0"
  resolved "https://registry.npmjs.org/right/-/right-1.0.0.tgz"
  optionalDependencies:
    shared "^1"
shared@^1:
  version "1.0.0"
  resolved "https://registry.npmjs.org/shared/-/shared-1.0.0.tgz"
  dependencies:
    left "^1"
dev@^1:
  version "1.0.0"
  resolved "https://custom.example/dev.tgz"
"alias@npm:shared@^1":
  version "1.0.0"
  resolved "https://registry.yarnpkg.com/shared/-/shared-1.0.0.tgz"
git@^1:
  version "1.0.0"
  resolved "https://github.com/owner/repo.git#${"c".repeat(40)}"
`;

test("Classic Yarn uses its native parser and retains aliases, scopes, cycles and explicit missing selections", () => {
  const parsed = parseYarnLock(classic);
  const raw = { formatVersion: 1, ...parsed, sourceDirectory: ".", manifests: { ".": {
    name: "wallet", version: "1.0.0", dependencies: { left: "^1", alias: "npm:shared@^1", git: "^1", absent: "^1" }, optionalDependencies: { right: "^1" }, devDependencies: { dev: "^1" }, peerDependencies: { host: "^1" },
  } } };
  const result = resolveNative(raw, input, evidence);
  assert.equal(result.profile.coverage, "partial");
  assert.equal(result.artifacts.filter((a) => a.name === "left").length, 1, "shared artifacts can have multiple declared selectors");
  assert.ok(result.artifacts.some((a) => a.name === "left" && a.source === "https://registry.npmjs.org/left/-/left-1.0.0.tgz" && a.integrity?.startsWith("sha1-")));
  assert.ok(!result.artifacts.some((a) => a.name === "alias"));
  const git = result.artifacts.find((a) => a.name === "git")!;
  assert.equal(git.integrity, null, "Git commit hashes must not become tarball integrity");
  assert.ok(git.source.startsWith(`source:${input.revision}`));
  assert.ok(result.gaps.some((g) => g.reason.includes("absent@^1")));
  assert.ok(result.gaps.some((g) => g.reason.includes("peer bindings")));
  const snapshot = inventory({ nodes: [{ id: "wallet", name: "Wallet" }] } as Graph, "catalog");
  snapshot.evidence.push(...["native", "config"].map((id) => ({ id, digest: "x", path: "x", description: "fixture" })));
  mergeResolution(snapshot, result); finalize(snapshot);
  const impacts = calculateImpact(snapshot);
  const reach = (name: string) => impacts.find((i) => i.artifactId === result.artifacts.find((a) => a.name === name)!.id)!;
  assert.deepEqual(reach("shared").required, ["wallet"]);
  assert.deepEqual(reach("right").optional, ["wallet"]);
  assert.deepEqual(reach("dev").development, ["wallet"]);
});

function modern() {
  return { formatVersion: 1, kind: "modern", sourceDirectory: "sdk", registries: { default: "https://registry.yarnpkg.com", "@private": "https://private.example" }, manifests: {
    ".": { name: "wallet", version: "2.0.0", dependencies: { sdk: "workspace:*", "@private/crypto": "^1" }, devDependencies: { test: "^1" } },
    "packages/sdk": { name: "sdk", version: "1.1.0", dependencies: { native: "^1" } },
  }, lock: {
    __metadata: { version: 8 },
    "wallet@workspace:.": { version: "0.0.0-use.local", resolution: "wallet@workspace:.", dependencies: { sdk: "workspace:*", "@private/crypto": "npm:^1", test: "npm:^1" } },
    "sdk@workspace:*, sdk@workspace:packages/sdk": { version: "0.0.0-use.local", resolution: "sdk@workspace:packages/sdk", dependencies: { native: "npm:^1" } },
    "@private/crypto@npm:^1": { version: "1.0.0", resolution: "@private/crypto@npm:1.0.0", checksum: "cache-key/not-a-tarball-hash", peerDependencies: { host: "^1" } },
    "native@npm:^1": { version: "1.0.0", resolution: "native@npm:1.0.0", conditions: "os=darwin & cpu=arm64" },
    "test@npm:^1": { version: "1.0.0", resolution: "test@npm:1.0.0" },
  } };
}

test("modern Yarn selects production workspaces and keeps development, platform and peer contexts honest", () => {
  const raw = modern();
  const result = resolveNative(raw, input, evidence);
  const occurrence = (path: string) => result.occurrences.find((o) => o.locator === path)!;
  assert.equal(result.profile.roots[0], occurrence("workspace:.").id);
  assert.ok(result.artifacts.some((a) => a.name === "wallet" && a.version === "2.0.0" && a.source === `source:${input.revision}:sdk`));
  const crypto = result.artifacts.find((a) => a.name === "@private/crypto")!;
  assert.equal(crypto.integrity, null);
  assert.equal(crypto.source, "yarn-registry:https://private.example:@private/crypto");
  assert.ok(result.edges.some((e) => e.to === occurrence("lock:test@npm:1.0.0").id && e.scope === "development"));
  assert.ok(!result.edges.some((e) => e.to === occurrence("lock:test@npm:1.0.0").id && e.scope === "runtime"));
  assert.ok(result.edges.some((e) => e.to === occurrence("lock:native@npm:1.0.0").id && e.optional && e.condition === "os=darwin & cpu=arm64"));
  assert.ok(!result.artifacts.some((a) => a.name === "host"));
  raw.lock.__metadata.version = 10;
  assert.equal(resolveNative(raw, input, evidence).profile.coverage, "partial");
});

test("Yarn rejects unknown formats and conflicting identities rather than selecting a plausible package", () => {
  assert.throws(() => parseYarnLock('__metadata:\n  version: 99\n'), /Unsupported modern/);
  const unknown = modern(); unknown.lock.__metadata.version = 99;
  assert.throws(() => resolveNative(unknown, input, evidence), /Unsupported modern/);
  assert.throws(() => parseYarnLock(`# yarn lockfile v1\n<<<<<<< HEAD\na@1:\n  version "1"\n=======\na@1:\n  version "2"\n>>>>>>> branch\n`), /conflict/);
  const raw = modern(); raw.manifests["packages/sdk"].name = "wrong";
  assert.throws(() => resolveNative(raw, input, evidence), /identity disagrees/);
  const mismatch = modern(); mismatch.lock["native@npm:^1"].version = "2.0.0";
  assert.throws(() => resolveNative(mismatch, input, evidence), /version disagrees/);
  const ambiguous = modern();
  Object.assign(ambiguous.lock, { "test@npm:^1, test@npm:2": { version: "2.0.0", resolution: "test@npm:2.0.0" } });
  const result = resolveNative(ambiguous, input, evidence);
  assert.ok(result.gaps.some((g) => g.reason.includes("Ambiguous Yarn descriptor")));
  const testIds = new Set(result.occurrences.filter((o) => o.locator.startsWith("lock:test@")).map((o) => o.id));
  assert.ok(!result.edges.some((e) => testIds.has(e.to)), "ambiguous selection cannot enter verified impact");
});

test("Yarn 3 metadata v6 resolves bare ranges and workspace aliases without inventing installed peer or artifact identity", () => {
  // Yarn 3.2.1 Project.generateLockfile emits these fields: unprefixed dependency
  // ranges, grouped descriptors, workspace placeholders and cache checksums.
  const parsed = parseYarnLock(`__metadata:
  version: 6
  cacheKey: 8
"monorepo@workspace:.":
  version: 0.0.0-use.local
  resolution: "monorepo@workspace:."
  dependencies:
    tooling: ^1
"wallet@workspace:packages/wallet":
  version: 0.0.0-use.local
  resolution: "wallet@workspace:packages/wallet"
  dependencies:
    sdk: "workspace:~"
    test: ^1
"sdk@workspace:~, sdk@workspace:packages/sdk":
  version: 0.0.0-use.local
  resolution: "sdk@workspace:packages/sdk"
  dependencies:
    native: ^1
"native@npm:^1, native@npm:1.0.0":
  version: 1.0.0
  resolution: "native@npm:1.0.0"
  checksum: abcdef
  conditions: os=darwin
  peerDependencies:
    host: ^1
"test@npm:^1":
  version: 1.0.0
  resolution: "test@npm:1.0.0"
"tooling@npm:^1":
  version: 1.0.0
  resolution: "tooling@npm:1.0.0"
`);
  const raw = { formatVersion: 1, ...parsed, sourceDirectory: ".", manifests: {
    ".": { name: "monorepo", devDependencies: { tooling: "^1" } },
    "packages/wallet": { name: "wallet", version: "0.56.0", dependencies: { sdk: "workspace:~" }, devDependencies: { test: "^1" } },
    "packages/sdk": { name: "sdk", version: "0.29.1", optionalDependencies: { native: "^1" } },
  } };
  const result = resolveNative(raw, { ...input, rootNames: ["wallet", "sdk"] }, evidence);
  const node = (locator: string) => result.occurrences.find((o) => o.locator === locator)!;
  assert.deepEqual(new Set(result.profile.roots), new Set([node("workspace:packages/wallet").id, node("workspace:packages/sdk").id]));
  assert.equal(result.occurrences.length, 6, "retain unselected orchestration and tooling for audit");
  assert.equal(result.occurrences.filter((o) => o.locator === "lock:native@npm:1.0.0").length, 1, "grouped descriptors share one occurrence");
  assert.equal(result.artifacts.find((a) => a.name === "wallet")!.version, "0.56.0");
  assert.ok(result.edges.some((e) => e.from === node("workspace:packages/wallet").id && e.to === node("workspace:packages/sdk").id && e.scope === "runtime"));
  assert.ok(result.edges.some((e) => e.to === node("lock:test@npm:1.0.0").id && e.scope === "development"));
  assert.ok(result.edges.some((e) => e.to === node("lock:native@npm:1.0.0").id && e.optional && e.condition === "os=darwin"));
  assert.equal(result.artifacts.find((a) => a.name === "native")!.integrity, null);
  assert.ok(!result.artifacts.some((a) => a.name === "host"));
  assert.ok(result.gaps.some((g) => g.reason.includes("peer bindings")));
  assert.ok(!result.gaps.some((g) => /No unambiguous|selection disagrees/.test(g.reason)));
  assert.equal(result.profile.coverage, "partial");
  raw.manifests["packages/wallet"].dependencies.sdk = "workspace:*";
  const stale = resolveNative(raw, input, evidence);
  assert.ok(stale.gaps.some((g) => g.reason.includes("manifest/lock selection disagrees for sdk")));
  assert.ok(!stale.edges.some((e) => e.from === stale.profile.roots[0] && e.scope === "runtime"));
});

test("local and patched Yarn sources remain distinct across nested consumer projects", () => {
  const raw = modern();
  Object.assign(raw.lock, { "patch@patch:base@npm:1#local.patch": { version: "1.0.0", resolution: "patch@patch:base@npm:1#local.patch" } });
  const first = resolveNative(raw, input, evidence);
  const second = resolveNative({ ...raw, sourceDirectory: "other" }, input, evidence);
  assert.notEqual(first.artifacts.find((a) => a.name === "patch")!.id, second.artifacts.find((a) => a.name === "patch")!.id);
  assert.ok(first.gaps.some((g) => g.reason.includes("patch/artifact verification")));
});

test("modern Yarn suppresses stale workspace selections even when a matching descriptor exists elsewhere", () => {
  const raw = modern();
  raw.lock["wallet@workspace:."].dependencies.test = "npm:^2";
  Object.assign(raw.lock, { "test@npm:^2": { version: "2.0.0", resolution: "test@npm:2.0.0" } });
  const result = resolveNative(raw, input, evidence);
  const root = result.profile.roots[0];
  const testIds = new Set(result.occurrences.filter((o) => o.locator.startsWith("lock:test@")).map((o) => o.id));
  assert.ok(result.gaps.some((g) => g.reason.includes("manifest/lock selection disagrees for test")));
  assert.ok(!result.edges.some((e) => e.from === root && testIds.has(e.to)));
  delete (raw.lock["wallet@workspace:."].dependencies as Record<string, string>).test;
  assert.ok(resolveNative(raw, input, evidence).gaps.some((g) => g.reason.includes("selection disagrees for test")));
});

test("Yarn candidates require a companion manifest and retain nested production paths", () => {
  const snapshot = inventory({ nodes: [{ id: "wallet", name: "Wallet" }] } as Graph, "catalog");
  snapshot.tools[0].manifests = ["sdk/package.json", "sdk/yarn.lock", "orphan/yarn.lock"];
  assert.deepEqual(collectionCandidates(snapshot)[0].candidates.map((c) => [c.adapter, c.path]), [["yarn-lock", "sdk/yarn.lock"]]);
});

test("native modern Yarn parsing preserves optional dependency metadata", () => {
  const parsed = parseYarnLock(`__metadata:
  version: 10
"wallet@workspace:.":
  version: 0.0.0-use.local
  resolution: "wallet@workspace:."
  dependencies:
    lib: "npm:^1"
  dependenciesMeta:
    lib:
      optional: true
"lib@npm:^1":
  version: 1.0.0
  resolution: "lib@npm:1.0.0"
`);
  const result = resolveNative({ formatVersion: 1, ...parsed, sourceDirectory: ".", manifests: { ".": { name: "wallet", version: "1.0.0", dependencies: { lib: "^1" } } } }, input, evidence);
  assert.equal(result.edges.length, 1);
  assert.equal(result.edges[0].optional, true, "Yarn's failsafe scalar strings retain their optional semantics");
});

test("registered Yarn refresh reuses retained capture evidence without a Yarn toolchain or checkout", async (t) => {
  t.mock.method(console, "log", () => {}); t.mock.method(console, "error", () => {});
  const directory = mkdtempSync(join(tmpdir(), "readiness-yarn-"));
  try {
    const store = new Store(directory);
    const snapshot = inventory({ nodes: [{ id: "wallet", name: "Wallet", repo: "owner/repo" }] } as Graph, "catalog");
    Object.assign(snapshot.tools[0], { revision: input.revision, release: input.release, manifests: ["package.json", "yarn.lock"] });
    const selection = { revision: input.revision, adapter: "yarn-lock" as const, roots: input.rootNames, path: "yarn.lock", platform: input.platform, resolverContext: YARN_CAPTURE_CONTEXT };
    publishCollection(snapshot, store, selection, input, modern(), [], "https://github.com/owner/repo");
    const digest = snapshot.semanticDigest;
    assert.deepEqual(await refreshNative(snapshot, store, directory, false, { toolIds: ["wallet"], limit: 1 }), { profilesRequested: 1, failed: 0 });
    assert.equal(store.load().semanticDigest, digest);
    store.verify(store.load());
  } finally { rmSync(directory, { recursive: true }); }
});
