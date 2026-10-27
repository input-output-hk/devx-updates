import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureClassicWorkspaces } from "./yarn-workspaces";
import { resolveNative } from "./adapters";
import { parseYarnLock } from "./collect-yarn";
import { readJson, writeJson } from "./store";
import type { NativeInput } from "./types";

const input: NativeInput = { toolId: "service", release: "v1", revision: "a".repeat(40), platform: "all-lockfile-targets", features: [], command: "native Yarn info and lock", toolchain: "Yarn 1.22.22", origin: "source-reconstruction", adapter: "yarn-lock", rootNames: ["service"] };
function fixture() {
  return { formatVersion: 1, ...parseYarnLock(`# yarn lockfile v1
util@^2:
  version "2.0.0"
  resolved "https://registry.yarnpkg.com/util/-/util-2.0.0.tgz"
external@^1:
  version "1.0.0"
  resolved "https://registry.yarnpkg.com/external/-/external-1.0.0.tgz"
`), sourceDirectory: "nested", manifests: {
    ".": { name: "orchestration", private: true, workspaces: ["packages/*"] },
    "packages/service": { name: "service", version: "1.0.0", dependencies: { util: "^1" }, devDependencies: { test: "^1" } },
    "packages/util": { name: "util", version: "1.0.0", dependencies: { external: "^1", service: "^1" } },
    "packages/test": { name: "test", version: "1.0.0", dependencies: { util: "^2" } },
  }, classicWorkspaces: { info: {
    service: { location: "packages/service", workspaceDependencies: ["util", "test"], mismatchedWorkspaceDependencies: [] as string[] },
    util: { location: "packages/util", workspaceDependencies: ["service"], mismatchedWorkspaceDependencies: [] },
    test: { location: "packages/test", workspaceDependencies: [], mismatchedWorkspaceDependencies: ["util"] },
  } } };
}

test("Classic native workspace links preserve production roots, cycles, mismatches and development scope", () => {
  const raw = fixture(), result = resolveNative(raw, input, { native: "native", configuration: "configuration" });
  const node = (locator: string) => result.occurrences.find((o) => o.locator === locator)!;
  assert.deepEqual(result.profile.roots, [node("workspace:packages/service").id]);
  assert.ok(result.edges.some((e) => e.from === node("workspace:packages/service").id && e.to === node("workspace:packages/util").id && e.scope === "runtime"));
  assert.ok(result.edges.some((e) => e.from === node("workspace:packages/util").id && e.to === node("workspace:packages/service").id));
  assert.ok(result.edges.some((e) => e.from === node("workspace:packages/service").id && e.to === node("workspace:packages/test").id && e.scope === "development"));
  assert.ok(result.edges.some((e) => e.from === node("workspace:packages/test").id && e.to === node("lock:util@^2").id));
  assert.ok(result.artifacts.some((a) => a.name === "util" && a.source === `source:${input.revision}:nested/packages/util`));
  assert.ok(!result.gaps.some((g) => /No unambiguous|workspace linking is not resolved/.test(g.reason)));
  assert.equal(result.profile.coverage, "partial");
});

test("Classic workspace evidence rejects missing or conflicting identities and does not guess ambiguous ranges", () => {
  const bad = fixture(); bad.manifests["packages/util"].name = "wrong";
  assert.throws(() => resolveNative(bad, input, { native: "native", configuration: "configuration" }), /workspace identity/);
  const escaped = fixture(); escaped.classicWorkspaces.info.util.location = "../outside";
  assert.throws(() => resolveNative(escaped, input, { native: "native", configuration: "configuration" }), /workspace location/);
  const ambiguous = fixture(); ambiguous.classicWorkspaces.info.service.mismatchedWorkspaceDependencies.push("util");
  const result = resolveNative(ambiguous, input, { native: "native", configuration: "configuration" });
  const root = result.profile.roots[0];
  const utilIds = new Set(result.occurrences.filter((o) => o.locator.includes("util")).map((o) => o.id));
  assert.ok(!result.edges.some((e) => e.from === root && utilIds.has(e.to)));
  assert.ok(result.gaps.some((g) => /ambiguous.*workspace/i.test(g.reason)));
});

test("native Yarn workspace inspection ignores delegated binaries and lifecycle scripts without installing packages", async () => {
  const directory = mkdtempSync(join(tmpdir(), "readiness-native-yarn-"));
  try {
    writeJson(join(directory, "package.json"), { private: true, workspaces: ["packages/*"], scripts: { preinstall: "node delegated.cjs" } });
    writeFileSync(join(directory, "delegated.cjs"), "require('fs').writeFileSync('executed', 'unsafe'); process.exit(93);");
    writeFileSync(join(directory, ".yarnrc"), 'yarn-path "./delegated.cjs"\n');
    writeJson(join(directory, "packages/app/package.json"), { name: "app", version: "1.0.0", dependencies: { library: "^1" } });
    writeJson(join(directory, "packages/library/package.json"), { name: "library", version: "1.2.0" });
    const capture = await captureClassicWorkspaces(directory);
    assert.deepEqual(capture.info.app.workspaceDependencies, ["library"]);
    assert.equal(capture.info.library.location, "packages/library");
    assert.equal(capture.toolchain, "Yarn 1.22.22");
    assert.equal(existsSync(join(directory, "executed")), false);
    assert.equal(existsSync(join(directory, "node_modules")), false);
    assert.equal(existsSync(join(directory, "yarn.lock")), false);
    const raw = { formatVersion: 1, ...parseYarnLock("# yarn lockfile v1\n"), sourceDirectory: ".", classicWorkspaces: capture, manifests: Object.fromEntries([".", "packages/app", "packages/library"].map((path) => [path, readJson(join(directory, path, "package.json"))])) };
    const result = resolveNative(raw, { ...input, rootNames: ["app"] }, { native: "native", configuration: "config" });
    assert.equal(result.profile.roots.length, 1);
    assert.equal(result.edges.length, 1);
    assert.ok(result.gaps.some((g) => g.reason.includes("Unnamed Classic orchestration")));
    assert.throws(() => resolveNative(raw, { ...input, rootNames: ["app", "missing"] }, { native: "native", configuration: "config" }), /No Yarn workspace root matched missing/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("Classic workspace metadata cannot bypass install-time resolution overrides", () => {
  for (const resolutions of [{ util: "2.0.0" }, { "**/util": "2.0.0" }, { "**/*": "2.0.0" }]) {
    const raw = fixture(); Object.assign(raw.manifests["."], { resolutions });
    const result = resolveNative(raw, input, { native: "native", configuration: "configuration" });
    const root = result.profile.roots[0], util = result.occurrences.find((o) => o.locator === "workspace:packages/util")!;
    assert.ok(!result.edges.some((e) => e.from === root && e.to === util.id));
    assert.ok(result.gaps.some((g) => g.reason.includes("resolutions may override")));
  }
  const raw = fixture(); Object.assign(raw.manifests["."], { resolutions: { "**/external": "1.0.0" } });
  assert.ok(!resolveNative(raw, input, { native: "native", configuration: "configuration" }).gaps.some((g) => g.reason.includes("resolutions may override")));
});
