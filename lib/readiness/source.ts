import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, join } from "node:path";
import { github, repositoryReference } from "./discovery";
import { object } from "./core";
import { addEvidence, Store } from "./store";
import type { Snapshot } from "./types";

export const execute = promisify(execFile);

/** Large files omit inline content; follow the blob selected at the pinned revision. */
export async function githubSource(repo: string, revision: string, path: string, request = github): Promise<string> {
  if (!repositoryReference(repo) || !/^[a-f0-9]{40,64}$/.test(revision) || path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Source capture needs an immutable repository revision and relative file path");
  }
  let blob = object(await request(`repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${revision}`));
  if (blob.type !== "file") throw new Error("Expected a source file");
  if (blob.encoding === "none") {
    const sha = blob.sha;
    if (typeof sha !== "string" || !/^[a-f0-9]{40,64}$/.test(sha)) throw new Error("Missing pinned source blob identity");
    blob = object(await request(`repos/${repo}/git/blobs/${sha}`));
    if (blob.sha !== sha) throw new Error("Source blob identity mismatch");
  }
  if (blob.encoding !== "base64" || typeof blob.content !== "string") throw new Error("Expected base64 source file content");
  return Buffer.from(blob.content, "base64").toString("utf8");
}

/** Replace host-specific paths while preserving native package IDs and import relationships. */
export function normalizeNativePaths(value: unknown, paths: Record<string, string>): unknown {
  const replacements = Object.entries(paths).filter(([from]) => from.length > 1).sort(([a], [b]) => b.length - a.length);
  function visit(item: unknown): unknown {
    if (typeof item === "string") {
      for (const [from, to] of replacements) item = (item as string).split(from).join(to);
      return item;
    }
    if (Array.isArray(item)) return item.map(visit);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).map(([key, child]) => [String(visit(key)), visit(child)]));
    return item;
  }
  return visit(value);
}

export async function pinnedCheckout(repo: string, revision: string, stateDir: string): Promise<string> {
  if (!repositoryReference(repo) || !/^[a-f0-9]{40,64}$/.test(revision)) throw new Error("Collection needs an immutable GitHub source identity");
  const directory = resolve(stateDir, "sources", revision);
  mkdirSync(directory, { recursive: true });
  const git = (args: string[]) => execute("git", args, { cwd: directory, timeout: 120000, killSignal: "SIGKILL", maxBuffer: 16 * 1024 * 1024 });
  let matches = false;
  if (existsSync(join(directory, ".git"))) {
    if ((await git(["status", "--porcelain"])).stdout.trim()) throw new Error("Collection checkout contains local changes; preserve or reconcile them before collecting.");
    try { matches = (await git(["rev-parse", "HEAD"])).stdout.trim() === revision; } catch { matches = false; }
  } else {
    await git(["init"]); await git(["remote", "add", "origin", `https://github.com/${repo}.git`]);
  }
  if (!matches) { await git(["fetch", "--depth=1", "origin", revision]); await git(["checkout", "--detach", revision]); }
  return directory;
}

export function sourcePath(root: string, path: string): string {
  const full = resolve(root, path);
  const relativePath = relative(root, full);
  if (isAbsolute(path) || relativePath === ".." || relativePath.startsWith("../")) throw new Error(`Source path escapes checkout: ${path}`);
  if (existsSync(full)) {
    const actual = relative(realpathSync(root), realpathSync(full));
    if (isAbsolute(actual) || actual === ".." || actual.startsWith("../")) throw new Error(`Source symlink escapes checkout: ${path}`);
  }
  return full;
}

export function retainSource(snapshot: Snapshot, store: Store, toolId: string, root: string, paths: string[]): string[] {
  const tool = snapshot.tools.find((t) => t.id === toolId)!;
  return [...new Set(paths)].filter((path) => existsSync(sourcePath(root, path))).sort().map((path) => {
    const evidence = store.evidence({ path, revision: tool.revision, content: readFileSync(sourcePath(root, path), "utf8") }, `Native input ${tool.id}/${path}`, `https://github.com/${tool.repo}/blob/${tool.revision}/${path}`);
    addEvidence(snapshot, evidence); return evidence.id;
  });
}
