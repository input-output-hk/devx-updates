import { capabilityRows } from "./capabilities";
import { digest, list, object, text } from "./core";
import { aggregateProjects, calculateImpact } from "./impact";
import type { Impact, Snapshot } from "./types";

const RANKING = ["verifiedCapabilities", "potentialCapabilities", "verifiedConsumers", "potentialConsumers", "consumerGaps"] as const;

/** Zero downstream reach must not hide a collected root's behavior or uncertainty. */
export function investigationProjects(snapshot: Snapshot, impacts = calculateImpact(snapshot)) {
  const included = new Set(impacts.map((impact) => impact.artifactId));
  const occurrences = new Map(snapshot.occurrences.map((occurrence) => [occurrence.id, occurrence]));
  const roots: Impact[] = [];
  for (const profile of snapshot.profiles) for (const root of profile.roots) {
    const artifactId = occurrences.get(root)!.artifactId;
    if (included.has(artifactId)) continue;
    included.add(artifactId);
    roots.push({ artifactId, required: [], optional: [], build: [], development: [], potential: [], paths: {} });
  }
  return aggregateProjects(snapshot, [...impacts, ...roots]);
}

export interface WorkAssignment {
  taskId: string;
  owner: string | null;
  issueUrl: string | null;
  nextAction: string | null;
}

/** Assignments are authored operations data, never inferred from catalog maintainers. */
export function parseAssignments(raw: unknown): WorkAssignment[] {
  const seen = new Set<string>();
  return list(raw, "work assignments").map((value) => {
    const row = object(value, "work assignment");
    if (Object.keys(row).some((key) => !["taskId", "owner", "issueUrl", "nextAction"].includes(key))) throw new Error("Unknown work assignment field");
    const taskId = text(row.taskId, "taskId");
    if (seen.has(taskId)) throw new Error(`Duplicate work assignment ${taskId}`);
    seen.add(taskId);
    const nullable = (key: string) => row[key] === null ? null : text(row[key], key);
    const owner = nullable("owner"), issueUrl = nullable("issueUrl"), nextAction = nullable("nextAction");
    if (issueUrl) {
      const url = new URL(issueUrl);
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("Issue URL must be public HTTPS without credentials");
    }
    return { taskId, owner, issueUrl, nextAction };
  }).sort((a, b) => a.taskId.localeCompare(b.taskId));
}

export function coverageTaskId(toolId: string, gapId: string) {
  return `coverage:${digest({ toolId, gapId })}`;
}

