import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { digest, gap, object } from "./core";
import { addEvidence, Store } from "./store";
import type { NativeInput, Snapshot } from "./types";
import { collectionRequests, publishCollection, reuseCollection, type CollectOptions, type RefreshSelection } from "./collection";
import { collectExpanded } from "./collect-expanded";
import { collectLocks } from "./collect-locks";
import { collectYarn } from "./collect-yarn";
import { githubSource, normalizeNativePaths, pinnedCheckout, sourcePath } from "./source";
import { npmRootPaths } from "./npm-roots";
import { collectGradle } from "./collect-gradle";
import { gradleConfigurations } from "./gradle-selection";

const exec = promisify(execFile);

async function cargoContext(directory: string) {
  const versions = await Promise.all([exec("cargo", ["--version"], { cwd: directory, timeout: 30000, killSignal: "SIGKILL" }), exec("rustc", ["--version"], { cwd: directory, timeout: 30000, killSignal: "SIGKILL" })]);
  const toolchain = versions.map((v) => v.stdout.trim()).join("; ");
  const configPaths = [join(process.env.CARGO_HOME ?? join(homedir(), ".cargo"), "config"), join(process.env.CARGO_HOME ?? join(homedir(), ".cargo"), "config.toml"), join(directory, ".cargo/config"), join(directory, ".cargo/config.toml")];
  const configuration = configPaths.map((path) => existsSync(path) ? digest(readFileSync(path, "utf8")) : null);
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(CARGO_|RUST)/.test(key) && !/(TOKEN|PASSWORD|SECRET|KEY)/.test(key)));
  return { toolchain, fingerprint: digest({ toolchain, configuration, environment, host: `${process.platform}-${process.arch}` }) };
}

export async function collect(snapshot: Snapshot, store: Store, options: CollectOptions) {
  const tool = snapshot.tools.find((t) => t.id === options.toolId);
  if (!tool?.revision || !tool.repo || !tool.release) throw new Error("Discover this tool's immutable source first");
  const rootPaths = npmRootPaths(options.rootPaths, options.adapter);
  gradleConfigurations(options.configurations, options.adapter);
  try {
    if (options.adapter === "gradle-resolution") return await collectGradle(snapshot, store, options);
    if (["bun-lock", "poetry-lock"].includes(options.adapter)) return await collectLocks(snapshot, store, options);
    if (options.adapter === "yarn-lock") return await collectYarn(snapshot, store, options);
    if (["pnpm-lock", "go-packages", "uv-tree"].includes(options.adapter)) return await collectExpanded(snapshot, store, options);
    const selection = { revision: tool.revision, adapter: options.adapter, roots: options.roots, ...(rootPaths ? { rootPaths } : {}), path: options.path ?? "", platform: options.platform, resolverContext: options.adapter === "npm-lock" ? "committed-lockfile:npm-workspaces-v1" : "committed-lockfile" };
    const directory = options.adapter === "cargo-metadata" ? await pinnedCheckout(tool.repo, tool.revision, options.stateDir) : resolve(options.stateDir, "sources", tool.revision);
    if (options.adapter === "cargo-metadata") selection.resolverContext = (await cargoContext(directory)).fingerprint;
    const cached = reuseCollection(snapshot, store, options, selection);
    if (cached) return cached;
    let raw: unknown; let command: string; let toolchain: string;
    const supporting: string[] = [];
    const sourceUrl = `https://github.com/${tool.repo}/tree/${tool.revision}`;
    if (options.adapter === "npm-lock") {
      const path = options.path ?? "package-lock.json";
      if (!tool.manifests.includes(path)) throw new Error(`No discovered manifest ${path}`);
      const lock = JSON.parse(await githubSource(tool.repo, tool.revision, path));
      raw = { formatVersion: 1, lock };
      command = `Read committed ${path} at ${tool.revision}`;
      toolchain = `npm lockfile format ${object(lock).lockfileVersion}; producing npm version unknown`;
    } else {
      const context = await cargoContext(directory);
      toolchain = context.toolchain; selection.resolverContext = context.fingerprint;
      const args = ["metadata", "--locked", "--format-version", "1", "--filter-platform", options.platform];
      if (options.path) {
        if (!tool.manifests.includes(options.path) || !options.path.endsWith("Cargo.toml")) throw new Error("Select a discovered Cargo.toml");
        sourcePath(directory, options.path);
        args.push("--manifest-path", options.path);
      }
      const { stdout } = await exec("cargo", args, { cwd: directory, timeout: 300000, killSignal: "SIGKILL", maxBuffer: 64 * 1024 * 1024 });
      raw = JSON.parse(stdout); command = `cargo ${args.join(" ")}`;
      // Retain the actual lock and workspace manifest alongside metadata for replay.
      for (const filename of ["Cargo.lock", options.path ?? "Cargo.toml"]) {
        const fullPath = join(directory, filename);
        if (existsSync(fullPath)) {
          const evidence = store.evidence({ path: filename, revision: tool.revision, content: readFileSync(fullPath, "utf8") }, `Native input ${tool.id}/${filename}`, `${sourceUrl}/${filename}`);
          addEvidence(snapshot, evidence); supporting.push(evidence.id);
        }
      }
    }
    const profile: NativeInput = { toolId: tool.id, release: tool.release, revision: tool.revision, platform: options.platform, features: ["default"], command, toolchain, origin: "source-reconstruction", adapter: options.adapter, rootNames: options.roots, ...(rootPaths ? { rootPaths } : {}) };
    return publishCollection(snapshot, store, selection, profile, raw, supporting, sourceUrl).profile;
  } catch (error) {
    const failure = error as Error & { cmd?: string; code?: string | number; signal?: string; stdout?: string; stderr?: string; invocationEvidenceId?: string };
    const evidence = store.evidence(normalizeNativePaths({
      toolId: tool.id, revision: tool.revision, adapter: options.adapter,
      command: failure.cmd ?? null, exitCode: failure.code ?? null, signal: failure.signal ?? null,
      message: String(error), stdout: failure.stdout ?? "", stderr: failure.stderr ?? "",
      ...(failure.invocationEvidenceId ? { invocationEvidenceId: failure.invocationEvidenceId } : {}),
    }, { [resolve(options.stateDir, "sources", tool.revision)]: "/source" }), `Failed native collection for ${tool.id}`);
    addEvidence(snapshot, evidence); tool.evidenceIds.push(evidence.id);
    const reason = `Collection failed (${options.adapter}): ${String(error).slice(0, 1500)}`;
    tool.gaps = tool.gaps.filter((g) => g.code !== `native-collection-failed:${options.adapter}`);
    tool.gaps.push(gap("resolution", reason, "Inspect the native resolver error and retry this pinned profile.", undefined, `native-collection-failed:${options.adapter}`));
    store.save(snapshot); throw error;
  }
}

export async function refreshNative(snapshot: Snapshot, store: Store, stateDir: string, refresh = false, selection: RefreshSelection = {}) {
  const requests = collectionRequests(snapshot, store, selection);
  let failed = 0;
  for (const [index, request] of requests.entries()) {
    console.error(`Native refresh ${index + 1}/${requests.length}: ${request.toolId} (${request.adapter}, ${request.platform})`);
    try { await collect(snapshot, store, { ...request, stateDir, refresh }); }
    catch (error) { failed++; console.error(`Native refresh failed for ${request.toolId}: ${String(error).slice(0, 500)}`); }
  }
  return { profilesRequested: requests.length, failed };
}
