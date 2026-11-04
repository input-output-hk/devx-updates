import { posix } from "node:path";
import { canonical, object, text } from "./core";
import type { AdapterContext } from "./adapter-context";
import type { Scope } from "./types";
import { classicWorkspaceInfo } from "./yarn-workspaces";

export const MODERN_YARN_LOCK_VERSIONS = [6, 8, 10] as const;

export function yarnIdent(reference: string) {
  const at = reference.indexOf("@", reference.startsWith("@") ? 1 : 0);
  if (at < 1) throw new Error(`Invalid Yarn package descriptor: ${reference}`);
  return { name: reference.slice(0, at), range: reference.slice(at + 1) };
}

export function yarnWorkspaces(lock: Record<string, unknown>): string[] {
  return [...new Set(Object.entries(lock).filter(([key]) => key !== "__metadata").flatMap(([, raw]) => {
    const resolution = object(raw).resolution;
    if (typeof resolution !== "string") throw new Error("Modern Yarn entry is missing its resolution");
    const { range } = yarnIdent(resolution);
    return range.startsWith("workspace:") ? [range.slice(10)] : [];
  }))].sort();
}

interface Selection {
  locator: string;
  entry: Record<string, unknown>;
  workspace?: string;
}

/** Preserve declared lock selections; never synthesize installed/virtual peer bindings. */
export function resolveYarn(data: Record<string, unknown>, ctx: AdapterContext) {
  if (data.formatVersion !== 1 || !["classic", "modern"].includes(String(data.kind))) throw new Error("Unsupported Yarn capture format");
  const modern = data.kind === "modern";
  const lock = object(data.lock, "Yarn lock");
  if (modern && !(MODERN_YARN_LOCK_VERSIONS as readonly number[]).includes(Number(object(lock.__metadata).version))) throw new Error("Unsupported modern Yarn lock version");
  const manifests = object(data.manifests, "Yarn source manifests");
  const classicInfo = !modern && data.classicWorkspaces !== undefined ? classicWorkspaceInfo(object(data.classicWorkspaces).info) : undefined;
  const classicByLocation = new Map(Object.entries(classicInfo ?? {}).map(([name, info]) => [info.location, { name, ...info }]));
  // Native `workspaces info` classifies manifest ranges, not install-time overrides.
  // Exact names and **/name selectors can be ruled out; other patterns stay opaque.
  const classicOverrides = classicInfo ? Object.keys(object(object(manifests["."]).resolutions ?? {})) : [];
  const mayOverrideWorkspace = (name: string) => classicOverrides.some((pattern) => {
    const target = pattern.replace(/^\*\*\//, "");
    return !/^(@[^/*?\[\]{}]+\/)?[^/*?\[\]{}]+$/.test(target) || target === name;
  });
  const directory = text(data.sourceDirectory, "Yarn source directory");
  const registries = object(data.registries ?? {});
  const selections = new Map<string, Selection>();
  const descriptors = new Map<string, string>();
  const ambiguous = new Set<string>();
  const opaqueSource = (value: string) => `source:${ctx.input.revision}:${directory}:yarn:${value}`;

  function index(descriptor: string, locator: string) {
    const previous = descriptors.get(descriptor);
    if (previous && previous !== locator) { ambiguous.add(descriptor); ctx.gap(`Ambiguous Yarn descriptor ${descriptor}.`); }
    descriptors.set(descriptor, locator);
  }

  for (const [key, value] of Object.entries(lock)) {
    if (key === "__metadata") continue;
    const entry = object(value);
    const aliases = modern ? key.split(/,\s*/) : [key];
    const resolution = modern ? text(entry.resolution) : key;
    const identity = yarnIdent(resolution);
    const workspace = modern && identity.range.startsWith("workspace:") ? identity.range.slice(10) : undefined;
    const locator = workspace === undefined ? `lock:${resolution}` : `workspace:${workspace}`;
    if (selections.has(locator)) {
      if (canonical(selections.get(locator)!.entry) !== canonical(entry)) throw new Error(`Conflicting Yarn resolution ${resolution}`);
      for (const alias of aliases) index(alias, locator);
      continue;
    }
    let name = identity.name;
    let version = typeof entry.version === "string" ? entry.version : null;
    let source = opaqueSource(resolution);
    let integrity: string | null = null;
    if (workspace !== undefined) {
      if (!manifests[workspace]) { ctx.gap(`Missing Yarn workspace manifest ${workspace}/package.json.`); continue; }
      const manifest = object(manifests[workspace]);
      if (manifest.name !== name) throw new Error(`Yarn workspace identity disagrees with manifest: ${workspace}`);
      version = typeof manifest.version === "string" ? manifest.version : null;
      source = `source:${ctx.input.revision}:${posix.join(directory, workspace)}`;
    } else if (modern && /^npm:\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(identity.range)) {
      if (version !== identity.range.slice(4)) throw new Error(`Yarn version disagrees with resolution: ${resolution}`);
      const registry = String(registries[name.startsWith("@") ? name.split("/")[0] : "default"] ?? registries.default ?? "https://registry.yarnpkg.com").replace(/\/$/, "");
      // A cache zip checksum is not distribution integrity; retain it only in raw evidence.
      source = `yarn-registry:${registry}:${name}`;
    } else if (!modern && typeof entry.resolved === "string" && /^https?:\/\//.test(entry.resolved) && /\.(tgz|tar\.gz)$/.test(new URL(entry.resolved).pathname)) {
      const url = new URL(entry.resolved);
      const sha1 = /^#[a-f0-9]{40}$/.test(url.hash) ? url.hash.slice(1) : undefined;
      if (identity.range.startsWith("npm:")) name = yarnIdent(identity.range.slice(4)).name;
      integrity = typeof entry.integrity === "string" ? entry.integrity : sha1 ? `sha1-${Buffer.from(sha1, "hex").toString("base64")}` : null;
      // These two public registries serve the same standard npm tarball namespace.
      if (url.origin === "https://registry.yarnpkg.com" && url.pathname === `/${name}/-/${name.split("/").pop()}-${version}.tgz`) url.hostname = "registry.npmjs.org";
      if (sha1) url.hash = "";
      source = url.toString();
    } else {
      ctx.gap(`Yarn source ${resolution} needs separate Git/local/patch/artifact verification.`);
    }
    ctx.node(locator, name, version, source, integrity);
    selections.set(locator, { locator, entry, workspace });
    for (const alias of aliases) index(alias, locator);
    if (workspace !== undefined && ctx.input.rootNames.includes(name)) ctx.root(locator);
  }

  if (!modern) {
    for (const workspace of [".", ...classicByLocation.keys()]) {
      const manifest = object(manifests[workspace], `${workspace}/package.json`);
      if (workspace === "." && classicInfo && manifest.name === undefined) {
        ctx.gap("Unnamed Classic orchestration root is retained as source; its own dependencies are not modeled as a package root.");
        continue;
      }
      const name = text(manifest.name);
      if (workspace !== "." && classicByLocation.get(workspace)!.name !== name) throw new Error(`Yarn workspace identity disagrees with manifest: ${workspace}`);
      const locator = `workspace:${workspace}`;
      ctx.node(locator, name, typeof manifest.version === "string" ? manifest.version : null, `source:${ctx.input.revision}:${posix.join(directory, workspace)}`, null);
      selections.set(locator, { locator, workspace, entry: manifest });
      if (ctx.input.rootNames.includes(name)) ctx.root(locator);
    }
    if (object(manifests["."]).workspaces && !classicInfo) ctx.gap("Classic Yarn workspace linking is not resolved by this collector; collect an installed workspace inventory.");
  }

  const workspaceNames = new Set([...selections.values()].filter((selection) => selection.workspace !== undefined).map((selection) => object(manifests[selection.workspace!]).name));
  for (const name of ctx.input.rootNames) if (!workspaceNames.has(name)) throw new Error(`No Yarn workspace root matched ${name}; check package names and captured workspace membership`);

  const normalize = (range: string) => modern && !/^[\w+.-]+:/.test(range) ? `npm:${range}` : range;
  function dependency(from: Selection, name: string, range: unknown, scope: Scope, optional: boolean) {
    const constraint = text(range, `Yarn dependency ${name}`);
    if (classicInfo && from.workspace !== undefined && Object.hasOwn(classicInfo, name)) {
      if (mayOverrideWorkspace(name)) {
        ctx.gap(`Yarn resolutions may override workspace ${name} from ${from.locator}; installed selection needs separate evidence and no edge was inferred.`);
        return;
      }
      const info = classicByLocation.get(from.workspace);
      const matches = info?.workspaceDependencies.includes(name);
      const mismatches = info?.mismatchedWorkspaceDependencies.includes(name);
      if (!info || matches === mismatches) {
        ctx.gap(`Ambiguous or unavailable native workspace selection for ${name} from ${from.locator}; no dependency edge was inferred.`);
        return;
      }
      if (matches) {
        ctx.edge(from.locator, `workspace:${classicInfo[name].location}`, scope, optional, null, constraint);
        return;
      }
      // Yarn reports a version mismatch: the dependency must use its external lock selection.
    }
    const descriptor = `${name}@${normalize(constraint)}`;
    const target = descriptors.get(descriptor);
    if (!target || ambiguous.has(descriptor)) { ctx.gap(`No unambiguous Yarn selection for ${descriptor} from ${from.locator}.`); return; }
    const conditions = selections.get(target)!.entry.conditions;
    ctx.edge(from.locator, target, scope, optional || typeof conditions === "string", typeof conditions === "string" ? conditions : null, constraint);
  }
  let peerPackages = 0;
  for (const selected of selections.values()) {
    const manifest = selected.workspace === undefined ? selected.entry : object(manifests[selected.workspace]);
    if (Object.keys(object(manifest.peerDependencies ?? {})).length) peerPackages++;
    const optional = object(manifest.optionalDependencies ?? {});
    const meta = object(selected.entry.dependenciesMeta ?? {});
    for (const [field, scope] of [["dependencies", "runtime"], ["optionalDependencies", "runtime"], ["devDependencies", "development"]] as const) {
      if (field === "devDependencies" && selected.workspace === undefined) continue;
      for (const [name, range] of Object.entries(object(manifest[field] ?? {}))) {
        if (field === "dependencies" && name in optional) continue;
        if (modern && selected.workspace !== undefined) {
          const lockedRange = object(selected.entry.dependencies ?? {})[name];
          if (typeof lockedRange !== "string" || normalize(lockedRange) !== normalize(text(range))) {
            ctx.gap(`Yarn workspace ${selected.workspace} manifest/lock selection disagrees for ${name}; no dependency edge was inferred.`);
            continue;
          }
        }
        const optionalFlag = object(meta[name] ?? {}).optional;
        dependency(selected, name, range, scope, field === "optionalDependencies" || optionalFlag === true || optionalFlag === "true");
      }
    }
    if (modern && selected.workspace !== undefined) {
      const declared = new Set(["dependencies", "optionalDependencies", "devDependencies"].flatMap((field) => Object.keys(object(manifest[field] ?? {}))));
      for (const name of Object.keys(object(selected.entry.dependencies ?? {}))) if (!declared.has(name)) ctx.gap(`Yarn workspace ${selected.workspace} has undeclared locked dependency ${name}; manifest/lock correspondence needs review.`);
    }
  }
  for (const issue of Array.isArray(data.issues) ? data.issues : []) ctx.gap(text(issue));
  if (peerPackages) ctx.gap(`${peerPackages} Yarn package records declare peers; consumer-specific peer bindings remain unresolved and no peer edges were guessed.`);
  ctx.gap("Yarn lock selections are not an installed dependency inventory. Hoisting, virtual peer contexts, platform/optional pruning, native bundles and published artifact correspondence remain unverified; Classic locks also omit transitive peer declarations.");
}
