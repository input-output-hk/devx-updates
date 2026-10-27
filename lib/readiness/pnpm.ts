import { posix } from "node:path";
import { loadAll, JSON_SCHEMA } from "js-yaml";
import { canonical, object, text } from "./core";
import type { AdapterContext } from "./adapter-context";
import type { Scope } from "./types";

/** pnpm writes an optional environment document before the project lock. */
export function parsePnpmLock(source: string): { lock: Record<string, unknown>; environmentLock?: Record<string, unknown> } {
  const documents = loadAll(source, null, { schema: JSON_SCHEMA }).map((document) => object(document, "pnpm lock document"));
  if (documents.length !== 1 && documents.length !== 2) throw new Error("Expected one project lock document or environment and project documents");
  for (const document of documents) {
    if (String(document.lockfileVersion) !== "9.0") throw new Error("Only pnpm lockfile version 9.0 is supported");
    object(document.importers, "pnpm importers");
  }
  const lock = documents[documents.length - 1];
  for (const importer of Object.values(object(lock.importers))) {
    const entry = object(importer);
    if ("configDependencies" in entry || "packageManagerDependencies" in entry) throw new Error("Expected the project lock as the last pnpm document");
  }
  if (documents.length === 1) return { lock };
  const environmentLock = documents[0];
  const importers = object(environmentLock.importers);
  if (Object.keys(importers).length !== 1 || !("." in importers)) throw new Error("Expected one root importer in the pnpm environment document");
  const environment = object(importers["."]);
  if (!("configDependencies" in environment || "packageManagerDependencies" in environment)
      || Object.keys(environment).some((key) => !["configDependencies", "packageManagerDependencies"].includes(key))) {
    throw new Error("Expected only configuration and package-manager dependencies in the pnpm environment document");
  }
  return { lock, environmentLock };
}

export function pnpmPatchPaths(lock: Record<string, unknown>, workspace: Record<string, unknown>): string[] {
  return Object.entries(object(lock.patchedDependencies ?? {})).map(([name, patch]) => {
    const configured = typeof patch === "string" ? object(workspace.patchedDependencies ?? {})[name] : patch;
    const path = typeof configured === "string" ? configured : object(configured, `pnpm patch configuration for ${name}`).path;
    return text(path, `pnpm patch path for ${name}`);
  });
}

function packageIdentity(key: string) {
  const split = key.indexOf("@", key.startsWith("@") ? 1 : 0);
  if (split < 1) throw new Error(`Unsupported pnpm snapshot key: ${key}`);
  const base = key.split("(")[0];
  return { name: key.slice(0, split), reference: base.slice(split + 1), base };
}