/** Build queues without promoting consumer capabilities to dependencies or inferring compatibility. */
export function workReport(snapshot: Snapshot, assignments: WorkAssignment[] = [], projects = investigationProjects(snapshot)) {
  const assignmentMap = new Map(parseAssignments(assignments).map((assignment) => [assignment.taskId, assignment]));
  const taskIds = new Set<string>();
  const assign = (taskId: string, nextAction: string) => {
    taskIds.add(taskId);
    const assignment = assignmentMap.get(taskId);
    return { taskId, owner: assignment?.owner ?? null, issueUrl: assignment?.issueUrl ?? null, nextAction: assignment?.nextAction ?? nextAction };
  };
  const coverage = snapshot.tools.flatMap((tool) => tool.gaps.map((gap) => ({
    ...gap, toolId: tool.id, name: tool.name, maintainer: tool.maintainer,
    ...assign(coverageTaskId(tool.id, gap.id), gap.nextAction),
  }))).sort((a, b) => a.taskId.localeCompare(b.taskId));
  const occurrences = new Map(snapshot.occurrences.map((occurrence) => [occurrence.id, occurrence]));
  const profiles = new Map(snapshot.profiles.map((profile) => [profile.id, profile]));
  const tools = new Map(snapshot.tools.map((tool) => [tool.id, tool]));
  const rootProfiles = new Map<string, string[]>();
  for (const profile of snapshot.profiles) for (const root of profile.roots) {
    const id = occurrences.get(root)!.artifactId;
    rootProfiles.set(id, [...new Set([...(rootProfiles.get(id) ?? []), profile.id])]);
  }
  const capabilities = capabilityRows(snapshot).filter((finding) => finding.verification !== "rejected");
  const investigations = projects.map((project) => {
    const ownProfiles = new Set(project.artifactIds.flatMap((id) => rootProfiles.get(id) ?? []));
    const findings = capabilities.filter((finding) => ownProfiles.has(finding.profileId)).map((finding) => ({
      ...finding, attribution: profiles.get(finding.profileId)!.roots.length === 1 ? "component-root" as const : "multiple-roots" as const,
    })).sort((a, b) => a.id.localeCompare(b.id));
    const current = findings.filter((finding) => finding.current && finding.scope === "runtime" && finding.attribution === "component-root");
    const maintainerHints = [...new Set([...ownProfiles].map((id) => profiles.get(id)!.toolId))].sort().map((id) => ({ toolId: id, name: tools.get(id)!.name, maintainer: tools.get(id)!.maintainer }));
    const rootScopes = [...ownProfiles].sort().map((id) => {
      const profile = profiles.get(id)!;
      return { toolId: profile.toolId, profileId: id, release: profile.release, revision: profile.revision, platform: profile.platform, evidenceIds: profile.evidenceIds };
    });
    const paths = Object.entries(project.impact.paths).map(([key, occurrenceIds]) => {
      const profile = profiles.get(occurrences.get(occurrenceIds[0])!.profileId)!;
      return {
        toolId: profile.toolId, profileId: profile.id, release: profile.release, revision: profile.revision,
        platform: profile.platform, exposure: key.split(":")[1],
        artifactId: occurrences.get(occurrenceIds.at(-1)!)!.artifactId, occurrenceIds,
      };
    }).sort((a, b) => `${a.profileId}:${a.exposure}:${a.artifactId}`.localeCompare(`${b.profileId}:${b.exposure}:${b.artifactId}`));
    const consumerIds = [...new Set(paths.map((path) => path.toolId))].sort();
    const uncertainties = [
      ...(!current.length ? ["No current, component-specific runtime capability evidence."] : []),
      ...(current.some((finding) => finding.verification !== "verified") ? ["Capability suggestions or disputes still need evidence review."] : []),
      ...(project.impact.potential.length ? ["Some consumer paths contain suggested or disputed relationships."] : []),
      ...(!maintainerHints.length ? ["No exact collected root links this component to a catalog maintainer."] : []),
      ...rootScopes.flatMap((root) => tools.get(root.toolId)!.gaps.filter((gap) => !gap.profileId || gap.profileId === root.profileId).map((gap) => `${tools.get(root.toolId)!.name}: ${gap.reason}`)),
    ];
    const factors = {
      verifiedCapabilities: new Set(current.filter((finding) => finding.verification === "verified").map((finding) => finding.capability)).size,
      potentialCapabilities: new Set(current.filter((finding) => finding.verification !== "verified").map((finding) => finding.capability)).size,
      verifiedConsumers: new Set([...project.impact.required, ...project.impact.optional, ...project.impact.build]).size,
      potentialConsumers: project.impact.potential.length,
      consumerGaps: consumerIds.reduce((sum, id) => sum + tools.get(id)!.gaps.length, 0),
    };
    return {
      projectId: project.id, name: project.name, ecosystem: project.ecosystem, source: project.source,
      artifactIds: [...project.artifactIds].sort(), versions: project.versions,
      factors, uncertainties: [...new Set(uncertainties)], capabilities: findings, maintainerHints, rootScopes, paths,
      ...assign(project.id, current.length
        ? "Review the recorded capability and consumer paths against the selected hardfork changes; retain profile-specific test tasks."
        : "Inspect this component's production behavior and exact release identity; record capability evidence and unresolved integration boundaries."),
    };
  }).sort((a, b) => {
    for (const factor of RANKING) if (a.factors[factor] !== b.factors[factor]) return b.factors[factor] - a.factors[factor];
    return a.projectId.localeCompare(b.projectId);
  });
  return {
    snapshot: snapshot.semanticDigest, catalogTools: snapshot.tools.length,
    ranking: RANKING,
    coverage, investigations,
    unmatchedAssignments: [...assignmentMap.values()].filter((assignment) => !taskIds.has(assignment.taskId)),
  };
}

export type WorkReport = ReturnType<typeof workReport>;

/** The projects report already owns the full paths; keep one copy in stored/UI data. */
export function summarizeWork(report: WorkReport) {
  return { ...report, investigations: report.investigations.map(({ paths, ...item }) => {
    void paths;
    return { ...item, pathsRef: { file: "projects.json", projectId: item.projectId } };
  }) };
}
