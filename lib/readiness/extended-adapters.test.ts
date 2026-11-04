import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveNative } from "./adapters";
import { parseJsonStream } from "./go";
import { parsePnpmLock, pnpmPatchPaths } from "./pnpm";
import type { NativeInput, Resolution } from "./types";

const profile: NativeInput = { toolId: "tool", release: "v1", revision: "a".repeat(40), platform: "linux/amd64", features: [], command: "native resolver", toolchain: "test", origin: "source-reconstruction", adapter: "pnpm-lock", rootNames: ["app"] };
const evidence = { native: "output", configuration: "config" };
// Minimal form of pnpm's documented environment + project lock layout.
const environmentDocument = `lockfileVersion: '9.0'
importers:
  .:
    configDependencies: {}
    packageManagerDependencies:
      pnpm: {specifier: 12.11.2, version: 12.11.2}
packages:
  pnpm@12.11.2: {}
snapshots:
  pnpm@12.11.2: {}
`;
const projectDocument = `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      library: {specifier: ^1, version: 1.0.0}
packages:
  library@1.0.0: {}
snapshots:
  library@1.0.0: {}
`;

test("pnpm two-document collection preserves the environment without treating it as application exposure", () => {
  const source = `---\n${environmentDocument}---\n${projectDocument}`;
  for (const input of [source, source.replaceAll("\n", "\r\n")]) {
    const parsed = parsePnpmLock(input);
    assert.deepEqual(parsed.environmentLock?.snapshots, { "pnpm@12.11.2": {} });
    const result = resolveNative({ ...parsed, manifests: { ".": { name: "app" } } }, profile, evidence);
    assert.deepEqual(result.artifacts.map((a) => a.name).sort(), ["app", "library"]);
    assert.deepEqual(targets(result, "workspace:.").map((e) => e.target), ["snapshot:library@1.0.0"]);
    assert.ok(result.gaps.some((g) => g.reason.includes("environment document")));
  }
});

test("pnpm rejects ambiguous, reversed and unsupported lock documents", () => {
  for (const source of ["", environmentDocument, `${projectDocument}---\n${environmentDocument}`,
    `${projectDocument}---\n${projectDocument}`, `${environmentDocument}---\n${projectDocument}---\n${projectDocument}`,
    `${environmentDocument.replace("'9.0'", "'10.0'")}---\n${projectDocument}`,
    `${environmentDocument.replace('configDependencies: {}', 'dependencies: {}')}---\n${projectDocument}`]) {
    assert.throws(() => parsePnpmLock(source));
  }
});

test("pnpm single-document captures preserve the historical raw shape and graph", () => {
  const parsed = parsePnpmLock(projectDocument);
  assert.deepEqual(Object.keys(parsed), ["lock"]);
  const manifests = { ".": { name: "app" } };
  const before = resolveNative({ lock: parsed.lock, manifests }, profile, evidence);
  const after = resolveNative({ ...parsed, manifests }, profile, evidence);
  assert.deepEqual(after, before);
});

test("pnpm retains patch files for object and hash-only lock entries", () => {
  assert.deepEqual(pnpmPatchPaths({ patchedDependencies: { "lib@1": { hash: "abc", path: "patches/lib.patch" } } }, {}), ["patches/lib.patch"]);
  const lock = { patchedDependencies: { "lib@1": "abc" } };
  assert.deepEqual(pnpmPatchPaths(lock, { patchedDependencies: { "lib@1": "patches/lib.patch" } }), ["patches/lib.patch"]);
  assert.throws(() => pnpmPatchPaths(lock, {}), /patch configuration/);
  assert.throws(() => pnpmPatchPaths({ patchedDependencies: { "lib@1": { hash: "abc" } } }, {}), /patch path/);
});

function targets(result: Resolution, locator: string) {
  const node = result.occurrences.find((n) => n.locator === locator)!;
  return result.edges.filter((e) => e.from === node.id).map((e) => ({ ...e, target: result.occurrences.find((n) => n.id === e.to)!.locator }));
}

