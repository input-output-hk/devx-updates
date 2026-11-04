import { canonical } from "./core";
import { calculateImpact, projectIdentity } from "./impact";
import { EXPOSURES, exposureBucket, followExposure, ROOT_EXPOSURE, type Exposure } from "./exposure";
import type { Edge, Impact, Profile, Snapshot, Tool } from "./types";

function recordsChanged<T extends { id: string }>(left: T[], right: T[]) {
  const old = new Map(left.map((value) => [value.id, canonical(value)]));
  const next = new Set(right.map((value) => value.id));
  return {
    added: right.filter((value) => !old.has(value.id)).map((value) => value.id).sort(),
    removed: left.filter((value) => !next.has(value.id)).map((value) => value.id).sort(),
    changed: right.filter((value) => old.has(value.id) && old.get(value.id) !== canonical(value)).map((value) => value.id).sort(),
  };
}
function countChanges(change: ReturnType<typeof recordsChanged>) { return change.added.length + change.removed.length + change.changed.length; }

function context(snapshot: Snapshot) {
  const nodes = new Map(snapshot.occurrences.map((node) => [node.id, node]));
  const artifacts = new Map(snapshot.artifacts.map((artifact) => [artifact.id, artifact]));
  const tools = new Map(snapshot.tools.map((tool) => [tool.id, tool]));
  const profiles = new Map(snapshot.profiles.map((profile) => [profile.id, profile]));
  const edges = new Map<string, Edge[]>();
  const toolEdges = new Map<string, Edge[]>();
  for (const edge of snapshot.edges) {
    const key = canonical([edge.from, edge.to]);
    edges.set(key, [...(edges.get(key) ?? []), edge]);
    const toolId = profiles.get(nodes.get(edge.from)!.profileId)!.toolId;
    const records = toolEdges.get(toolId) ?? [];
    records.push(edge); toolEdges.set(toolId, records);
  }
  for (const values of edges.values()) values.sort((a, b) => a.id.localeCompare(b.id));
  return { snapshot, nodes, artifacts, tools, profiles, edges, toolEdges };
}
type Context = ReturnType<typeof context>;

function relationshipChanges(before: Context, after: Context) {
  const old = new Map(before.snapshot.edges.map((edge) => [edge.id, edge]));
  const next = new Map(after.snapshot.edges.map((edge) => [edge.id, edge]));
  function describe(ctx: Context, edge: Edge | undefined) {
    if (!edge) return null;
    const from = ctx.nodes.get(edge.from)!; const to = ctx.nodes.get(edge.to)!;
    const profile = ctx.profiles.get(from.profileId)!;
    const label = (id: string) => { const artifact = ctx.artifacts.get(id)!; return `${artifact.name}@${artifact.version ?? "unknown"}`; };
    return { edge, toolId: profile.toolId, toolName: ctx.tools.get(profile.toolId)!.name, profileId: profile.id,
      from: { label: label(from.artifactId), locator: from.locator, artifactId: from.artifactId },
      to: { label: label(to.artifactId), locator: to.locator, artifactId: to.artifactId },
    };
  }
  return [...new Set([...old.keys(), ...next.keys()])].sort().flatMap((id) => {
    const previous = old.get(id); const current = next.get(id);
    return canonical(previous) === canonical(current) ? [] : [{ id, change: !previous ? "added" as const : !current ? "removed" as const : "changed" as const, before: describe(before, previous), after: describe(after, current) }];
  });
}

/** Recover an actual edge sequence for a counted path, including parallel scoped edges. */
function explain(ctx: Context, impact: Impact, toolId: string, bucket: Exposure) {
  const path = Object.entries(impact.paths).sort(([a], [b]) => a.localeCompare(b)).find(([key]) => key.startsWith(`${toolId}:${bucket}:`))?.[1];
  if (!path) throw new Error(`Missing ${bucket} impact path for ${toolId}/${impact.artifactId}`);
  let states = [{ ...ROOT_EXPOSURE, edges: [] as Edge[] }];
  for (let index = 1; index < path.length; index++) {
    const next = new Map<string, typeof states[number]>();
    for (const state of states) for (const edge of ctx.edges.get(canonical([path[index - 1], path[index]])) ?? []) {
      if (edge.verification === "rejected") continue;
      const exposure = followExposure(state, edge);
      const key = canonical(exposure);
      if (!next.has(key)) next.set(key, { ...exposure, edges: [...state.edges, edge] });
    }
    states = [...next.values()];
  }
  const witness = states.find((state) => exposureBucket(state) === bucket);
  if (!witness) throw new Error(`Impact path has no supporting ${bucket} edge sequence`);
  const profile = ctx.profiles.get(ctx.nodes.get(path[0])!.profileId)!;
  return {
    toolId, toolName: ctx.tools.get(toolId)!.name,
    profile: { id: profile.id, release: profile.release, revision: profile.revision, platform: profile.platform },
    nodes: path.map((id) => { const node = ctx.nodes.get(id)!; const artifact = ctx.artifacts.get(node.artifactId)!; return { id, artifactId: artifact.id, label: `${artifact.name}@${artifact.version ?? "unknown"}` }; }),
    edges: witness.edges,
  };
}

