import { digest, list, object, text } from "./core";
import { resolveNative } from "./adapters";
import { addEvidence, mergeResolution, Store } from "./store";
import { COLLECT_ADAPTERS, type CollectAdapter, type NativeInput, type Snapshot } from "./types";
import { npmRootPaths } from "./npm-roots";
import { gradleConfigurations, type GradleConfiguration } from "./gradle-selection";
import { gradleHasFailures } from "./gradle";

export interface CollectionRequest {
  toolId: string;
  adapter: CollectAdapter;
  roots: string[];
  rootPaths?: string[];
  path?: string;
  platform: string;
  pythonVersion?: string;
  patterns?: string[];
  tags?: string[];
  configurations?: GradleConfiguration[];
}

export interface CollectOptions extends CollectionRequest {
  stateDir: string;
  refresh?: boolean;
}

export interface RefreshSelection {
  toolIds?: string[];
  limit?: number;
}

/** Historical collection evidence can register the same request more than once. */
export function collectionRequests(snapshot: Snapshot, store: Store, selection: RefreshSelection = {}): CollectionRequest[] {
  if (selection.limit !== undefined && (!Number.isSafeInteger(selection.limit) || selection.limit < 1)) throw new Error("--limit must be a positive integer");
  const selected = selection.toolIds && new Set(selection.toolIds);
  for (const id of selected ?? []) {
    if (!snapshot.tools.some((tool) => tool.id === id)) throw new Error(`Unknown tool: ${id}`);
    if (!snapshot.collections?.some((collection) => collection.toolId === id)) throw new Error(`No registered native collection for ${id}; use collect first`);
  }
  const requests = new Map<string, CollectionRequest>();
  for (const collection of snapshot.collections ?? []) {
    if (selected && !selected.has(collection.toolId)) continue;
    const evidence = snapshot.evidence.find((e) => e.id === collection.evidenceId)!;
    const input = object(object(store.readEvidence(evidence)).selection);
    if (!(COLLECT_ADAPTERS as readonly unknown[]).includes(input.adapter)) continue;
    const request: CollectionRequest = {
      toolId: collection.toolId, adapter: input.adapter as CollectAdapter,
      roots: list(input.roots).map((root) => text(root)),
      ...(input.rootPaths !== undefined ? { rootPaths: npmRootPaths(input.rootPaths, String(input.adapter)) } : {}),
      path: typeof input.path === "string" && input.path ? input.path : undefined,
      platform: text(input.platform),
      ...(typeof input.pythonVersion === "string" ? { pythonVersion: input.pythonVersion } : {}),
      ...(input.patterns ? { patterns: list(input.patterns).map((p) => text(p)) } : {}),
      ...(input.tags ? { tags: list(input.tags).map((p) => text(p)) } : {}),
      ...(input.adapter === "gradle-resolution" ? { configurations: gradleConfigurations(input.configurations, input.adapter) } : {}),
    };
    requests.set(digest(request), request);
  }
  return [...requests.entries()].sort(([aKey, a], [bKey, b]) => a.toolId.localeCompare(b.toolId, "en") || aKey.localeCompare(bKey, "en")).map(([, request]) => request).slice(0, selection.limit);
}

export interface CollectionSelection extends Omit<CollectionRequest, "toolId" | "path"> {
  revision: string;
  path: string;
  resolverContext: string;
}

export const collectionKey = (selection: CollectionSelection) => digest({ ...selection, collectorVersion: ["pnpm-lock", "yarn-lock", "go-packages", "uv-tree"].includes(selection.adapter) ? 3 : 2 });

/** Both native cache hits and completed batch jobs require replayable input bytes. */
export function retainedCollectionProfile(snapshot: Snapshot, store: Store, profileId: string | undefined, adapter: CollectAdapter) {
  const profile = snapshot.profiles.find((profile) => profile.id === profileId);
  if (!profile || (adapter === "go-packages" && profile.coverage !== "complete")) return undefined;
  for (const id of profile.evidenceIds) {
    const evidence = snapshot.evidence.find((evidence) => evidence.id === id);
    if (!evidence) return undefined;
    try { store.readEvidence(evidence); } catch { return undefined; }
  }
  if (adapter === "gradle-resolution") {
    const native = snapshot.evidence.find((evidence) => evidence.id === profile.nativeEvidenceId);
    try { if (!native || gradleHasFailures(store.readEvidence(native))) return undefined; } catch { return undefined; }
  }
  return profile;
}

export function reuseCollection(snapshot: Snapshot, store: Store, options: CollectOptions, selection: CollectionSelection) {
  if (options.refresh) return undefined;
  const key = collectionKey(selection);
  const request = snapshot.collections?.find((c) => c.key === key && c.toolId === options.toolId);
  const profile = retainedCollectionProfile(snapshot, store, request?.profileId, selection.adapter);
  if (!profile) return undefined;
  console.log(`Reused ${options.toolId} native collection ${key.slice(0, 12)}`);
  return profile;
}

export function publishCollection(snapshot: Snapshot, store: Store, selection: CollectionSelection, profile: NativeInput, raw: unknown, supporting: string[], sourceUrl: string) {
  const tool = snapshot.tools.find((t) => t.id === profile.toolId)!;
  const native = store.evidence(raw, `${profile.adapter} for ${tool.id} ${profile.release}`, sourceUrl);
  const configuration = store.evidence(profile, "Native collection profile and command", sourceUrl);
  const result = resolveNative(raw, profile, { native: native.id, configuration: configuration.id, supporting });
  addEvidence(snapshot, native); addEvidence(snapshot, configuration);
  mergeResolution(snapshot, result);
  const request = store.evidence({ selection, profileId: result.profile.id }, `Collection request for ${tool.id}`);
  addEvidence(snapshot, request); tool.evidenceIds.push(request.id);
  const key = collectionKey(selection);
  snapshot.collections = (snapshot.collections ?? []).filter((c) => c.toolId !== tool.id || (c.key !== key && c.profileId !== result.profile.id));
  snapshot.collections.push({ key, toolId: tool.id, profileId: result.profile.id, evidenceId: request.id });
  tool.gaps = tool.gaps.filter((g) => g.code !== `native-collection-failed:${profile.adapter}`);
  store.save(snapshot);
  console.log(`Collected ${tool.id}: ${result.occurrences.length} occurrences, ${result.edges.length} edges, ${result.profile.coverage} profile`);
  return result;
}