test("pnpm peer snapshots share artifacts without sharing outgoing resolutions", () => {
  const result = resolveNative({ manifests: { ".": { name: "app", version: "1" }, "packages/child": { name: "child", version: "1" } }, lock: {
    lockfileVersion: "9.0", importers: { ".": { dependencies: { child: { version: "link:packages/child" }, library: { specifier: "^1", version: "1.0.0(peer@1.0.0)" } }, devDependencies: { test: { version: "1.0.0" } } }, "packages/child": { optionalDependencies: { library: { version: "1.0.0(peer@2.0.0)" } } } },
    packages: { "library@1.0.0": { resolution: { integrity: "sha512-library" }, peerDependencies: { peer: "*" } }, "peer@1.0.0": {}, "peer@2.0.0": {}, "test@1.0.0": {} },
    snapshots: { "library@1.0.0(peer@1.0.0)": { dependencies: { peer: "1.0.0" } }, "library@1.0.0(peer@2.0.0)": { dependencies: { peer: "2.0.0" } }, "peer@1.0.0": {}, "peer@2.0.0": {}, "test@1.0.0": {} },
  } }, profile, evidence);
  assert.equal(result.artifacts.filter((a) => a.name === "library").length, 1);
  assert.deepEqual(targets(result, "snapshot:library@1.0.0(peer@1.0.0)").map((e) => e.target), ["snapshot:peer@1.0.0"]);
  assert.deepEqual(targets(result, "snapshot:library@1.0.0(peer@2.0.0)").map((e) => e.target), ["snapshot:peer@2.0.0"]);
  assert.equal(targets(result, "workspace:packages/child")[0].optional, true);
  assert.ok(targets(result, "workspace:.").some((e) => e.scope === "development"));
  assert.equal(result.profile.coverage, "partial");
});

test("pnpm aliases resolve to actual package identity and missing snapshots stay explicit", () => {
  const result = resolveNative({ manifests: { ".": { name: "app" } }, lock: { lockfileVersion: "9.0", importers: { ".": { dependencies: { alias: { version: "@scope/actual@2.0.0" }, missing: { version: "1.0.0" } } } }, packages: { "@scope/actual@2.0.0": {} }, snapshots: { "@scope/actual@2.0.0": {} } } }, profile, evidence);
  assert.ok(result.artifacts.some((a) => a.name === "@scope/actual" && a.ecosystem === "npm"));
  assert.ok(result.gaps.some((g) => g.reason.includes("missing@1.0.0")));
  assert.throws(() => resolveNative({ lock: { lockfileVersion: "6.0" } }, profile, evidence), /version 9/);
});

test("nested pnpm workspaces retain their checkout-relative source identity", () => {
  const raw = { manifests: { ".": { name: "app", version: "1" } }, lock: { lockfileVersion: "9.0", importers: { ".": { dependencies: { lib: { version: "file:vendor/lib" } } } }, packages: { "lib@file:vendor/lib": { version: "1.0.0", resolution: { directory: "vendor/lib", type: "directory" } } }, snapshots: { "lib@file:vendor/lib": {} } } };
  const first = resolveNative({ ...raw, sourceDirectory: "first" }, profile, evidence);
  const second = resolveNative({ ...raw, sourceDirectory: "second" }, profile, evidence);
  assert.notEqual(first.artifacts[0].id, second.artifacts[0].id);
  assert.match(first.artifacts[0].source, /:first$/);
  assert.notEqual(first.artifacts.find((a) => a.name === "lib")!.id, second.artifacts.find((a) => a.name === "lib")!.id);
});

test("npm and pnpm share public registry artifacts while custom registries stay distinct", () => {
  const npm = resolveNative({ lockfileVersion: 3, packages: { "": { name: "app", dependencies: { lib: "1" } }, "node_modules/lib": { version: "1.0.0", resolved: "https://registry.npmjs.org/lib/-/lib-1.0.0.tgz", integrity: "sha512-lib" } } }, { ...profile, adapter: "npm-lock" }, evidence);
  const raw = { manifests: { ".": { name: "app" } }, lock: { lockfileVersion: "9.0", importers: { ".": { dependencies: { lib: { version: "1.0.0" } } } }, packages: { "lib@1.0.0": { resolution: { integrity: "sha512-lib" } } }, snapshots: { "lib@1.0.0": {} } } };
  const pnpm = resolveNative(raw, profile, evidence);
  assert.equal(npm.artifacts.find((a) => a.name === "lib")!.id, pnpm.artifacts.find((a) => a.name === "lib")!.id);
  const custom = resolveNative({ ...raw, registries: { default: "https://registry.example.org/" } }, profile, evidence);
  assert.notEqual(custom.artifacts.find((a) => a.name === "lib")!.id, pnpm.artifacts.find((a) => a.name === "lib")!.id);
});

test("Go native JSON stream handles escaped braces and rejects truncated output", () => {
  assert.deepEqual(parseJsonStream('{"name":"a}\\\""}\n{"nested":{"x":1}}'), [{ name: 'a}"' }, { nested: { x: 1 } }]);
  assert.throws(() => parseJsonStream('{"name":'), /Truncated/);
});

