import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { list, object, text } from "./core";
import { execute, normalizeNativePaths } from "./source";
import packageJson from "../../package.json";

export const CLASSIC_WORKSPACE_VERSION = packageJson.dependencies.yarn;
export interface ClassicWorkspace {
  location: string;
  workspaceDependencies: string[];
  mismatchedWorkspaceDependencies: string[];
}

export function classicWorkspaceInfo(raw: unknown): Record<string, ClassicWorkspace> {
  const result: Record<string, ClassicWorkspace> = Object.create(null);
  const locations = new Set<string>();
  for (const [name, value] of Object.entries(object(raw, "Yarn workspace info"))) {
    const row = object(value), location = text(row.location);
    if (location.includes("\\") || location.split("/").some((part) => !part || part === "." || part === "..") || locations.has(location)) throw new Error("Invalid or duplicate Yarn workspace location");
    locations.add(location);
    result[name] = { location, workspaceDependencies: list(row.workspaceDependencies).map((v) => text(v)), mismatchedWorkspaceDependencies: list(row.mismatchedWorkspaceDependencies).map((v) => text(v)) };
  }
  for (const row of Object.values(result)) {
    for (const name of [...row.workspaceDependencies, ...row.mismatchedWorkspaceDependencies]) {
      if (!Object.hasOwn(result, name)) throw new Error(`Unknown Yarn workspace dependency: ${name}`);
    }
  }
  return result;
}

/** Native metadata only; ignore project/user rc files, delegated binaries and scripts. */
export async function captureClassicWorkspaces(directory: string) {
  const cache = mkdtempSync(join(tmpdir(), "readiness-yarn-"));
  const binary = createRequire(import.meta.url).resolve("yarn/bin/yarn.js");
  const args = [binary, "--no-default-rc", "--offline", "--ignore-scripts", "--non-interactive", "--cache-folder", cache, "--json", "workspaces", "info"];
  try {
    const result = await execute(process.execPath, args, {
      cwd: directory, env: { PATH: process.env.PATH ?? "", NODE_ENV: "production", YARN_IGNORE_PATH: "1" },
      timeout: 30000, killSignal: "SIGKILL", maxBuffer: 8 * 1024 * 1024,
    });
    const events = result.stdout.trim().split(/\r?\n/).map((line) => object(JSON.parse(line)));
    const logs = events.filter((event) => event.type === "log");
    if (logs.length !== 1 || events.some((event) => event.type === "error")) throw new Error("Unexpected Yarn workspace info output");
    const info = classicWorkspaceInfo(JSON.parse(text(logs[0].data)));
    return { info, command: "yarn --no-default-rc --offline --ignore-scripts --non-interactive --cache-folder /cache --json workspaces info", toolchain: `Yarn ${CLASSIC_WORKSPACE_VERSION}`, diagnostics: normalizeNativePaths(result, { [cache]: "/cache", [directory]: "/source" }) };
  } finally { rmSync(cache, { recursive: true, force: true }); }
}
