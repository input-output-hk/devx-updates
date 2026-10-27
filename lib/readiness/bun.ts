import { posix } from "node:path";
import { canonical, list, object, text } from "./core";
import type { AdapterContext } from "./adapter-context";

const fields = ["dependencies", "optionalDependencies", "devDependencies", "peerDependencies"] as const;
export function bunWorkspacePaths(lock: Record<string, unknown>) {
  if (lock.lockfileVersion !== 1 || (lock.configVersion !== undefined && ![0, 1].includes(lock.configVersion as number))) throw new Error("Only Bun text lock version 1/config versions 0 and 1 are supported");
  const paths = Object.keys(object(lock.workspaces));
  if (!paths.includes("")) throw new Error("Bun lock has no root workspace");
  if (paths.some((path) => posix.isAbsolute(path) || path.includes("\\") || path.split("/").includes(".."))) throw new Error("Bun workspace escapes project");
  return paths;
}
function identity(value: string) {
  const index = value.indexOf("@", value.startsWith("@") ? 1 : 0);
  if (index < 1) throw new Error(`Invalid Bun package resolution ${value}`);
  return { name: value.slice(0, index), reference: value.slice(index + 1) };
}
/** Bun package keys describe nested package names, not filesystem paths. */
function parent(key: string) {
  const parts = key.split("/");
  parts.pop();
  if (parts.at(-1)?.startsWith("@")) parts.pop();
  return parts.join("/");
}
export function resolveBun(data: Record<string, unknown>, ctx: AdapterContext) {
  if (data.formatVersion !== 1) throw new Error("Unsupported Bun capture format");
  const lock = object(data.lock);
  const paths = bunWorkspacePaths(lock);
  const workspaces = object(lock.workspaces);
  const manifests = object(data.manifests);
  const packages = object(lock.packages);
  const directory = text(data.sourceDirectory);
  for (const field of ["overrides", "patchedDependencies"]) if (canonical(object(manifests[""])[field] ?? {}) !== canonical(lock[field] ?? {})) throw new Error(`Stale Bun root ${field} differs from manifest`);
  const names = paths.map((path) => object(manifests[path]).name);
  for (const name of ctx.input.rootNames) if (!names.includes(name)) throw new Error(`Selected Bun root ${name} is absent`);
  const targets = new Map<string, string>();
  const metadata = new Map<string, Record<string, unknown>>();
  for (const path of paths) {
    const locked = object(workspaces[path]);
    const manifest = object(manifests[path], `Bun manifest ${path || "."}`);
    if (manifest.name !== locked.name) throw new Error(`Bun workspace name mismatch at ${path}`);
    for (const field of fields) if (canonical(manifest[field] ?? {}) !== canonical(locked[field] ?? {})) throw new Error(`Stale Bun workspace ${path || "."}: ${field} differs from manifest`);
    const name = text(manifest.name);
    const locator = `workspace:${path}`;
    ctx.node(locator, name, typeof manifest.version === "string" ? manifest.version : null, `source:${ctx.input.revision}:${posix.join(directory, path)}`, null);
    if (locked.version !== undefined && locked.version !== manifest.version) ctx.gap(`Bun workspace ${name} lock version ${locked.version} differs from manifest ${manifest.version}.`);
    if (ctx.input.rootNames.includes(name)) ctx.root(locator);
    metadata.set(locator, locked);
  }
  for (const [key, raw] of Object.entries(packages)) {
    const tuple = list(raw);
    const { name, reference } = identity(text(tuple[0]));
    if (reference.startsWith("workspace:")) {
      const path = reference.slice(10);
      if (!paths.includes(path) || object(workspaces[path]).name !== name) throw new Error(`Unknown Bun workspace ${reference}`);
      targets.set(key, `workspace:${path}`);
      continue;
    }
    const npm = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(reference);
    const details = object(tuple[npm ? 2 : 1] ?? {});
    const version = npm ? reference : null;
    let source = `source:${ctx.input.revision}:${directory}:bun:${canonical(tuple)}`;
    let integrity: string | null = null;
    if (npm) {
      const url = typeof tuple[1] === "string" ? tuple[1] : undefined;
      if (url === undefined || typeof tuple[3] !== "string") throw new Error(`Invalid Bun npm tuple ${key}`);
      source = url || (data.registryConfiguration ? `bun-registry-unverified:${ctx.input.revision}:${directory}:${name}` : `https://registry.npmjs.org/${name}/-/${name.split("/").pop()}-${version}.tgz`);
      integrity = tuple[3] || null;
    } else ctx.gap(`Bun non-registry resolution ${key} (${reference}) requires source/artifact verification.`);
    const locator = `package:${key}`;
    ctx.node(locator, name, version, source, integrity);
    targets.set(key, locator); metadata.set(locator, details);
  }
  function lookup(key: string, name: string): string | undefined {
    for (let cursor = key; ; cursor = parent(cursor)) {
      const target = targets.get(cursor ? `${cursor}/${name}` : name);
      if (target) return target;
      if (!cursor) return;
    }
  }
  function dependencies(locator: string, entry: Record<string, unknown>, key: string, workspace: boolean) {
    const selected = new Map<string, string>();
    // Native Bun chooses the first declaration in dev -> optional -> prod -> peer order.
    for (const field of ["devDependencies", "optionalDependencies", "dependencies", "peerDependencies"] as const) for (const [name, value] of Object.entries(object(entry[field] ?? {}))) {
      if (selected.has(name)) {
        ctx.gap(`Bun ${field} ${name} from ${locator} is shadowed by ${selected.get(name)}; production-only selection requires a separate capture.`);
        continue;
      }
      selected.set(name, field);
      const peer = field === "peerDependencies";
      const optional = field === "optionalDependencies" || (peer && list(entry.optionalPeers ?? []).includes(name));
      const target = workspace ? targets.get(`${key}/${name}`) ?? targets.get(name) : lookup(key, name);
      if (!target) { ctx.gap(`Bun ${field} ${name} from ${locator} has no locked target.`); continue; }
      const details = metadata.get(target)!;
      const conditions = [peer ? "peer binding; installed context unverified" : null, optional ? `optional dependency ${name}` : null, ...["os", "cpu", "libc"].filter((field) => details[field] !== undefined).map((field) => `${field}:${canonical(details[field])}`)].filter(Boolean);
      ctx.edge(locator, target, field === "devDependencies" ? "development" : "runtime", optional || peer || conditions.length > 0, conditions.join("; ") || null, text(value));
    }
  }
  for (const path of paths) dependencies(`workspace:${path}`, object(workspaces[path]), path ? text(object(workspaces[path]).name) : "", true);
  for (const [key, locator] of targets) if (locator.startsWith("package:")) dependencies(locator, metadata.get(locator)!, key, false);
  for (const field of ["overrides", "patchedDependencies", "catalog", "catalogs"]) if (lock[field]) ctx.gap(`Bun ${field} retained; installed effects and patched content require verification.`);
  if (data.registryConfiguration) ctx.gap("Repository Bun/npm configuration retained; empty registry URLs have unresolved registry identity.");
  ctx.gap("Bun lock includes all recorded workspaces, development and platform/optional packages. Installed peer bindings, lifecycle outputs, native/WASM artifacts and published release correspondence remain unverified.");
}