test("Go uses native package selections and replacements while separating test graphs", () => {
  const rootModule = { Path: "example.org/app", Main: true, Dir: "/src" };
  const dependency = { Path: "example.org/library", Version: "v1.0.0", Replace: { Path: "example.org/fork", Version: "v2.0.0", Sum: "h1:fork" } };
  const result = resolveNative({ formatVersion: 1, sourceRoot: "/src", environment: { GOOS: "linux", GOARCH: "amd64", CGO_ENABLED: "0", GOVERSION: "go1.26.8" }, packages: [
    { ImportPath: "example.org/app", Module: rootModule, Imports: ["example.org/library/codec"] },
    { ImportPath: "example.org/library/codec", Module: dependency, DepOnly: true, Imports: ["fmt"] },
    { ImportPath: "fmt", Standard: true },
  ], tests: [
    { ImportPath: "example.org/app.test", Module: rootModule, Imports: ["example.org/test-helper"] },
    { ImportPath: "example.org/test-helper", Module: { Path: "example.org/test-helper", Version: "v1" }, DepOnly: true },
  ] }, { ...profile, adapter: "go-packages", rootNames: ["example.org/app"] }, evidence);
  const library = result.artifacts.find((a) => a.name === "example.org/library/codec")!;
  assert.equal(library.version, "v2.0.0"); assert.equal(library.source, "gomod:example.org/fork"); assert.equal(library.integrity, "h1:fork");
  assert.equal(result.profile.coverage, "complete");
  assert.ok(targets(result, "runtime:example.org/app").some((e) => e.target.endsWith("app.test") && e.scope === "development"));
  assert.ok(result.edges.some((e) => e.scope === "runtime"));
});

test("Go incomplete packages, missing imports, and external local replacements create gaps", () => {
  const result = resolveNative({ formatVersion: 1, sourceRoot: "/src", environment: { GOOS: "linux", GOARCH: "amd64", CGO_ENABLED: "0", GOVERSION: "go1.26.8" }, packages: [
    { ImportPath: "example.org/app", Module: { Path: "example.org/app", Main: true, Dir: "/src" }, Imports: ["missing"], Incomplete: true, Error: { Err: "checksum missing" } },
    { ImportPath: "external", Module: { Path: "external", Replace: { Path: "../external", Dir: "/external" } }, DepOnly: true },
  ], tests: [] }, { ...profile, adapter: "go-packages", rootNames: ["example.org/app"] }, evidence);
  assert.equal(result.profile.coverage, "partial");
  assert.ok(result.gaps.some((g) => g.reason.includes("missing")));
  assert.ok(result.gaps.some((g) => g.reason.includes("outside the pinned")));
});

test("uv keeps extra and group contexts separate from base runtime dependencies", () => {
  const source = { virtual: "/src" };
  const result = resolveNative({ schema: { version: "preview" }, inverted: false, workspace_root: "/src", collectionSourceRoot: "/src", workspace: { id: "workspace" }, members: [{ id: "app" }], resolution: {
    workspace: { kind: "workspace", dependencies: [] },
    app: { name: "app", version: "1", source, kind: "package", dependencies: [{ id: "base" }], optional_dependencies: [{ name: "async", id: "app[async]" }], dependency_groups: [{ name: "dev", id: "app:dev" }] },
    "app[async]": { name: "app", version: "1", source, kind: { extra: "async" }, dependencies: [{ id: "async-client" }, { id: "app" }] },
    "app:dev": { name: "app", version: "1", source, kind: { group: "dev" }, dependencies: [{ id: "test" }] },
    base: { name: "base", version: "1", source: { registry: { url: "https://pypi.org/simple" } }, kind: "package", dependencies: [] },
    "async-client": { name: "async-client", version: "2", source: { registry: { url: "https://pypi.org/simple" } }, kind: "package", dependencies: [{ id: "base", marker: "python_version < '3.15'" }] },
    test: { name: "test", version: "3", source: { registry: { url: "https://pypi.org/simple" } }, kind: "package", dependencies: [] },
  } }, { ...profile, adapter: "uv-tree" }, evidence);
  assert.equal(result.profile.roots.length, 1);
  assert.equal(result.artifacts.filter((a) => a.name === "app").length, 1);
  assert.equal(targets(result, "app").find((e) => e.target === "app[async]")!.optional, true);
  assert.equal(targets(result, "app").find((e) => e.target === "app:dev")!.scope, "development");
  assert.equal(targets(result, "app[async]").find((e) => e.target === "async-client")!.optional, false);
  assert.match(targets(result, "async-client")[0].condition!, /python_version/);
  assert.equal(result.profile.coverage, "partial");
});
