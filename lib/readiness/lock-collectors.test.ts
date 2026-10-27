import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execute } from "./source";
import { parseBunLock, BUN_CAPTURE_CONTEXT } from "./collect-locks";
import { resolveNative } from "./adapters";
import { inventory } from "./core";
import { collectionCandidates } from "./candidates";
import { detectManifests } from "./discovery";
import { publishCollection } from "./collection";
import { refreshNative } from "./collect";
import { Store } from "./store";
import type { NativeInput, Resolution } from "./types";
import type { Graph } from "../map-types";
const input: NativeInput = { toolId: "sdk", release: "v1", revision: "a".repeat(40), platform: "all-lockfile-targets", features: [], command: "read", toolchain: "native lock", origin: "source-reconstruction", adapter: "bun-lock", rootNames: ["@sdk/wallet"] };
const evidence = { native: "native", configuration: "config" };
function fixture() {
  const workspaces = { "": { name: "repo", devDependencies: { tooling: "1" } }, "packages/wallet": { name: "@sdk/wallet", version: "1.2.0", dependencies: { alias: "npm:real@1", shared: "1" }, peerDependencies: { peer: "1" }, optionalDependencies: { platform: "1" } } };
  return { formatVersion: 1, sourceDirectory: "sdk", lock: { lockfileVersion: 1, workspaces, packages: {
    "@sdk/wallet": ["@sdk/wallet@workspace:packages/wallet"],
    alias: ["real@1.0.0", "", { dependencies: { shared: "2" } }, "sha512-real"],
    "alias/shared": ["shared@2.0.0", "https://custom.example/shared.tgz", {}, "sha512-two"],
    shared: ["shared@1.0.0", "", {}, "sha512-one"],
    peer: ["peer@1.0.0", "", {}, "sha512-peer"],
    platform: ["platform@1.0.0", "", { os: ["darwin"], cpu: ["arm64"] }, "sha512-platform"],
    tooling: ["tooling@1.0.0", "", {}, "sha512-tooling"],
  } }, manifests: structuredClone(workspaces) };
}
function edge(r: Resolution, from: string, to: string) { const ids = new Map(r.occurrences.map((o) => [o.locator, o.id])); return r.edges.find((e) => e.from === ids.get(from) && e.to === ids.get(to)); }

