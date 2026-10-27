import { artifact, digest, gap, list, object, text } from "./core";
import type { Edge, NativeInput, Resolution, Scope } from "./types";
import { NATIVE_ADAPTERS } from "./types";
import { resolvePnpm } from "./pnpm";
import { resolveGo } from "./go";
import { resolveUv } from "./uv";
import { resolveBun } from "./bun";
import { resolvePoetry } from "./poetry";
import { resolveYarn } from "./yarn";
import type { AdapterContext } from "./adapter-context";
import { npmRootPaths } from "./npm-roots";
import { resolveCabal } from "./cabal";
import { resolveGradle } from "./gradle";

export function parseNativeInput(value: unknown): NativeInput {
  const v = object(value, "profile");
  for (const key of ["toolId", "release", "revision", "platform", "command", "toolchain"]) text(v[key], key);
  if (!/^[a-f0-9]{40,64}$/.test(v.revision as string)) throw new Error("revision must be an immutable source commit/digest");
  for (const key of ["features", "rootNames"]) list(v[key], key).forEach((item) => text(item, key));
  if (!(v.rootNames as string[]).length) throw new Error("Select at least one root package");
  if (!["release-build", "source-reconstruction"].includes(v.origin as string)) throw new Error("Invalid resolution origin");
  if (!(NATIVE_ADAPTERS as readonly unknown[]).includes(v.adapter)) throw new Error("Unsupported native adapter");
  npmRootPaths(v.rootPaths, String(v.adapter));
  return v as unknown as NativeInput;
}