function reachChanges(before: Context, after: Context, left: Impact[], right: Impact[]) {
  const previous = new Map(left.map((impact) => [impact.artifactId, impact]));
  const current = new Map(right.map((impact) => [impact.artifactId, impact]));
  return [...new Set([...previous.keys(), ...current.keys()])].sort().flatMap((id) => {
    const old = previous.get(id); const next = current.get(id);
    const buckets = EXPOSURES.flatMap((bucket) => {
      const oldIds = new Set(old?.[bucket] ?? []); const nextIds = new Set(next?.[bucket] ?? []);
      const added = [...nextIds].filter((id) => !oldIds.has(id)).sort();
      const removed = [...oldIds].filter((id) => !nextIds.has(id)).sort();
      return added.length || removed.length ? [{ bucket, before: oldIds.size, after: nextIds.size,
        added: added.map((toolId) => explain(after, next!, toolId, bucket)),
        removed: removed.map((toolId) => explain(before, old!, toolId, bucket)),
      }] : [];
    });
    return buckets.length ? [{ artifact: after.artifacts.get(id) ?? before.artifacts.get(id)!, buckets }] : [];
  }).sort((a, b) => a.artifact.name.localeCompare(b.artifact.name) || a.artifact.id.localeCompare(b.artifact.id));
}

function versionInventory(ctx: Context, impacts: Impact[]) {
  const included = new Set(impacts.map((impact) => impact.artifactId));
  for (const profile of ctx.profiles.values()) for (const root of profile.roots) included.add(ctx.nodes.get(root)!.artifactId);
  const groups = new Map<string, ReturnType<typeof projectIdentity> & { versions: string[]; artifactIds: string[] }>();
  for (const id of included) {
    const artifact = ctx.artifacts.get(id)!; const identity = projectIdentity(artifact);
    const group = groups.get(identity.id) ?? { ...identity, versions: [], artifactIds: [] };
    group.versions.push(artifact.version ?? "unknown"); group.artifactIds.push(id); groups.set(identity.id, group);
  }
  for (const group of groups.values()) { group.versions = [...new Set(group.versions)].sort(); group.artifactIds.sort(); }
  return groups;
}

function profileSummary(profile: Profile, ctx: Context) {
  return { id: profile.id, release: profile.release, revision: profile.revision, platform: profile.platform, features: [...profile.features].sort(), command: profile.command, toolchain: profile.toolchain, origin: profile.origin, coverage: profile.coverage, roots: [...profile.roots].sort(), inputDigest: profile.inputDigest, evidenceIds: [...profile.evidenceIds].sort(),
    rootPackages: [...new Set(profile.roots.map((id) => { const artifact = ctx.artifacts.get(ctx.nodes.get(id)!.artifactId)!; return `${artifact.ecosystem}:${artifact.name}`; }))].sort(),
  };
}
type ProfileSummary = ReturnType<typeof profileSummary>;
function configuration(profile: ProfileSummary) { return canonical({ platform: profile.platform, features: profile.features, roots: profile.rootPackages, origin: profile.origin }); }
const coverageFields = ["artifact", "resolution", "integration", "capability", "release", "revision", "discoveryError", "gaps"] as const;
function coverageValue(tool: Tool, key: typeof coverageFields[number]) {
  return key === "gaps" ? tool.gaps.map(({ area, reason, nextAction, profileId }) => canonical({ area, reason, nextAction, profileId })).sort() : tool[key] ?? null;
}

