import { createHash } from "node:crypto";
import type { Graph } from "../map-types";
import { CAPABILITY_LABELS, type Artifact, type Gap, type Snapshot, type Tool } from "./types";
import { capabilityCondition } from "./capabilities";

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b, "en"));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function digest(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
}

export function object(value: unknown, label = "value"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

export function text(value: unknown, label = "value"): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a nonempty string`);
  return value;
}

export function list(value: unknown, label = "value"): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

export function gap(area: Gap["area"], reason: string, nextAction: string, profileId?: string, code?: string): Gap {
  return { id: `gap:${digest({ area, ...(code ? { code } : { reason }), profileId }).slice(0, 24)}`, area, reason, nextAction, ...(profileId ? { profileId } : {}), ...(code ? { code } : {}) };
}

/** Upgrade identifiers used by the initial committed snapshot without rewriting its evidence. */
export function upgradeOperationalGap(value: Gap): Gap {
  const codes: Record<string, string> = {
    "gap:184fa78848aac8ee996bf356": "native-resolution-missing",
    "gap:08a4850a1570505e3dd508a0": "integration-unreviewed",
    "gap:e0b80a82a98d351ea1a5699b": "capabilities-unreviewed",
  };
  const oldFailure = value.reason.match(/^Collection failed \(([^)]+)\):/);
  const code = value.code ?? codes[value.id] ?? (oldFailure ? `native-collection-failed:${oldFailure[1]}` : undefined);
  return code ? gap(value.area, value.reason, value.nextAction, value.profileId, code) : value;
}

export function artifact(fields: Omit<Artifact, "id">): Artifact {
  return { id: `artifact:${digest(fields)}`, ...fields };
}

export function inventory(catalog: Graph, revision: string, now = new Date().toISOString()): Snapshot {
  const tools: Tool[] = catalog.nodes.map((node) => ({
    id: node.id, name: node.name, repo: node.repo, catalogRepo: node.repo, maintainer: node.team,
    registryHint: node.packageRegistry ?? null, packageHint: node.packageName ?? null,
    ecosystems: [], artifact: "unresolved", resolution: "unresolved", integration: "unresolved", capability: "unresolved",
    readiness: "unassessed", manifests: [], evidenceIds: [],
    gaps: [
      gap("artifact", node.repo ? "Release and source identity have not been verified." : "No repository is identified in the catalog.", "Discover published artifacts and pin the release source."),
      gap("resolution", "No native dependency resolution has been imported.", "Collect a native resolution for a declared release/profile.", undefined, "native-resolution-missing"),
      gap("integration", "Runtime, bundled, and service dependencies have not been reviewed.", "Export a discovery review packet.", undefined, "integration-unreviewed"),
      gap("capability", "Chain-facing capabilities have not been reviewed.", "Review production entry points and integration behavior.", undefined, "capabilities-unreviewed"),
    ],
  }));
  const snapshot: Snapshot = { schemaVersion: 1, catalogDigest: digest(catalog), catalogRevision: revision, semanticDigest: "", generatedAt: now, tools, profiles: [], artifacts: [], occurrences: [], edges: [], evidence: [], decisions: [] };
  return finalize(snapshot);
}

export function finalize(snapshot: Snapshot): Snapshot {
  snapshot.reviewSubmissions?.sort((a, b) => a.submissionEvidenceId.localeCompare(b.submissionEvidenceId, "en"));
  snapshot.collections?.sort((a, b) => `${a.toolId}:${a.key}`.localeCompare(`${b.toolId}:${b.key}`, "en"));
  for (const values of [snapshot.tools, snapshot.profiles, snapshot.artifacts, snapshot.occurrences, snapshot.edges, snapshot.evidence, snapshot.decisions, snapshot.capabilities ?? [], snapshot.capabilityDecisions ?? []]) {
    values.sort((a, b) => a.id.localeCompare(b.id, "en"));
  }
  for (const tool of snapshot.tools) {
    tool.gaps.sort((a, b) => a.id.localeCompare(b.id, "en"));
    tool.evidenceIds = [...new Set(tool.evidenceIds)].sort();
    tool.manifests.sort();
    tool.ecosystems.sort();
  }
  const { semanticDigest: _digest, generatedAt: _time, tools, ...rest } = snapshot;
  void _digest; void _time;
  snapshot.semanticDigest = digest({ ...rest, tools: tools.map(({ lastAttempt, lastSuccess, ...tool }) => {
    void lastAttempt; void lastSuccess; return tool;
  }) });
  validate(snapshot);
  return snapshot;
}

export function validate(snapshot: Snapshot): void {
  if (snapshot.schemaVersion !== 1) throw new Error("Unsupported snapshot schema");
  const indexes = [snapshot.tools, snapshot.profiles, snapshot.artifacts, snapshot.occurrences, snapshot.edges, snapshot.evidence, snapshot.decisions, snapshot.capabilities ?? [], snapshot.capabilityDecisions ?? []].map((values) => {
    const ids = new Set(values.map((v) => text(v.id, "id")));
    if (ids.size !== values.length) throw new Error("Duplicate IDs in snapshot");
    return ids;
  });
  const [tools, profiles, artifacts, occurrences, edges, evidence, , capabilities] = indexes;
  const occurrenceById = new Map(snapshot.occurrences.map((n) => [n.id, n]));
  function refs(ids: string[], index: Set<string>, label: string) {
    for (const id of ids) if (!index.has(id)) throw new Error(`Unknown ${label}: ${id}`);
  }
  for (const t of snapshot.tools) {
    if (t.readiness !== "unassessed") throw new Error("Compatibility assessment is not implemented");
    for (const state of [t.artifact, t.resolution, t.integration, t.capability]) {
      if (!["complete", "partial", "unresolved", "not-applicable"].includes(state)) throw new Error("Invalid coverage state");
    }
    refs(t.evidenceIds, evidence, "evidence");
  }
  for (const p of snapshot.profiles) {
    refs([p.toolId], tools, "tool"); refs(p.roots, occurrences, "root"); refs(p.evidenceIds, evidence, "evidence");
    if (p.nativeEvidenceId) refs([p.nativeEvidenceId], evidence, "native evidence");
    if (p.configurationEvidenceId) refs([p.configurationEvidenceId], evidence, "configuration evidence");
    if (!p.roots.length) throw new Error("A resolved profile must have roots");
    for (const root of p.roots) if (occurrenceById.get(root)?.profileId !== p.id) throw new Error("Root belongs to another profile");
  }
  for (const n of snapshot.occurrences) {
    refs([n.artifactId], artifacts, "artifact"); refs([n.profileId], profiles, "profile"); refs(n.evidenceIds, evidence, "evidence");
  }
  for (const e of snapshot.edges) {
    refs([e.from, e.to], occurrences, "occurrence"); refs(e.evidenceIds, evidence, "evidence");
    if (!e.evidenceIds.length) throw new Error("Edges must carry evidence");
    if (!["verified", "suggested", "disputed", "rejected"].includes(e.verification)) throw new Error("Invalid verification state");
    if (!["runtime", "build", "development"].includes(e.scope)) throw new Error("Invalid dependency scope");
    if (typeof e.optional !== "boolean") throw new Error("Invalid optionality");
    const from = occurrenceById.get(e.from)!;
    const to = occurrenceById.get(e.to)!;
    if (from.profileId !== to.profileId) throw new Error("Edges cannot cross resolution profiles");
  }
  for (const d of snapshot.decisions) { refs([d.edgeId], edges, "edge"); refs(d.evidenceIds, evidence, "evidence"); }
  for (const c of snapshot.capabilities ?? []) {
    refs([c.toolId], tools, "tool"); refs([c.profileId], profiles, "profile"); refs(c.evidenceIds, evidence, "evidence");
    if (snapshot.profiles.find((p) => p.id === c.profileId)?.toolId !== c.toolId) throw new Error("Capability profile belongs to another tool");
    if (!Object.hasOwn(CAPABILITY_LABELS, c.capability)) throw new Error("Unknown capability vocabulary");
    if (!["runtime", "build", "development"].includes(c.scope)) throw new Error("Invalid capability scope");
    if (!["verified", "suggested", "disputed", "rejected"].includes(c.verification)) throw new Error("Invalid capability verification");
    capabilityCondition(c.condition);
    text(c.rationale, "capability rationale");
    if (!c.evidenceIds.length) throw new Error("Capabilities must carry evidence");
  }
  for (const d of snapshot.capabilityDecisions ?? []) {
    refs([d.capabilityId], capabilities, "capability"); refs(d.evidenceIds, evidence, "evidence");
    if (!["verified", "suggested", "disputed", "rejected"].includes(d.verification)) throw new Error("Invalid capability decision");
    text(d.packetId); text(d.rationale); text(d.method);
    if (!d.evidenceIds.length) throw new Error("Capability decisions must carry evidence");
  }
  for (const c of snapshot.collections ?? []) { refs([c.toolId], tools, "tool"); refs([c.profileId], profiles, "profile"); refs([c.evidenceId], evidence, "evidence"); }
  const submissions = new Set<string>();
  for (const review of snapshot.reviewSubmissions ?? []) {
    refs([review.submissionEvidenceId, review.packetEvidenceId], evidence, "review evidence");
    if (submissions.has(review.submissionEvidenceId)) throw new Error("Duplicate review submission");
    submissions.add(review.submissionEvidenceId);
  }
}