export function resolvePnpm(data: Record<string, unknown>, ctx: AdapterContext) {
  if (data.environmentLock !== undefined) {
    object(data.environmentLock, "pnpm environment lock");
    ctx.gap("pnpm environment document is retained separately: configuration and package-manager dependencies are not part of this project graph. Their build/toolchain closure and executed plugin behavior remain unverified.");
  }
  const lock = object(data.lock, "pnpm lock");
  if (String(lock.lockfileVersion) !== "9.0") throw new Error("Only pnpm lockfile version 9.0 is supported");
  const importers = object(lock.importers, "pnpm importers");
  const snapshots = object(lock.snapshots ?? {}, "pnpm snapshots");
  const packages = object(lock.packages ?? {}, "pnpm package metadata");
  const manifests = object(data.manifests, "workspace manifests keyed by importer");
  const directory = typeof data.sourceDirectory === "string" ? data.sourceDirectory : ".";
  for (const importer of Object.keys(importers)) {
    if (!manifests[importer]) { ctx.gap(`Workspace manifest ${importer}/package.json is absent.`); continue; }
    const manifest = object(manifests[importer]);
    const name = typeof manifest.name === "string" ? manifest.name : `workspace:${importer}`;
    ctx.node(`workspace:${importer}`, name, typeof manifest.version === "string" ? manifest.version : null, `source:${ctx.input.revision}:${posix.join(directory, importer)}`, null);
    if (ctx.input.rootNames.includes(name)) ctx.root(`workspace:${importer}`);
  }
  for (const key of Object.keys(snapshots)) {
    const identity = packageIdentity(key);
    const metadata = object(packages[identity.base] ?? {});
    if (!packages[identity.base]) ctx.gap(`pnpm snapshot ${key} has no package metadata.`);
    const resolution = object(metadata.resolution ?? {});
    const local = /^(file:|link:)/.test(identity.reference) || resolution.type === "directory";
    const patch = key.match(/\(patch_hash=([^)]+)\)/)?.[1];
    const version = typeof metadata.version === "string" ? metadata.version : /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(identity.reference) ? identity.reference : null;
    const registries = object(data.registries ?? {});
    const scope = identity.name.startsWith("@") ? identity.name.split("/")[0] : "default";
    const registry = String(registries[scope] ?? registries.default ?? "https://registry.npmjs.org/").replace(/\/$/, "");
    const tarball = `${registry}/${identity.name}/-/${identity.name.split("/").pop()}-${version}.tgz`;
    const source = local ? `source:${ctx.input.revision}:${directory}:${canonical(resolution)}:${identity.reference}` : typeof resolution.tarball === "string" ? resolution.tarball : resolution.repo ? canonical(resolution) : version ? tarball : `pnpm-registry:${registry}:${identity.name}`;
    ctx.node(`snapshot:${key}`, typeof metadata.name === "string" ? metadata.name : identity.name, version, patch ? `${source}#patch=${patch}` : source, typeof resolution.integrity === "string" ? resolution.integrity : null);
    if (local || patch) ctx.gap(`Local or patched artifact ${key} needs source-content verification beyond the lockfile.`);
  }
  function target(fromImporter: string | undefined, name: string, value: unknown): string | undefined {
    const reference = typeof value === "string" ? value : text(object(value).version, `pnpm version for ${name}`);
    if (reference.startsWith("link:")) {
      if (fromImporter === undefined) { ctx.gap(`Unscoped workspace link ${name}: ${reference}`); return; }
      const directory = posix.normalize(posix.join(fromImporter, reference.slice(5)));
      if (!(directory in importers) || !manifests[directory]) { ctx.gap(`Workspace link ${name} points outside captured importers: ${directory}`); return; }
      return `workspace:${directory}`;
    }
    for (const key of [`${name}@${reference}`, reference]) if (key in snapshots) return `snapshot:${key}`;
    ctx.gap(`No pnpm snapshot resolves ${name}@${reference}.`);
  }
  function dependencies(from: string, entry: Record<string, unknown>, importer?: string, metadata: Record<string, unknown> = {}) {
    const peers = object(metadata.peerDependencies ?? {});
    const peerMeta = object(metadata.peerDependenciesMeta ?? {});
    for (const [field, scope] of [["dependencies", "runtime"], ["optionalDependencies", "runtime"], ["devDependencies", "development"]] as const) {
      for (const [name, value] of Object.entries(object(entry[field] ?? {}))) {
        if (field === "dependencies" && name in object(entry.optionalDependencies ?? {})) continue;
        const to = target(importer, name, value);
        if (!to) continue;
        const peer = name in peers;
        const optional = field === "optionalDependencies" || (peer && object(peerMeta[name] ?? {}).optional === true);
        const constraint = typeof value === "object" && value ? object(value).specifier : undefined;
        ctx.edge(from, to, scope as Scope, optional, peer ? "peer binding" : null, typeof constraint === "string" ? constraint : null);
      }
    }
  }
  for (const [key, raw] of Object.entries(snapshots)) dependencies(`snapshot:${key}`, object(raw), undefined, object(packages[packageIdentity(key).base] ?? {}));
  for (const [key, raw] of Object.entries(importers)) if (manifests[key]) dependencies(`workspace:${key}`, object(raw), key);
  ctx.gap("pnpm lock graph includes all recorded platform/optional selections. Installed-platform pruning, patches, and published artifact correspondence remain unverified.");
}
