import { existsSync, readFileSync } from "node:fs";
import { posix, resolve } from "node:path";
import { parse, type ParseError } from "jsonc-parser";
import { digest, object } from "./core";
import { execute, pinnedCheckout, retainSource, sourcePath } from "./source";
import { publishCollection, reuseCollection, type CollectOptions, type CollectionSelection } from "./collection";
import { bunWorkspacePaths } from "./bun";
import type { NativeInput, Snapshot } from "./types";
import type { Store } from "./store";
import packageJson from "../../package.json";

export const BUN_CAPTURE_CONTEXT = `committed-bun-lock:v1;jsonc-parser:${packageJson.dependencies["jsonc-parser"]}`;
export function parseBunLock(content: string) {
  const errors: ParseError[] = [];
  const lock = object(parse(content, errors, { allowTrailingComma: true, disallowComments: false }));
  if (errors.length) throw new Error(`Invalid Bun JSONC lock at offset ${errors[0].offset}`);
  bunWorkspacePaths(lock);
  return lock;
}

export async function collectLocks(snapshot: Snapshot, store: Store, options: CollectOptions) {
  const tool = snapshot.tools.find((t) => t.id === options.toolId)!;
  if (options.platform !== "all-lockfile-targets") throw new Error("Bun/Poetry lock capture requires platform all-lockfile-targets");
  const bun = options.adapter === "bun-lock";
  const filename = bun ? "bun.lock" : "poetry.lock";
  const path = options.path ?? filename;
  if (posix.isAbsolute(path) || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === "..") || posix.basename(path) !== filename) throw new Error(`Select a relative ${filename} path`);
  if (!tool.manifests.includes(path)) throw new Error(`No discovered lock ${path}`);
  const helper = resolve("scripts/readiness/poetry-capture.py");
  const python = process.env.READINESS_POETRY_PYTHON ?? resolve(options.stateDir, "toolchains/poetry/bin/python");
  const probe = bun ? undefined : JSON.parse((await execute(python, ["-I", helper, "--probe"], { timeout: 30000, killSignal: "SIGKILL" })).stdout);
  const selection: CollectionSelection = { revision: tool.revision!, adapter: options.adapter, roots: options.roots, path, platform: options.platform, resolverContext: bun ? BUN_CAPTURE_CONTEXT : `poetry-lock:v1:${digest({ probe, helper: readFileSync(helper, "utf8") })}` };
  const cached = reuseCollection(snapshot, store, options, selection);
  if (cached) return cached;
  const checkout = await pinnedCheckout(tool.repo!, tool.revision!, options.stateDir);
  const sourceDirectory = posix.dirname(path);
  const supportPaths = [path];
  let raw: Record<string, unknown>;
  let toolchain: string;
  if (bun) {
    const lock = parseBunLock(readFileSync(sourcePath(checkout, path), "utf8"));
    const manifests: Record<string, unknown> = {};
    for (const workspace of bunWorkspacePaths(lock)) {
      if (posix.isAbsolute(workspace) || workspace.includes("\\") || workspace.split("/").includes("..")) throw new Error("Bun workspace escapes project");
      const manifestPath = posix.join(sourceDirectory, workspace, "package.json");
      manifests[workspace] = JSON.parse(readFileSync(sourcePath(checkout, manifestPath), "utf8"));
      supportPaths.push(manifestPath);
    }
    const configuration = [];
    for (let directory = sourceDirectory; ; directory = posix.dirname(directory)) {
      for (const name of ["bunfig.toml", ".npmrc"]) {
        const configPath = posix.join(directory, name);
        if (existsSync(sourcePath(checkout, configPath))) { supportPaths.push(configPath); configuration.push(configPath); }
      }
      if (directory === ".") break;
    }
    raw = { formatVersion: 1, lock, manifests, sourceDirectory, registryConfiguration: configuration.length > 0 };
    toolchain = `${BUN_CAPTURE_CONTEXT}; ${String(object(manifests[""]).packageManager ?? "producing Bun version unknown")}`;
  } else {
    supportPaths.push(posix.join(sourceDirectory, "pyproject.toml"));
    // Check real paths before invoking the native reader (including symlinks).
    for (const inputPath of supportPaths) sourcePath(checkout, inputPath);
    raw = { ...object(JSON.parse((await execute(python, ["-I", helper, sourcePath(checkout, sourceDirectory), filename], { timeout: 60000, killSignal: "SIGKILL", maxBuffer: 32 * 1024 * 1024 })).stdout)), sourceDirectory };
    toolchain = `Poetry native lock reader ${JSON.stringify(probe)}`;
  }
  const supporting = retainSource(snapshot, store, tool.id, checkout, supportPaths);
  const input: NativeInput = { toolId: tool.id, release: tool.release!, revision: tool.revision!, platform: options.platform, features: ["all-lockfile-targets"], command: `Read committed ${path} and package manifests at ${tool.revision}; no install/build`, toolchain, origin: "source-reconstruction", adapter: options.adapter, rootNames: options.roots };
  return publishCollection(snapshot, store, selection, input, raw, supporting, `https://github.com/${tool.repo}/tree/${tool.revision}`).profile;
}
