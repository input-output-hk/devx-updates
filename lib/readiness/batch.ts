import { existsSync } from "node:fs";
import { join } from "node:path";
import { digest, list, object, text } from "./core";
import { collect } from "./collect";
import { collectionKey, retainedCollectionProfile, type CollectionRequest, type RefreshSelection } from "./collection";
import { readJson, Store, writeJson } from "./store";
import { COLLECT_ADAPTERS, type CollectAdapter, type Snapshot } from "./types";
import { npmRootPaths } from "./npm-roots";
import { gradleConfigurations } from "./gradle-selection";
import { gradleCaptureContext } from "./collect-gradle";
import { YARN_CAPTURE_CONTEXT } from "./collect-yarn";

export interface PinnedRequest extends CollectionRequest { revision: string }
export interface CollectionJob {
  id: string;
  request: PinnedRequest;
  status: "pending" | "running" | "succeeded" | "failed" | "deferred";
  attempts: number;
  attemptedAt?: string;
  succeededAt?: string;
  profileId?: string;
  error?: string;
}
export interface CollectionQueue { schemaVersion: 1; jobs: CollectionJob[] }

/** Reject typos and unpinned requests before any collection or queue writes. */
export function parseCollectionBatch(raw: unknown, snapshot: Snapshot): PinnedRequest[] {
  const batch = object(raw, "collection batch");
  if (batch.schemaVersion !== 1) throw new Error("Unsupported collection batch schema");
  const requests = list(batch.requests).map((raw) => {
    const input = object(raw, "collection request");
    const keys = new Set(["toolId", "revision", "adapter", "roots", "rootPaths", "path", "platform", "pythonVersion", "patterns", "tags", "configurations"]);
    for (const key of Object.keys(input)) if (!keys.has(key)) throw new Error(`Unknown collection option: ${key}`);
    const toolId = text(input.toolId);
    if (!snapshot.tools.some((tool) => tool.id === toolId)) throw new Error(`Unknown tool: ${toolId}`);
    const revision = text(input.revision);
    if (!/^[a-f0-9]{40,64}$/.test(revision)) throw new Error("Batch requests require an immutable source revision");
    if (!(COLLECT_ADAPTERS as readonly unknown[]).includes(input.adapter)) throw new Error("Unsupported collection adapter");
    const strings = (value: unknown) => list(value).map((item) => text(item));
    const roots = strings(input.roots);
    if (!roots.length || new Set(roots).size !== roots.length) throw new Error("Select nonempty, unique package roots");
    const request: PinnedRequest = { toolId, revision, adapter: input.adapter as CollectAdapter, roots, platform: text(input.platform) };
    const configurations = gradleConfigurations(input.configurations, request.adapter);
    if (configurations) request.configurations = configurations;
    if (input.rootPaths !== undefined) request.rootPaths = npmRootPaths(input.rootPaths, request.adapter);
    if (input.path !== undefined) {
      request.path = text(input.path);
      if (request.path.split("/").some((part) => !part || part === "." || part === "..") || request.path.includes("\\")) throw new Error("Select a checkout-relative manifest path");
    }
    if (input.pythonVersion !== undefined) request.pythonVersion = text(input.pythonVersion);
    if (input.patterns !== undefined) request.patterns = strings(input.patterns);
    if (input.tags !== undefined) request.tags = strings(input.tags);
    if (request.adapter === "uv-tree" && !/^3\.\d+(\.\d+)?$/.test(request.pythonVersion ?? "")) throw new Error("uv requests require a Python version");
    if (request.adapter === "go-packages" && !/^\w+\/\w+$/.test(request.platform)) throw new Error("Go platform must be GOOS/GOARCH");
    if (request.adapter !== "uv-tree" && request.pythonVersion !== undefined) throw new Error("Python version only applies to uv requests");
    if (request.adapter !== "go-packages" && (request.patterns || request.tags)) throw new Error("Package patterns and tags only apply to Go requests");
    return request;
  });
  if (!requests.length) throw new Error("Collection batch must contain requests");
  return [...new Map(requests.map((request) => [digest(request), request])).values()];
}