test("Bun preserves production roots, aliased nested lookup, development scope and platform/peer conditions", () => {
  const r = resolveNative(fixture(), input, evidence);
  assert.equal(r.occurrences.length, 8);
  assert.equal(r.profile.roots.length, 1);
  assert.equal(r.occurrences.find((o) => o.id === r.profile.roots[0])!.locator, "workspace:packages/wallet");
  assert.ok(edge(r, "package:alias", "package:alias/shared"));
  assert.equal(edge(r, "package:alias", "package:shared"), undefined);
  assert.equal(edge(r, "workspace:", "package:tooling")!.scope, "development");
  assert.match(edge(r, "workspace:packages/wallet", "package:platform")!.condition!, /darwin.*arm64/);
  assert.equal(edge(r, "workspace:packages/wallet", "package:peer")!.optional, true);
  assert.equal(r.artifacts.find((a) => a.name === "real")!.source, "https://registry.npmjs.org/real/-/real-1.0.0.tgz");
  assert.equal(r.profile.coverage, "partial");
});
test("Bun rejects stale manifests/unknown formats and records missing targets/configuration uncertainty", () => {
  assert.equal(parseBunLock('{"lockfileVersion":1,"workspaces":{"":{"name":"repo"}}, /* comment */}').lockfileVersion, 1);
  assert.throws(() => parseBunLock('{"lockfileVersion":1,"workspaces":{"":{"name":"repo"}}, "bad":?}'), /Invalid/);
  assert.throws(() => parseBunLock('{"lockfileVersion":2,"workspaces":{"":{"name":"repo"}}}'), /Only Bun/);
  const f = fixture(); f.manifests["packages/wallet"].dependencies.shared = "2";
  assert.throws(() => resolveNative(f, input, evidence), /Stale Bun/);
  const absent = fixture(); delete (absent.lock.packages as Record<string, unknown>).peer;
  assert.ok(resolveNative(absent, input, evidence).gaps.some((g) => /peer.*has no locked target/.test(g.reason)));
  assert.match(resolveNative({ ...fixture(), registryConfiguration: true }, input, evidence).artifacts.find((a) => a.name === "real")!.source, /^bun-registry-unverified:/);
});
test("Bun scoped package parents resolve without treating the scope as a package", () => {
  const f = fixture(); Object.assign(f.lock.packages, { alias: ["real@1.0.0", "", { dependencies: { "@scope/child": "1" } }, "sha512-x"], "alias/@scope/child": ["@scope/child@1.0.0", "", { dependencies: { shared: "2" } }, "sha512-y"] });
  const r = resolveNative(f, input, evidence);
  assert.ok(edge(r, "package:alias/@scope/child", "package:alias/shared"));
});
test("discovery finds Bun text/binary locks but advertises only supported production inputs", () => {
  const s = inventory({ nodes: [{ id: "sdk", name: "SDK", repo: "owner/repo" }] } as Graph, "catalog");
  s.tools[0].manifests = detectManifests(["sdk/bun.lock", "sdk/package.json", "old/bun.lockb", "old/package.json", "py/pyproject.toml", "py/poetry.lock", "orphan/bun.lock"]).manifests;
  assert.ok(s.tools[0].manifests.includes("old/bun.lockb"));
  assert.deepEqual(collectionCandidates(s)[0].candidates.map((c) => [c.adapter, c.path]), [["poetry-lock", "py/poetry.lock"], ["bun-lock", "sdk/bun.lock"]]);
});
test("Bun registered collections refresh from retained evidence without checkout", async (t) => {
  t.mock.method(console, "log", () => {}); t.mock.method(console, "error", () => {});
  const directory = mkdtempSync(join(tmpdir(), "readiness-bun-"));
  try {
    const store = new Store(directory), s = inventory({ nodes: [{ id: "sdk", name: "SDK", repo: "owner/repo" }] } as Graph, "catalog");
    Object.assign(s.tools[0], { revision: input.revision, release: input.release, manifests: ["bun.lock", "package.json"] });
    publishCollection(s, store, { revision: input.revision, adapter: "bun-lock", roots: input.rootNames, path: "bun.lock", platform: input.platform, resolverContext: BUN_CAPTURE_CONTEXT }, input, fixture(), [], "https://github.com/owner/repo");
    const digest = store.load().semanticDigest;
    assert.deepEqual(await refreshNative(s, store, directory, false, { toolIds: ["sdk"] }), { profilesRequested: 1, failed: 0 });
    assert.equal(store.load().semanticDigest, digest); store.verify(store.load());
  } finally { rmSync(directory, { recursive: true }); }
});
const python = process.env.READINESS_POETRY_PYTHON ?? resolve(".readiness/toolchains/poetry/bin/python");
test("native Poetry verifies freshness and resolves version alternatives, groups, markers and sources", { skip: !existsSync(python) }, async () => {
  const directory = mkdtempSync(join(tmpdir(), "readiness-poetry-"));
  try {
    writeFileSync(join(directory, "pyproject.toml"), `[tool.poetry]\nname = "sdk"\nversion = "1.0.0"\ndescription = "test"\nauthors = []\n[tool.poetry.dependencies]\npython = ">=3.9"\nshared = ">=1,<3"\nprivate-dep = {version = "1", source = "private", optional = true}\n[tool.poetry.extras]\nfeature = ["private-dep"]\n[tool.poetry.group.dev.dependencies]\nshared = "2"\n`);
    writeFileSync(join(directory, "poetry.lock"), [1, 2].map((v) => `[[package]]\nname = "shared"\nversion = "${v}.0.0"\noptional = false\npython-versions = ">=3.9"\ngroups = ["main", "dev"]\nmarkers = 'python_version ${v === 1 ? "<" : ">="} "3.11"'\nfiles = [{file="shared.whl",hash="sha256:abc"}]\n[package.dependencies]\nleaf = ">=1,<3"\n`).join("\n") + [false, true].map((custom) => `\n[[package]]\nname = "private-dep"\nversion = "1.0.0"\noptional = true\npython-versions = "*"\ngroups = ["main"]\nfiles = []\n${custom ? '[package.source]\ntype = "legacy"\nurl = "https://private.example/simple"\nreference = "private"\n' : ''}`).join("\n") + [1, 2].map((v) => `\n[[package]]\nname = "leaf"\nversion = "${v}.0.0"\noptional = false\npython-versions = "*"\ngroups = ["${v === 1 ? "main" : "dev"}"]\nfiles = []\n`).join("\n") + '\n[metadata]\nlock-version = "2.1"\npython-versions = ">=3.9"\ncontent-hash = "HASH"\n');
    await execute(python, ["-I", "-c", 'import sys,tomllib;from pathlib import Path;from poetry.packages.locker import Locker;p=Path(sys.argv[1]);l=p/"poetry.lock";h=Locker(l,tomllib.loads((p/"pyproject.toml").read_text()))._get_content_hash();l.write_text(l.read_text().replace("HASH",h))', directory]);
    const run = async () => JSON.parse((await execute(python, ["-I", resolve("scripts/readiness/poetry-capture.py"), directory, "poetry.lock"], { encoding: "utf8" })).stdout);
    const raw = { ...await run(), sourceDirectory: "python" };
    const r = resolveNative(raw, { ...input, adapter: "poetry-lock", rootNames: ["sdk"] }, evidence);
    assert.equal(r.occurrences.length, 9);
    assert.equal(r.edges.filter((e) => e.scope === "runtime").length, 5);
    assert.equal(r.edges.filter((e) => e.scope === "development").length, 3);
    assert.ok(r.edges.filter((e) => e.from === r.profile.roots[0]).every((e) => e.optional));
    assert.ok(r.edges.filter((e) => e.from === r.profile.roots[0] && e.constraint === ">=1,<3").every((e) => e.condition?.includes("locked markers")));
    assert.equal(edge(r, "root", "package:2:main"), undefined);
    assert.match(edge(r, "root", "package:3:main")!.condition!, /optional dependency/);
    assert.ok(r.artifacts.every((a) => a.integrity === null));
    assert.equal(r.artifacts.find((a) => a.name === "sdk")!.source, `source:${input.revision}:python`);
    const lockPath = join(directory, "poetry.lock");
    writeFileSync(lockPath, readFileSync(lockPath, "utf8").replace('groups = ["main", "dev"]', 'groups = ["main"]').replace('groups = ["main", "dev"]', 'groups = ["dev"]'));
    const separated = resolveNative({ ...await run(), sourceDirectory: "python" }, { ...input, adapter: "poetry-lock", rootNames: ["sdk"] }, evidence);
    assert.equal(edge(separated, "root", "package:1:dev")!.scope, "development");
    assert.equal(separated.edges.filter((e) => e.scope === "runtime").length, 3);
    assert.equal(edge(separated, "root", "package:0:main")!.scope, "runtime");
    assert.ok(edge(separated, "package:0:main", "package:4:main"));
    assert.equal(edge(separated, "package:0:main", "package:5:dev"), undefined);
    assert.ok(edge(separated, "package:1:dev", "package:5:dev"));
    const invalid = { ...await run(), sourceDirectory: "python" };
    invalid.packages.find((pkg: { id: string }) => pkg.id === "0:main").dependencies[0].targets = ["5:dev"];
    assert.throws(() => resolveNative(invalid, { ...input, adapter: "poetry-lock", rootNames: ["sdk"] }, evidence), /crosses locked groups/);
    writeFileSync(join(directory, "pyproject.toml"), readFileSync(join(directory, "pyproject.toml"), "utf8").replace(">=1,<3", ">=3"));
    await assert.rejects(run, /content hash/);
  } finally { rmSync(directory, { recursive: true }); }
});

