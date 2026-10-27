import { existsSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { parse } from "@yarnpkg/lockfile";
import { parseSyml } from "@yarnpkg/parsers";
import { object } from "./core";
import { pinnedCheckout, retainSource, sourcePath } from "./source";
import { publishCollection, reuseCollection, type CollectOptions, type CollectionSelection } from "./collection";
import type { Snapshot, NativeInput } from "./types";
import type { Store } from "./store";
import { MODERN_YARN_LOCK_VERSIONS, yarnWorkspaces } from "./yarn";
import { captureClassicWorkspaces, CLASSIC_WORKSPACE_VERSION } from "./yarn-workspaces";
import packageJson from "../../package.json";

const classicParserVersion = packageJson.dependencies["@yarnpkg/lockfile"];
const modernParserVersion = packageJson.dependencies["@yarnpkg/parsers"];
export const YARN_CAPTURE_CONTEXT = `committed-yarn-lock:v2;classic-parser:${classicParserVersion};modern-parser:${modernParserVersion};workspace-reader:${CLASSIC_WORKSPACE_VERSION}`;

export function parseYarnLock(content: string) {
  if (/^# yarn lockfile v1\r?$/m.test(content)) {
    const parsed = parse(content);
    if (parsed.type !== "success") throw new Error(`Classic Yarn lock parse was ${parsed.type}; resolve conflicts before collection`);
    return { kind: "classic" as const, lock: object(parsed.object) };
  }
  const lock = object(parseSyml(content), "modern Yarn lock");
  if (!(MODERN_YARN_LOCK_VERSIONS as readonly number[]).includes(Number(object(lock.__metadata).version))) throw new Error(`Unsupported modern Yarn lock version; supported metadata versions are ${MODERN_YARN_LOCK_VERSIONS.join(", ")}`);
  return { kind: "modern" as const, lock };
}

/** Capture committed inputs only: no install, project scripts, or local Yarn configuration. */
export async function collectYarn(snapshot: Snapshot, store: Store, options: CollectOptions) {
  const tool = snapshot.tools.find((t) => t.id === options.toolId)!;
  if (options.platform !== "all-lockfile-targets") throw new Error("Yarn lock capture requires platform all-lockfile-targets");
  const path = options.path ?? "yarn.lock";
  if (posix.isAbsolute(path) || path.split("/").some((part) => !part || part === "..")) throw new Error("Select a relative Yarn lock path");
  if (!tool.manifests.includes(path) || posix.basename(path) !== "yarn.lock") throw new Error(`No discovered Yarn lock ${path}`);
  const selection: CollectionSelection = { revision: tool.revision!, adapter: "yarn-lock", roots: options.roots, path, platform: options.platform, resolverContext: YARN_CAPTURE_CONTEXT };
  const cached = reuseCollection(snapshot, store, options, selection);
  if (cached) return cached;
  const root = await pinnedCheckout(tool.repo!, tool.revision!, options.stateDir);
  const sourceDirectory = posix.dirname(path);
  const parsed = parseYarnLock(readFileSync(sourcePath(root, path), "utf8"));
  const rootManifestPath = posix.join(sourceDirectory, "package.json");
  const rootManifest = object(JSON.parse(readFileSync(sourcePath(root, rootManifestPath), "utf8")));
  const classicWorkspaces = parsed.kind === "classic" && rootManifest.workspaces
    ? await captureClassicWorkspaces(sourcePath(root, sourceDirectory)) : undefined;
  const manifests: Record<string, unknown> = {};
  const supportPaths = [path];
  const issues: string[] = [];
  const workspaces = parsed.kind === "modern" ? yarnWorkspaces(parsed.lock) : [".", ...Object.values(classicWorkspaces?.info ?? {}).map((row) => row.location)];
  for (const workspace of workspaces) {
    if (posix.isAbsolute(workspace) || workspace.split("/").includes("..")) throw new Error(`Yarn workspace escapes selected project: ${workspace}`);
    const manifestPath = posix.join(sourceDirectory, workspace, "package.json");
    const full = sourcePath(root, manifestPath);
    if (!existsSync(full)) { issues.push(`Missing captured workspace manifest ${manifestPath}.`); continue; }
    manifests[workspace] = JSON.parse(readFileSync(full, "utf8"));
    supportPaths.push(manifestPath);
  }
  supportPaths.push(rootManifestPath);
  const registries: Record<string, string> = { default: "https://registry.yarnpkg.com" };
  const ancestors: string[] = [];
  for (let directory = sourceDirectory; ; directory = posix.dirname(directory)) {
    ancestors.unshift(directory);
    if (directory === ".") break;
  }
  function registry(value: unknown) {
    if (typeof value !== "string" || value.includes("${")) throw new Error("Yarn registry needs an explicit public URL");
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Yarn registry needs an explicit public URL");
    return value.replace(/\/$/, "");
  }
  for (const directory of ancestors) {
    for (const filename of [".yarnrc.yml", ".yarnrc", ".npmrc"]) {
      const configPath = posix.join(directory, filename);
      if (!existsSync(sourcePath(root, configPath))) continue;
      supportPaths.push(configPath);
      if (filename !== ".yarnrc.yml" || parsed.kind !== "modern") continue;
      const config = object(parseSyml(readFileSync(sourcePath(root, configPath), "utf8")));
      if (config.npmRegistryServer !== undefined) registries.default = registry(config.npmRegistryServer);
      for (const [scope, raw] of Object.entries(object(config.npmScopes ?? {}))) {
        const scoped = object(raw);
        if (scoped.npmRegistryServer !== undefined) registries[`@${scope}`] = registry(scoped.npmRegistryServer);
      }
      if (config.defaultProtocol !== undefined && config.defaultProtocol !== "npm:") throw new Error("Custom Yarn defaultProtocol is not supported");
      for (const field of ["packageExtensions", "plugins", "yarnPath"]) if (config[field]) issues.push(`Captured ${configPath} declares ${field}; its effect on installed dependency behavior needs separate verification.`);
    }
  }
  const raw = { formatVersion: 1, ...parsed, manifests, sourceDirectory, registries, issues, ...(classicWorkspaces ? { classicWorkspaces } : {}) };
  const supporting = retainSource(snapshot, store, tool.id, root, supportPaths);
  const profile: NativeInput = {
    toolId: tool.id, release: tool.release!, revision: tool.revision!, platform: options.platform,
    features: ["all-lockfile-targets", "peer-bindings:unresolved"],
    command: `Read committed ${path}, package manifests and repository configuration at ${tool.revision}${classicWorkspaces ? `; ${classicWorkspaces.command}` : ""}`,
    toolchain: `Yarn ${parsed.kind} lock; ${String(rootManifest.packageManager ?? "producing Yarn version unknown")}; parser ${parsed.kind === "classic" ? `@yarnpkg/lockfile ${classicParserVersion}` : `@yarnpkg/parsers ${modernParserVersion}`}${classicWorkspaces ? `; workspace metadata ${classicWorkspaces.toolchain}` : ""}`,
    origin: "source-reconstruction", adapter: "yarn-lock", rootNames: options.roots,
  };
  return publishCollection(snapshot, store, selection, profile, raw, supporting, `https://github.com/${tool.repo}/tree/${tool.revision}`).profile;
}