function retainedResult(job: CollectionJob, snapshot: Snapshot, store: Store): boolean {
  const profile = retainedCollectionProfile(snapshot, store, job.profileId, job.request.adapter);
  if (job.request.adapter === "gradle-resolution" || job.request.adapter === "yarn-lock") {
    const { toolId, ...request } = job.request;
    const gradle = request.adapter === "gradle-resolution";
    const key = collectionKey({ ...request, path: request.path ?? (gradle ? "build.gradle" : "yarn.lock"), resolverContext: gradle ? gradleCaptureContext().fingerprint : YARN_CAPTURE_CONTEXT });
    if (!snapshot.collections?.some((c) => c.toolId === toolId && c.profileId === job.profileId && c.key === key)) return false;
  }
  return !!profile && profile.toolId === job.request.toolId && profile.revision === job.request.revision;
}

/** The CLI holds the store's writer lock across both queue and snapshot updates. */
export async function collectBatch(snapshot: Snapshot, store: Store, raw: unknown, options: RefreshSelection & { stateDir: string; refresh?: boolean }) {
  const requests = parseCollectionBatch(raw, snapshot);
  if (options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit < 1)) throw new Error("--limit must be a positive integer");
  for (const id of options.toolIds ?? []) if (!requests.some((request) => request.toolId === id)) throw new Error(`Tool is not in this batch: ${id}`);
  const path = join(store.directory, "collection-queue.json");
  const queue = existsSync(path) ? readJson(path) as CollectionQueue : { schemaVersion: 1 as const, jobs: [] };
  if (queue.schemaVersion !== 1 || !Array.isArray(queue.jobs)) throw new Error("Unsupported collection queue schema");
  const seen = new Set<string>();
  for (const job of queue.jobs) {
    if (job.id !== `collection:${digest(job.request)}` || seen.has(job.id) || !["pending", "running", "succeeded", "failed", "deferred"].includes(job.status) || !Number.isSafeInteger(job.attempts) || job.attempts < 0) throw new Error("Invalid collection queue job");
    seen.add(job.id);
  }
  const jobs = requests.map((request) => {
    const id = `collection:${digest(request)}`;
    let job = queue.jobs.find((job) => job.id === id);
    if (!job) { job = { id, request, status: "pending", attempts: 0 }; queue.jobs.push(job); }
    return job;
  });
  const selected = jobs.filter((job) => !options.toolIds || options.toolIds.includes(job.request.toolId));
  for (const job of selected) {
    if (snapshot.tools.find((tool) => tool.id === job.request.toolId)!.revision !== job.request.revision) {
      job.status = "deferred";
      job.error = "Discovered revision differs from this pinned request; verify the current source and submit a new pinned request.";
    } else if (job.status === "running" || job.status === "deferred" || (job.status === "succeeded" && (options.refresh || !retainedResult(job, snapshot, store)))) {
      job.status = "pending";
      delete job.error;
    }
  }
  writeJson(path, queue);
  // Unattempted work advances even when an earlier request keeps failing.
  const pending = selected.filter((job) => job.status === "pending" || job.status === "failed").sort((a, b) => Number(a.status === "failed") - Number(b.status === "failed")).slice(0, options.limit);
  for (const [index, job] of pending.entries()) {
    job.status = "running"; job.attempts++; job.attemptedAt = new Date().toISOString(); delete job.error;
    writeJson(path, queue);
    console.error(`Collection batch ${index + 1}/${pending.length}: ${job.request.toolId} (${job.request.adapter})`);
    try {
      const profile = await collect(snapshot, store, { ...job.request, stateDir: options.stateDir, refresh: options.refresh });
      job.status = "succeeded"; job.profileId = profile.id; job.succeededAt = new Date().toISOString();
    } catch (error) {
      job.status = "failed"; job.error = String(error).slice(0, 1500);
      console.error(`Collection batch failed for ${job.request.toolId}: ${job.error}`);
    }
    writeJson(path, queue);
  }
  return {
    requested: selected.length, attempted: pending.length,
    failed: selected.filter((job) => job.status === "failed").length,
    succeeded: selected.filter((job) => job.status === "succeeded").length,
    pending: selected.filter((job) => job.status === "pending").length,
    deferred: selected.filter((job) => job.status === "deferred").length,
  };
}