test("Bun uses native duplicate declaration precedence without leaking dev selections into runtime", () => {
  const f = fixture();
  Object.assign(f.lock.workspaces["packages/wallet"], { devDependencies: { shared: "2" } });
  Object.assign(f.manifests["packages/wallet"], { devDependencies: { shared: "2" } });
  const r = resolveNative(f, input, evidence);
  const relation = edge(r, "workspace:packages/wallet", "package:shared")!;
  assert.equal(relation.scope, "development");
  assert.equal(r.edges.filter((e) => e.from === relation.from && e.to === relation.to).length, 1);
  assert.ok(r.gaps.some((g) => g.reason.includes("shadowed by devDependencies")));
});

test("Bun config version 0 preserves workspace resolution and rejects unknown configuration versions", () => {
  const current = fixture();
  const older = { ...current, lock: { ...current.lock, configVersion: 0 } };
  const parsed = parseBunLock(JSON.stringify(older.lock));
  assert.equal(parsed.configVersion, 0);
  const oldResult = resolveNative(older, input, evidence);
  const currentResult = resolveNative(current, input, evidence);
  assert.deepEqual(oldResult.artifacts, currentResult.artifacts);
  assert.deepEqual(oldResult.occurrences.map((o) => o.locator), currentResult.occurrences.map((o) => o.locator));
  assert.equal(edge(oldResult, "workspace:packages/wallet", "package:shared")!.scope, "runtime");
  assert.equal(edge(oldResult, "workspace:", "package:tooling")!.scope, "development");
  assert.ok(edge(oldResult, "package:alias", "package:alias/shared"));
  for (const version of [-1, 0.5, 2, "0"]) assert.throws(() => parseBunLock(JSON.stringify({ ...current.lock, configVersion: version })), /config versions/);
});
