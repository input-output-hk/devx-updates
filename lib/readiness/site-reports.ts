import { createHash } from "node:crypto";
import { capabilityRows } from "./capabilities";
import { investigationProjects, summarizeWork, workReport } from "./work";
import { readinessAssignments, readinessChanges, readinessImpacts, readinessSnapshot } from "./site";
import { DETAIL_SHARDS, detailShard } from "./report-contract";
import type { ImpactDetail, ImpactIndexRow, ReportEnvelope, ReportManifest, ReportReference } from "./report-contract";
import type { Impact, Snapshot } from "./types";

/** ADR-1/2: derived entirely from retained inputs, with no build-time collection. */
export function buildSiteReports(snapshot: Snapshot, impacts: Impact[], assignments: ReturnType<typeof readinessAssignments>, changes: ReturnType<typeof readinessChanges>) {
  const files = new Map<string, ReportEnvelope<unknown>>();
  const retain = (name: string, data: unknown): ReportReference => {
    // Hash the actual report, including assignments/comparison, not just graph identity.
    const digest = createHash("sha256").update(JSON.stringify(data)).digest("hex");
    const file = `${name}-${digest}.json`;
    files.set(file, { schemaVersion: 1, digest, data });
    return { file, digest };
  };
  const artifacts = new Map(snapshot.artifacts.map((a) => [a.id, a]));
  const nodes = new Map(snapshot.occurrences.map((n) => [n.id, n]));
  const profiles = new Map(snapshot.profiles.map((p) => [p.id, p]));
  const details: Record<string, ImpactDetail>[] = Array.from({ length: DETAIL_SHARDS }, () => ({}));
  const index = (impact: Impact, artifact: ImpactIndexRow["artifact"]): ImpactIndexRow => {
    const { paths, ...counts } = impact;
    const explainedPaths = Object.entries(paths).map(([key, path]) => {
      const [toolId, bucket] = key.split(":");
      const profile = profiles.get(nodes.get(path[0])!.profileId)!;
      return { toolId, bucket, profileId: profile.id, release: profile.release, platform: profile.platform, labels: path.map((id) => {
        const a = artifacts.get(nodes.get(id)!.artifactId)!;
        return `${a.name}@${a.version ?? "unknown"}`;
      }) };
    });
    details[detailShard(impact.artifactId)][impact.artifactId] = { paths, explainedPaths };
    return { ...counts, artifact };
  };
  const impactIndex = impacts.map((impact) => index(impact, artifacts.get(impact.artifactId)!));
  const grouped = investigationProjects(snapshot, impacts);
  const projects = grouped.map((project) => index(project.impact, { id: project.id, name: project.name, ecosystem: project.ecosystem, source: project.source, version: project.versions.join(", "), integrity: null }));
  const { investigations, ...queue } = summarizeWork(workReport(snapshot, assignments, grouped));
  const manifest: ReportManifest = {
    reports: {
      impacts: retain("impacts", impactIndex), projects: retain("projects", projects),
      queue: retain("queue", queue), investigations: retain("investigations", investigations),
      capabilities: retain("capabilities", capabilityRows(snapshot)), comparison: retain("comparison", changes),
    },
    details: details.map((data, i) => retain(`paths-${i}`, data)),
    hasComparison: changes !== null,
  };
  return { manifest, files };
}

let cached: ReturnType<typeof buildSiteReports> | undefined;
export function readinessSiteReports() {
  cached ??= buildSiteReports(readinessSnapshot(), readinessImpacts(), readinessAssignments(), readinessChanges());
  return cached;
}
