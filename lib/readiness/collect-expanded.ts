import { dirname, posix } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { load, JSON_SCHEMA } from "js-yaml";
import { parsePnpmLock, pnpmPatchPaths } from "./pnpm";
import { digest, object } from "./core";
import { parseJsonStream } from "./go";
import { pinnedCheckout, sourcePath, retainSource, execute, normalizeNativePaths } from "./source";
import { addEvidence } from "./store";
import { publishCollection, reuseCollection, type CollectOptions, type CollectionSelection } from "./collection";
import type { Snapshot, NativeInput } from "./types";
import type { Store } from "./store";

export async function collectExpanded(snapshot: Snapshot, store: Store, options: CollectOptions) {
  const tool = snapshot.tools.find((t) => t.id === options.toolId)!;
  const defaults = { "pnpm-lock": "pnpm-lock.yaml", "go-packages": "go.mod", "uv-tree": "pyproject.toml" };
  if (!(options.adapter in defaults)) throw new Error("Unknown extended collector");
  const path = options.path ?? defaults[options.adapter as keyof typeof defaults];
  if (!tool.manifests.includes(path)) throw new Error(`No discovered manifest ${path}`);
  if (options.adapter === "go-packages" && !/^\w+\/\w+$/.test(options.platform)) throw new Error("Go platform must be GOOS/GOARCH, such as linux/amd64");
  if (options.adapter === "uv-tree" && !/^3\.\d+(\.\d+)?$/.test(options.pythonVersion ?? "")) throw new Error("uv collection requires --python-version, such as 3.13");
  const root = await pinnedCheckout(tool.repo!, tool.revision!, options.stateDir);
  const cwd = dirname(sourcePath(root, path));
  const selection: CollectionSelection = { revision: tool.revision!, adapter: options.adapter, roots: options.roots, path, platform: options.platform, resolverContext: "committed-lockfile" };
  let raw: unknown; let command: string; let toolchain: string; let features: string[];
  let supportPaths: string[];
  const diagnostics: { command: string; exitCode: number; stderr: string }[] = [];
  const normalization: Record<string, string> = { [root]: "/source" };
  if (options.adapter === "pnpm-lock") {
    const parsed = parsePnpmLock(readFileSync(sourcePath(root, path), "utf8"));
    if (parsed.environmentLock) selection.resolverContext = "committed-lockfile:pnpm-environment-v1";
    const cached = reuseCollection(snapshot, store, options, selection);
    if (cached) return cached;
    const { lock } = parsed;
    const manifests: Record<string, unknown> = {};
    supportPaths = [path, posix.join(posix.dirname(path), "pnpm-workspace.yaml"), posix.join(posix.dirname(path), ".npmrc")];
    for (const importer of Object.keys(object(lock.importers))) {
      const file = posix.join(posix.dirname(path), importer, "package.json");
      const full = sourcePath(root, file);
      if (existsSync(full)) { manifests[importer] = JSON.parse(readFileSync(full, "utf8")); supportPaths.push(file); }
    }
    const workspacePath = sourcePath(root, posix.join(posix.dirname(path), "pnpm-workspace.yaml"));
    const workspace = existsSync(workspacePath) ? object(load(readFileSync(workspacePath, "utf8"), { schema: JSON_SCHEMA })) : {};
    for (const patchPath of pnpmPatchPaths(lock, workspace)) {
      const relativePath = posix.join(posix.dirname(path), patchPath);
      if (!existsSync(sourcePath(root, relativePath))) throw new Error(`Missing pnpm patch input ${relativePath}`);
      supportPaths.push(relativePath);
    }
    const registries: Record<string, string> = { default: "https://registry.npmjs.org/" };
    const npmrc = sourcePath(root, posix.join(posix.dirname(path), ".npmrc"));
    if (existsSync(npmrc)) for (const line of readFileSync(npmrc, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*(?:(@[^:]+):)?registry\s*=\s*(\S+)\s*$/);
      if (match) {
        if (!/^https?:\/\//.test(match[2]) || match[2].includes("${")) throw new Error("pnpm registry configuration must be an explicit URL");
        registries[match[1] ?? "default"] = match[2];
      }
    }
    raw = { ...parsed, manifests, sourceDirectory: posix.dirname(path), registries };
    command = `Read committed ${path} and importer manifests at ${tool.revision}`;
    toolchain = `pnpm lockfile format ${lock.lockfileVersion}; producing pnpm version recorded in source manifests when available`;
    features = ["all-lockfile-targets", "workspace-peer-contexts"];
  } else if (options.adapter === "go-packages") {
    const [GOOS, GOARCH] = options.platform.split("/");
    const env = { ...process.env, GOOS, GOARCH, CGO_ENABLED: "0", GOWORK: "off", GOFLAGS: "", GOTOOLCHAIN: "local" };
    const run = (args: string[], timeout = 300000) => execute("go", args, { cwd, env, timeout, killSignal: "SIGKILL", maxBuffer: 64 * 1024 * 1024 });
    const effectiveEnvironment = object(JSON.parse((await run(["env", "-json"], 30000)).stdout));
    const environment = Object.fromEntries(["GOOS", "GOARCH", "CGO_ENABLED", "GOWORK", "GOVERSION", "GOFLAGS", "GOTOOLCHAIN", "GOAMD64", "GOARM", "GOARM64", "GO386", "GOMIPS", "GOMIPS64", "GOPPC64", "GORISCV64", "GOWASM", "GOEXPERIMENT"].map((key) => [key, effectiveEnvironment[key]]));
    for (const [key, target] of [["GOROOT", "/go"], ["GOMODCACHE", "/gomodcache"], ["GOCACHE", "/gocache"]]) if (typeof effectiveEnvironment[key] === "string") normalization[String(effectiveEnvironment[key])] = target;
    toolchain = (await run(["version"], 30000)).stdout.trim();
    selection.patterns = options.patterns ?? ["./..."]; selection.tags = options.tags ?? [];
    if (!selection.patterns.length || selection.patterns.some((p) => !p || p.startsWith("-") || p.includes("..") && p !== "./..." && !p.endsWith("/..."))) throw new Error("Invalid Go package pattern");
    selection.resolverContext = digest({ effectiveEnvironment, toolchain });
    const cached = reuseCollection(snapshot, store, options, selection);
    if (cached) return cached;
    const flags = ["list", "-e", "-deps", "-json", "-mod=readonly", ...(selection.tags.length ? [`-tags=${selection.tags.join(",")}`] : [])];
    const runtime = await run([...flags, ...selection.patterns]);
    const test = await run([...flags, "-test", ...selection.patterns]);
    const packages = parseJsonStream(runtime.stdout);
    const tests = parseJsonStream(test.stdout);
    raw = { formatVersion: 1, sourceRoot: root, environment, packages, tests };
    command = `go ${[...flags, ...selection.patterns].join(" ")}; go ${[...flags, "-test", ...selection.patterns].join(" ")}`;
    diagnostics.push({ command: command.split("; ")[0], exitCode: 0, stderr: runtime.stderr }, { command: command.split("; ")[1], exitCode: 0, stderr: test.stderr });
    features = ["cgo:0", "workspace:off", ...selection.patterns.map((p) => `packages:${p}`), ...selection.tags.map((tag) => `tag:${tag}`)];
    supportPaths = [path, posix.join(posix.dirname(path), "go.sum")];
  } else {
    const lockPath = posix.join(posix.dirname(path), "uv.lock");
    if (!existsSync(sourcePath(root, lockPath))) throw new Error("uv collection requires a committed uv.lock; no fresh resolution is substituted");
    toolchain = (await execute("uv", ["--version"], { timeout: 30000, killSignal: "SIGKILL" })).stdout.trim();
    selection.pythonVersion = options.pythonVersion;
    selection.resolverContext = digest({ toolchain, targetPython: options.pythonVersion, platform: options.platform });
    const cached = reuseCollection(snapshot, store, options, selection);
    if (cached) return cached;
    const args = ["tree", "--locked", "--offline", "--format", "json", "--all-groups", "--depth", "255", "--python-version", options.pythonVersion!, "--python-platform", options.platform, "--no-build", "--no-python-downloads", "--no-config"];
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.startsWith("UV_")) delete env[key];
    const output = await execute("uv", args, { cwd, env, timeout: 300000, killSignal: "SIGKILL", maxBuffer: 64 * 1024 * 1024 });
    raw = { ...object(JSON.parse(output.stdout)), collectionSourceRoot: root };
    command = `uv ${args.join(" ")}`;
    diagnostics.push({ command, exitCode: 0, stderr: output.stderr });
    features = [`python:${options.pythonVersion}`, "all-groups", "extras:conditional"];
    supportPaths = [lockPath, ...tool.manifests.filter((file) => file.endsWith("pyproject.toml")), posix.join(posix.dirname(path), "uv.toml")];
  }
  const supporting = retainSource(snapshot, store, tool.id, root, supportPaths);
  if (diagnostics.length) {
    const evidence = store.evidence(normalizeNativePaths({ cwd, diagnostics }, normalization), `Native command diagnostics for ${tool.id}`);
    addEvidence(snapshot, evidence); tool.evidenceIds.push(evidence.id);
  }
  const profile: NativeInput = { toolId: tool.id, release: tool.release!, revision: tool.revision!, platform: options.platform, features, command, toolchain, origin: "source-reconstruction", adapter: options.adapter, rootNames: options.roots };
  const result = publishCollection(snapshot, store, selection, profile, normalizeNativePaths(raw, normalization), supporting, `https://github.com/${tool.repo}/tree/${tool.revision}`);
  if (options.adapter === "go-packages" && result.profile.coverage !== "complete") throw new Error("Go package loading was incomplete; retained the partial graph for inspection and retry.");
  return result.profile;
}