export function resolveNative(raw: unknown, input: NativeInput, evidence: { native: string; configuration: string; supporting?: string[] }): Resolution {
  const selectedPaths = npmRootPaths(input.rootPaths, input.adapter)?.map((path) => path === "." ? "" : path);
  const native = object(raw, "native output");
  const wrappedNpm = input.adapter === "npm-lock" && "formatVersion" in native;
  if (wrappedNpm && native.formatVersion !== 1) throw new Error("Unsupported npm capture format");
  const data = wrappedNpm ? object(native.lock, "npm lock") : native;
  const inputDigest = digest({ raw, input, supportingEvidenceIds: [...(evidence.supporting ?? [])].sort(), adapterVersion: ["pnpm-lock", "yarn-lock", "go-packages", "uv-tree"].includes(input.adapter) ? 3 : 2 });
  const evidenceIds = [...new Set([evidence.native, evidence.configuration, ...(evidence.supporting ?? [])])].sort();
  const profileId = `profile:${input.toolId}:${inputDigest.slice(0, 24)}`;
  const result: Resolution = {
    profile: { id: profileId, toolId: input.toolId, release: input.release, revision: input.revision, platform: input.platform, features: input.features, command: input.command, toolchain: input.toolchain, origin: input.origin, roots: [], inputDigest, evidenceIds, nativeEvidenceId: evidence.native, configurationEvidenceId: evidence.configuration, coverage: "complete" },
    artifacts: [], occurrences: [], edges: [], gaps: [],
  };
  const locators = new Map<string, string>();
  const artifactIds = new Set<string>();
  const edgeIds = new Set<string>();
  const addNode = (locator: string, name: string, version: string | null, source: string, integrity: string | null) => {
    const ecosystem = ["pnpm-lock", "yarn-lock", "bun-lock"].includes(input.adapter) ? "npm" : ["uv-tree", "poetry-lock"].includes(input.adapter) ? "python" : input.adapter.split("-")[0];
    const a = artifact({ ecosystem, name, version, source, integrity });
    if (!artifactIds.has(a.id)) { result.artifacts.push(a); artifactIds.add(a.id); }
    const id = `occurrence:${digest({ profileId, locator })}`;
    if (locators.has(locator)) throw new Error(`Duplicate native locator ${locator}`);
    result.occurrences.push({ id, artifactId: a.id, profileId, locator, evidenceIds }); locators.set(locator, id);
    return id;
  };
  const missing = (reason: string) => {
    result.gaps.push(gap("resolution", reason, "Recollect a complete native build plan for this profile.", profileId));
    result.profile.coverage = "partial";
  };
  const addEdge = (from: string, to: string, scope: Scope, optional = false, condition: string | null = null, constraint: string | null = null) => {
    if (!locators.has(from)) { missing(`Unresolved dependency consumer ${from}`); return; }
    if (!locators.has(to)) { missing(`Unresolved dependency ${to} from ${from}`); return; }
    const fields: Omit<Edge, "id"> = { from: locators.get(from)!, to: locators.get(to)!, type: "package", scope, optional, condition, constraint, verification: "verified", evidenceIds };
    const id = `edge:${digest(fields)}`;
    if (!edgeIds.has(id)) { result.edges.push({ id, ...fields }); edgeIds.add(id); }
  };

  const context: AdapterContext = { input, node: addNode, edge: addEdge, gap: missing, root: (locator) => {
    const id = locators.get(locator);
    if (!id) missing(`Unresolved root ${locator}`); else if (!result.profile.roots.includes(id)) result.profile.roots.push(id);
  } };
  if (input.adapter === "cabal-plan" && "formatVersion" in data) resolveCabal(data, context);
  else if (input.adapter === "gradle-resolution") resolveGradle(data, context);
  else if (input.adapter === "pnpm-lock") resolvePnpm(data, context);
  else if (input.adapter === "yarn-lock") resolveYarn(data, context);
  else if (input.adapter === "bun-lock") resolveBun(data, context);
  else if (input.adapter === "poetry-lock") resolvePoetry(data, context);
  else if (input.adapter === "go-packages") resolveGo(data, context);
  else if (input.adapter === "uv-tree") resolveUv(data, context);
  else if (input.adapter === "npm-lock") {
    if (![2, 3].includes(data.lockfileVersion as number)) throw new Error("Only npm lockfile versions 2 and 3 are supported");
    const packages = object(data.packages, "packages");
    const entries = Object.entries(packages).map(([path, value]) => [path, object(value)] as const);
    // npm can omit a workspace's name while retaining it in its node_modules link.
    // Legacy captures retain their original identities for historical replay.
    const workspaceNames = new Map<string, Set<string>>();
    if (wrappedNpm) for (const [path, pkg] of entries) {
      if (!pkg.link || typeof pkg.resolved !== "string" || !path.includes("node_modules/")) continue;
      const names = workspaceNames.get(pkg.resolved) ?? new Set<string>();
      names.add(path.split("node_modules/").pop()!);
      workspaceNames.set(pkg.resolved, names);
    }
    for (const [path, pkg] of entries) {
      if (pkg.link) continue;
      const linkedNames = workspaceNames.get(path);
      if (wrappedNpm && path && !path.includes("node_modules/") && typeof pkg.name !== "string" && linkedNames?.size !== 1) {
        missing(`Workspace package name for ${path} is missing or ambiguous in the lockfile.`);
      }
      const name = typeof pkg.name === "string" ? pkg.name : linkedNames?.size === 1 ? [...linkedNames][0] : path ? path.split("node_modules/").pop()! : text(data.name, "root package name");
      const version = typeof pkg.version === "string" ? pkg.version : null;
      const source = typeof pkg.resolved === "string" && !pkg.resolved.startsWith("file:") ? pkg.resolved : `source:${input.revision}:${path}`;
      addNode(path, name, version, source, typeof pkg.integrity === "string" ? pkg.integrity : null);
      if (input.rootNames.includes(name) && !path.includes("node_modules/") && (!selectedPaths || selectedPaths.includes(path))) result.profile.roots.push(locators.get(path)!);
    }
    if (selectedPaths) {
      const roots = result.occurrences.filter((o) => result.profile.roots.includes(o.id));
      for (const path of selectedPaths) if (!roots.some((o) => o.locator === path)) throw new Error(`Selected root path ${path || "."} did not match a named workspace package`);
      for (const name of input.rootNames) if (!roots.some((o) => result.artifacts.find((a) => a.id === o.artifactId)?.name === name)) throw new Error(`Selected root name ${name} did not match the explicit paths`);
    }
    const dereference = (path: string): string | undefined => {
      const pkg = packages[path] ? object(packages[path]) : undefined;
      if (!pkg) return undefined;
      if (pkg.link) return typeof pkg.resolved === "string" && locators.has(pkg.resolved) ? pkg.resolved : undefined;
      return locators.has(path) ? path : undefined;
    };
    const lookup = (from: string, name: string) => {
      let directory = from;
      for (;;) {
        const found = dereference(`${directory ? `${directory}/` : ""}node_modules/${name}`);
        if (found !== undefined) return found;
        if (!directory) return undefined;
        directory = directory.includes("/") ? directory.slice(0, directory.lastIndexOf("/")) : "";
      }
    };
    for (const [path, pkg] of entries) {
      if (pkg.link) continue;
      const optionalDeps = object(pkg.optionalDependencies ?? {});
      const peerMeta = object(pkg.peerDependenciesMeta ?? {});
      for (const [key, scope] of [["dependencies", "runtime"], ["optionalDependencies", "runtime"], ["peerDependencies", "runtime"], ["devDependencies", "development"]] as const) {
        for (const [name, constraint] of Object.entries(object(pkg[key] ?? {}))) {
          if (key === "dependencies" && name in optionalDeps) continue;
          const optional = key === "optionalDependencies" || (key === "peerDependencies" && object(peerMeta[name] ?? {}).optional === true);
          const target = lookup(path, name);
          if (target === undefined) { missing(`${optional ? "Optional " : ""}${key} ${name} from ${path || "root"} has no locked occurrence.`); continue; }
          addEdge(path, target, scope, optional, key === "peerDependencies" ? "peer binding" : null, typeof constraint === "string" ? constraint : null);
        }
      }
    }
    missing("Lockfile graph is an all-platform selection, not an installed or release-build dependency inventory. Platform/optional pruning and shipped artifact correspondence remain unverified.");
  } else if (input.adapter === "cargo-metadata") {
    const packages = list(data.packages, "packages").map((p) => object(p));
    const packageById = new Map(packages.map((p) => [text(p.id), p]));
    const resolve = object(data.resolve, "resolve (do not use --no-deps)");
    const nodes = list(resolve.nodes, "resolve.nodes").map((n) => object(n));
    const members = new Set(list(data.workspace_members, "workspace_members").map((id) => text(id)));
    for (const pkg of packages) {
      const id = text(pkg.id); const name = text(pkg.name);
      addNode(id, name, text(pkg.version), typeof pkg.source === "string" ? pkg.source : `source:${input.revision}:${text(pkg.manifest_path).replace(text(data.workspace_root), ".")}`, null);
      if (members.has(id) && input.rootNames.includes(name)) result.profile.roots.push(locators.get(id)!);
    }
    for (const node of nodes) {
      const from = text(node.id);
      for (const rawDep of list(node.deps, "node.deps")) {
        const dep = object(rawDep);
        const dependencyName = text(dep.name, "dependency name");
        const declarations = list(packageById.get(from)?.dependencies ?? []).map((d) => object(d));
        const targetPackage = packageById.get(text(dep.pkg));
        const libraryNames = list(targetPackage?.targets ?? []).map((t) => object(t)).filter((t) => list(t.kind ?? []).some((kind) => ["lib", "rlib", "proc-macro"].includes(String(kind)))).map((t) => text(t.name));
        for (const rawKind of list(dep.dep_kinds, "dep_kinds")) {
          const kind = object(rawKind);
          const scope = kind.kind === "build" ? "build" : kind.kind === "dev" ? "development" : "runtime";
          const matching = declarations.filter((d) => {
            const declaredName = text(d.rename ?? d.name).replace(/-/g, "_");
            const nameMatches = declaredName === dependencyName.replace(/-/g, "_") || (!d.rename && d.name === targetPackage?.name && libraryNames.includes(dependencyName));
            return nameMatches && (d.kind ?? null) === (kind.kind ?? null) && (d.target ?? null) === (kind.target ?? null);
          });
          const featureOptional = matching.length > 0 && matching.every((d) => d.optional === true);
          const conditions = [typeof kind.target === "string" ? kind.target : null, featureOptional ? `feature-gated dependency ${dependencyName}` : null, !matching.length ? "dependency declaration unavailable; optionality unverified" : null].filter(Boolean);
          if (!matching.length) missing(`Dependency declaration for ${dependencyName} from ${from} is absent; feature optionality is unverified.`);
          addEdge(from, text(dep.pkg), scope, kind.target !== null || featureOptional || !matching.length, conditions.length ? conditions.join("; ") : null);
        }
      }
    }
    const resolutionIds = new Set(nodes.map((n) => text(n.id)));
    const occurrenceById = new Map(result.occurrences.map((n) => [n.id, n]));
    const outgoing = new Map<string, string[]>();
    for (const edge of result.edges) outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
    const reachable = [...result.profile.roots];
    const visited = new Set<string>();
    for (let i = 0; i < reachable.length; i++) {
      const id = reachable[i]; if (visited.has(id)) continue; visited.add(id);
      const occurrence = occurrenceById.get(id)!;
      if (!resolutionIds.has(occurrence.locator)) missing(`Reachable package ${occurrence.locator} is missing its Cargo resolution node.`);
      reachable.push(...(outgoing.get(id) ?? []));
    }
    if (!input.command.includes("--filter-platform")) missing("Cargo metadata has no declared --filter-platform; target applicability requires review.");
  } else {
    const units = list(data["install-plan"], "install-plan").map((v) => object(v));
    for (const unit of units) {
      const name = text(unit["pkg-name"]); const id = text(unit.id);
      const source = unit["pkg-src"] ? JSON.stringify(unit["pkg-src"]) : `compiler:${text(data["compiler-id"])}:${id}`;
      addNode(id, name, text(unit["pkg-version"]), unit.style === "local" ? `source:${input.revision}:${source}` : source, typeof unit["pkg-src-sha256"] === "string" ? unit["pkg-src-sha256"] : null);
      if (input.rootNames.includes(name) && unit.style === "local") result.profile.roots.push(locators.get(id)!);
    }
    for (const unit of units) {
      const components: [string, unknown][] = unit.components ? Object.entries(object(unit.components)) : [[typeof unit["component-name"] === "string" ? unit["component-name"] : "lib", unit]];
      for (const [component, rawComponent] of components) {
        const details = object(rawComponent);
        const scope = /^(test|bench):/.test(component) ? "development" : "runtime";
        for (const dependency of list(details.depends ?? [])) addEdge(text(unit.id), text(dependency), scope);
        for (const dependency of list(details["exe-depends"] ?? [])) addEdge(text(unit.id), text(dependency), "build");
      }
    }
  }
  if (!result.profile.roots.length) throw new Error(`No roots matched ${input.rootNames.join(", ")}; check package names and workspace membership`);
  const matched = new Set(result.profile.roots.map((id) => result.artifacts.find((a) => a.id === result.occurrences.find((n) => n.id === id)!.artifactId)!.name));
  if (input.adapter !== "go-packages") for (const root of input.rootNames) if (!matched.has(root)) missing(`Requested root ${root} is absent from native output.`);
  return result;
}