function toolChanges(before: Context, after: Context) {
  return [...new Set([...before.tools.keys(), ...after.tools.keys()])].sort().flatMap((toolId) => {
    const previous = before.tools.get(toolId); const current = after.tools.get(toolId);
    const fields = coverageFields.filter((key) => canonical(previous ? coverageValue(previous, key) : null) !== canonical(current ? coverageValue(current, key) : null))
      .map((field) => ({ field, before: previous ? coverageValue(previous, field) : null, after: current ? coverageValue(current, field) : null }));
    const left = [...before.profiles.values()].filter((p) => p.toolId === toolId).map((p) => profileSummary(p, before));
    const right = [...after.profiles.values()].filter((p) => p.toolId === toolId).map((p) => profileSummary(p, after));
    const profileRecords = recordsChanged(left, right);
    const profiles = { added: right.filter((p) => profileRecords.added.includes(p.id)), removed: left.filter((p) => profileRecords.removed.includes(p.id)), changed: profileRecords.changed.map((id) => ({ before: left.find((p) => p.id === id)!, after: right.find((p) => p.id === id)! })) };
    const edges = recordsChanged(before.toolEdges.get(toolId) ?? [], after.toolEdges.get(toolId) ?? []);
    const capabilities = recordsChanged((before.snapshot.capabilities ?? []).filter((c) => c.toolId === toolId), (after.snapshot.capabilities ?? []).filter((c) => c.toolId === toolId));
    const decisions = (ctx: Context) => {
      const edges = new Set(ctx.toolEdges.get(toolId)?.map((edge) => edge.id));
      const capabilities = new Set(ctx.snapshot.capabilities?.filter((c) => c.toolId === toolId).map((c) => c.id));
      return [...ctx.snapshot.decisions.filter((d) => edges.has(d.edgeId)), ...(ctx.snapshot.capabilityDecisions ?? []).filter((d) => capabilities.has(d.capabilityId))];
    };
    const reviews = recordsChanged(decisions(before), decisions(after));
    if (!fields.length && !countChanges(profileRecords) && !countChanges(edges) && !countChanges(capabilities) && !countChanges(reviews) && !!previous === !!current) return [];
    const observations = new Set<string>();
    if (!previous) observations.add("Catalog tool added");
    if (!current) observations.add("Catalog tool removed");
    if (fields.some((field) => ["release", "revision"].includes(field.field))) observations.add("Discovered release/source changed");
    if (!left.length && right.length) observations.add("First native profile collected");
    for (const added of profiles.added) {
      const sameSource = left.filter((p) => p.release === added.release && p.revision === added.revision);
      const sameConfiguration = sameSource.filter((p) => configuration(p) === configuration(added));
      if (left.length && !sameSource.length) observations.add("Additional release/source profile recorded");
      else if (sameSource.length && !sameConfiguration.length) observations.add("Configuration added or changed");
      else if (sameConfiguration.length) observations.add(sameConfiguration.some((p) => p.command === added.command && p.toolchain === added.toolchain) ? "Captured inputs or adapter changed; the digest does not identify which" : "Collection command/toolchain changed");
    }
    if (profiles.removed.length) observations.add("Retained profile removed");
    if (profiles.changed.length) observations.add("Retained profile record corrected");
    if (countChanges(reviews)) observations.add("Review decisions changed");
    if (countChanges(edges) && !countChanges(profileRecords)) observations.add("Relationship evidence changed within retained profiles");
    if (countChanges(capabilities)) observations.add("Capability evidence changed");
    if (fields.some((field) => !["release", "revision"].includes(field.field))) observations.add("Coverage, gaps or discovery diagnostics changed");
    return [{ toolId, name: (current ?? previous)!.name, presentBefore: !!previous, presentAfter: !!current, fields, observations: [...observations].sort(), profiles, edges, capabilities, decisions: reviews }];
  });
}

export function compareSnapshots(before: Snapshot, after: Snapshot) {
  const left = context(before); const right = context(after);
  const leftImpact = calculateImpact(before); const rightImpact = calculateImpact(after);
  const oldVersions = versionInventory(left, leftImpact); const newVersions = versionInventory(right, rightImpact);
  const versions = [...new Set([...oldVersions.keys(), ...newVersions.keys()])].sort().flatMap((id) => {
    const previous = oldVersions.get(id); const current = newVersions.get(id);
    if (canonical(previous?.versions ?? []) === canonical(current?.versions ?? [])) return [];
    const { name, ecosystem, source } = (current ?? previous)!;
    return [{ id, name, ecosystem, source, before: previous?.versions ?? [], after: current?.versions ?? [], beforeArtifactIds: previous?.artifactIds ?? [], afterArtifactIds: current?.artifactIds ?? [] }];
  }).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const tools = toolChanges(left, right);
  const reach = reachChanges(left, right, leftImpact, rightImpact);
  const relationships = relationshipChanges(left, right);
  const evidenceIds = new Set(reach.flatMap((row) => row.buckets.flatMap((bucket) => [...bucket.added, ...bucket.removed].flatMap((path) => path.edges.flatMap((edge) => edge.evidenceIds)))));
  for (const tool of tools) for (const profile of [...tool.profiles.added, ...tool.profiles.removed, ...tool.profiles.changed.flatMap((change) => [change.before, change.after])]) for (const id of profile.evidenceIds) evidenceIds.add(id);
  for (const relationship of relationships) for (const record of [relationship.before, relationship.after]) for (const id of record?.edge.evidenceIds ?? []) evidenceIds.add(id);
  return {
    schemaVersion: 2 as const, from: before.semanticDigest, to: after.semanticDigest,
    catalog: { before: before.tools.length, after: after.tools.length },
    artifacts: recordsChanged(before.artifacts, after.artifacts), edges: recordsChanged(before.edges, after.edges), profiles: recordsChanged(before.profiles, after.profiles), capabilities: recordsChanged(before.capabilities ?? [], after.capabilities ?? []),
    coverage: tools.filter((tool) => tool.fields.length && tool.presentAfter).map((change) => { const tool = right.tools.get(change.toolId)!; return { toolId: tool.id, artifact: tool.artifact, resolution: tool.resolution, integration: tool.integration, capability: tool.capability, revision: tool.revision, discoveryError: tool.discoveryError }; }),
    tools, versions, reach, relationships,
    evidence: { before: before.evidence.filter((e) => evidenceIds.has(e.id)), after: after.evidence.filter((e) => evidenceIds.has(e.id)) },
  };
}
export type SnapshotComparison = ReturnType<typeof compareSnapshots>;
