import type { Artifact, Impact } from "./types";
import type { CapabilityRow } from "./capabilities";
import type { SnapshotComparison } from "./comparison";
import type { summarizeWork } from "./work";

export interface ImpactRow extends Impact {
  artifact: Artifact;
  explainedPaths: { toolId: string; bucket: string; profileId: string; release: string; platform: string; labels: string[] }[];
}
export type ImpactIndexRow = Omit<ImpactRow, "paths" | "explainedPaths">;
export type ImpactDetail = Pick<ImpactRow, "paths" | "explainedPaths">;
export type WorkSummary = ReturnType<typeof summarizeWork>;
export type InvestigationSummary = WorkSummary["investigations"][number];
export interface Reports {
  impacts: ImpactIndexRow[];
  projects: ImpactIndexRow[];
  queue: Omit<WorkSummary, "investigations">;
  investigations: InvestigationSummary[];
  capabilities: CapabilityRow[];
  comparison: SnapshotComparison | null;
}
export interface ReportReference { file: string; digest: string }
export interface ReportManifest {
  reports: { [K in keyof Reports]: ReportReference };
  details: ReportReference[];
  hasComparison: boolean;
}
export interface ReportEnvelope<T> { schemaVersion: 1; digest: string; data: T }

export const DETAIL_SHARDS = 32;
/** Stable partition shared by build-time output and browser requests. */
export function detailShard(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (Math.imul(hash, 31) + id.charCodeAt(i)) >>> 0;
  return hash % DETAIL_SHARDS;
}
