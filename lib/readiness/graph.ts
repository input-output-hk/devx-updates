import type { Snapshot } from "./types";

export function toolSubgraph(snapshot: Snapshot, toolIds: string[]) {
  const selected = new Set(toolIds);
  const tools = snapshot.tools.filter((t) => selected.has(t.id));
  if (!tools.length || selected.size !== tools.length) throw new Error("Select known tools");
  const profiles = snapshot.profiles.filter((p) => selected.has(p.toolId));
  const profileIds = new Set(profiles.map((p) => p.id));
  const occurrences = snapshot.occurrences.filter((n) => profileIds.has(n.profileId));
  const nodeIds = new Set(occurrences.map((n) => n.id));
  const artifactIds = new Set(occurrences.map((n) => n.artifactId));
  const edges = snapshot.edges.filter((e) => nodeIds.has(e.from));
  const capabilities = (snapshot.capabilities ?? []).filter((c) => selected.has(c.toolId));
  const capabilityIds = new Set(capabilities.map((c) => c.id));
  const capabilityDecisions = (snapshot.capabilityDecisions ?? []).filter((d) => capabilityIds.has(d.capabilityId));
  const edgeIds = new Set(edges.map((e) => e.id));
  const decisions = snapshot.decisions.filter((d) => edgeIds.has(d.edgeId));
  const evidenceIds = new Set([...tools.flatMap((t) => t.evidenceIds), ...profiles.flatMap((p) => p.evidenceIds), ...occurrences.flatMap((n) => n.evidenceIds), ...edges.flatMap((e) => e.evidenceIds), ...capabilities.flatMap((c) => c.evidenceIds), ...capabilityDecisions.flatMap((d) => d.evidenceIds), ...decisions.flatMap((d) => d.evidenceIds)]);
  return { tools, profiles, occurrences, artifacts: snapshot.artifacts.filter((a) => artifactIds.has(a.id)), edges, ...(capabilities.length ? { capabilities, capabilityDecisions } : {}), ...(decisions.length ? { decisions } : {}), evidence: snapshot.evidence.filter((e) => evidenceIds.has(e.id)) };
}
