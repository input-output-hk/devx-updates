import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveNative } from "./adapters";
import type { NativeInput } from "./types";

const input: NativeInput = { toolId: "atlas", release: "v1", revision: "a".repeat(40), platform: "x86_64-linux", features: [], command: "cabal build atlas:lib:atlas --dry-run", toolchain: "ghc-9.6.6 / cabal-install 3.12.1.0", origin: "source-reconstruction", adapter: "cabal-plan", rootNames: ["atlas"] };
function capture() {
  const configured = (id: string, name: string, component: string, depends: string[] = [], executables: string[] = []) => ({
    id, type: "configured", "pkg-name": name, "pkg-version": "1", flags: { network: true }, style: "global",
    "pkg-src": { type: "repo-tar", repo: { type: "secure-repo", uri: "https://hackage.haskell.org/" } },
    "pkg-src-sha256": "b".repeat(64), "component-name": component, depends, "exe-depends": executables,
  });
  return {
    formatVersion: 1, sourceDirectory: "/source", roots: [{ unitId: "atlas", component: "lib" }],
    plan: { "cabal-version": "3.12.1.0", "cabal-lib-version": "3.12.1.0", "compiler-id": "ghc-9.6.6", arch: "x86_64", os: "linux", "install-plan": [
      { ...configured("atlas", "atlas", "lib", ["base", "custom"], ["generator"]), style: "local", "pkg-src": { type: "local", path: "/source/." } },
      { ...configured("atlas-test", "atlas", "test:checks", ["test-only"]), style: "local", "pkg-src": { type: "local", path: "/source/." } },
      { id: "base", "pkg-name": "base", "pkg-version": "4.18", type: "pre-existing", depends: [] },
      configured("generator", "generator", "exe:generate", ["base"]),
      configured("test-only", "test-only", "lib"),
      { ...configured("custom", "custom", "lib"), components: {
        lib: { depends: ["base"], "exe-depends": [] },
        "exe:example": { depends: ["test-only"], "exe-depends": [] },
        setup: { depends: ["setup-only"], "exe-depends": [] },
      } },
      configured("setup-only", "setup-only", "lib"),
    ] as Record<string, unknown>[] },
  };
}
const resolve = (raw = capture()) => resolveNative(raw, input, { native: "native", configuration: "configuration" });

test("Cabal component roots exclude test and example siblings; setup and executables are build paths", () => {
  const result = resolve();
  const locator = (id: string, component: string) => result.occurrences.find((o) => o.locator === JSON.stringify([id, component]))!.id;
  assert.deepEqual(result.profile.roots, [locator("atlas", "lib")]);
  assert.ok(result.edges.some((e) => e.from === locator("atlas-test", "test:checks") && e.scope === "development"));
  assert.ok(result.edges.some((e) => e.to === locator("generator", "exe:generate") && e.scope === "build"));
  assert.ok(result.edges.some((e) => e.from === locator("custom", "lib") && e.to === locator("custom", "setup") && e.scope === "build"));
  assert.ok(result.edges.some((e) => e.to === locator("setup-only", "lib") && e.scope === "build"));
  const reachable = new Set(result.profile.roots);
  for (const id of reachable) for (const edge of result.edges.filter((e) => e.from === id)) reachable.add(edge.to);
  assert.ok(!reachable.has(locator("test-only", "lib")));
  assert.ok(reachable.has(locator("setup-only", "lib")));
  assert.equal(result.profile.coverage, "partial");
  assert.equal(result.gaps.length, 1); // Source plan alone cannot prove native or shipped artifacts.
});

test("Cabal identities preserve metadata revisions, compiler platform and pinned external source repositories", () => {
  const raw = capture();
  const dependency = raw.plan["install-plan"][4];
  dependency["pkg-src"] = { type: "source-repo", "source-repo": { type: "git", location: "https://github.com/example/sdk", tag: "c".repeat(40), subdir: "sdk" } };
  dependency["pkg-cabal-sha256"] = "d".repeat(64);
  const first = resolve(raw);
  const source = first.artifacts.find((a) => a.name === "test-only")!.source;
  assert.ok(source.includes("c".repeat(40)));
  assert.ok(!source.includes(input.revision));
  assert.ok(first.artifacts.find((a) => a.name === "base")!.source.includes("ghc-9.6.6:x86_64-linux"));
  assert.equal(first.artifacts.find((a) => a.name === "atlas")!.source, `source:${input.revision}:.`);
  dependency["pkg-cabal-sha256"] = "e".repeat(64);
  assert.notEqual(first.artifacts.find((a) => a.name === "test-only")!.id, resolve(raw).artifacts.find((a) => a.name === "test-only")!.id);
});

test("Cabal missing or ambiguous dependency targets stay visible as gaps", () => {
  const raw = capture();
  raw.plan["install-plan"][0].depends = ["missing"];
  raw.plan["install-plan"][0]["exe-depends"] = ["custom"]; // Add another executable: no exact target in package-level ID.
  (raw.plan["install-plan"][5].components as Record<string, unknown>)["exe:second"] = { depends: [], "exe-depends": [] };
  const result = resolve(raw);
  assert.ok(result.gaps.some((g) => g.reason.includes("missing is missing")));
  assert.ok(result.gaps.some((g) => g.reason.includes("custom is missing or ambiguous")));
  assert.ok(!result.edges.some((e) => e.from === result.profile.roots[0]));
});

test("Cabal malformed dependency lists, versions, flags and selected roots fail closed", () => {
  const changes = [
    (raw: ReturnType<typeof capture>) => { delete raw.plan["install-plan"][0].depends; },
    (raw: ReturnType<typeof capture>) => { delete raw.plan["install-plan"][0]["exe-depends"]; },
    (raw: ReturnType<typeof capture>) => { raw.plan["install-plan"][0].flags = { network: "yes" }; },
    (raw: ReturnType<typeof capture>) => { raw.plan["cabal-version"] = "9"; },
    (raw: ReturnType<typeof capture>) => { raw.plan.arch = "aarch64"; },
    (raw: ReturnType<typeof capture>) => { raw.formatVersion = 9; },
    (raw: ReturnType<typeof capture>) => { raw.roots[0].unitId = "generator"; },
    (raw: ReturnType<typeof capture>) => { raw.roots[0].component = "test:missing"; },
  ];
  for (const change of changes) { const raw = capture(); change(raw); assert.throws(() => resolve(raw)); }
});

test("Cabal mutable repositories and local sources outside the checkout cannot borrow its revision", () => {
  const raw = capture();
  raw.plan["install-plan"][4]["pkg-src"] = { type: "local", path: "/cache/external" };
  raw.plan["install-plan"][6]["pkg-src"] = { type: "source-repo", "source-repo": { type: "git", location: "https://github.com/example/sdk", tag: "main" } };
  const result = resolve(raw);
  assert.ok(result.gaps.some((g) => g.reason.includes("outside the pinned checkout")));
  assert.ok(result.gaps.some((g) => g.reason.includes("immutable Git commit")));
  assert.ok(!result.artifacts.find((a) => a.name === "test-only")!.source.includes(input.revision));
});

test("Cabal source object ordering does not change artifact identity", () => {
  const raw = capture(); const first = resolve(raw);
  raw.plan["install-plan"][4]["pkg-src"] = { repo: { uri: "https://hackage.haskell.org/", type: "secure-repo" }, type: "repo-tar" };
  assert.deepEqual(resolve(raw).artifacts, first.artifacts);
});
