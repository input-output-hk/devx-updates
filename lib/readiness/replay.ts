import { parseNativeInput, resolveNative } from "./adapters";
import { canonical, digest, finalize, list, object, text } from "./core";
import { toolSubgraph } from "./graph";
import { nativeEvidence } from "./rebuild";
import { importReview, reviewPacket, type ReviewEvidenceStore } from "./review";
import type { Store } from "./store";
import type { Gap, Snapshot, Tool } from "./types";

const TABLES = ["artifacts", "occurrences", "edges", "decisions", "capabilities", "capabilityDecisions"] as const;
type Table = typeof TABLES[number];
type GraphRecords = Required<Pick<Snapshot, Table>>;
type GraphRecord = GraphRecords[Table][number];
interface ReviewContribution {
  gaps: Map<string, Gap>;
  coverage: Partial<Pick<Tool, "integration" | "capability">>;
  evidenceIds: Set<string>;
}

function checkRecords(label: string, expected: { id: string }[], actual: { id: string }[]) {
  const index = new Map(actual.map((record) => [record.id, record]));
  if (index.size !== actual.length || expected.length !== actual.length) throw new Error(`${label}: record count mismatch`);
  for (const record of expected) if (canonical(index.get(record.id)) !== canonical(record)) throw new Error(`${label}: replay mismatch ${record.id}`);
}

/** Reconstruct native and manually admitted graph records without writing or fetching inputs. */
export function replaySnapshot(snapshot: Snapshot, store: Store, progress: (message: string) => void = () => {}) {
  const evidenceById = new Map(snapshot.evidence.map((evidence) => [evidence.id, evidence]));
  const read = (id: string) => {
    const evidence = evidenceById.get(id);
    if (!evidence) throw new Error(`Missing replay evidence ${id}`);
    return store.readEvidence(evidence);
  };
  // Import uses this narrow store to check existing bytes, never to repair missing evidence.
  const retained: ReviewEvidenceStore = {
    readEvidence: (evidence) => store.readEvidence(evidence),
    evidence: (value) => {
      const id = `evidence:${digest(canonical(value))}`;
      read(id);
      return evidenceById.get(id)!;
    },
  };
  const records = Object.fromEntries(TABLES.map((key) => [key, new Map<string, GraphRecord>()])) as Record<Table, Map<string, GraphRecord>>;
  const graph = () => Object.fromEntries(TABLES.map((key) => [key, [...records[key].values()]])) as GraphRecords;
  for (const profile of snapshot.profiles) {
    progress(`Replaying ${profile.toolId} ${profile.id}`);
    const roles = nativeEvidence(profile);
    const result = resolveNative(read(roles.native), parseNativeInput(read(roles.configuration)), roles);
    checkRecords("Native profile", [profile], [result.profile]);
    for (const key of ["artifacts", "occurrences", "edges"] as const) for (const record of result[key]) {
      const previous = records[key].get(record.id);
      if (previous && canonical(previous) !== canonical(record)) throw new Error(`Conflicting native record ${record.id}`);
      records[key].set(record.id, record);
    }
  }

  const nativeGraph = graph();
  const receipts = snapshot.reviewSubmissions ?? [];
  const submissionIds = new Set(receipts.map((receipt) => receipt.submissionEvidenceId));
  // Older imports have no archive receipt. Do not misreport them as replayed.
  for (const evidence of snapshot.evidence) if (evidence.description.startsWith("Review submission ") && !submissionIds.has(evidence.id)) {
    throw new Error(`Review submission ${evidence.id} lacks archived packet context; restore its original packet before replay`);
  }
  const pending = receipts.map((receipt) => {
    const packet = object(read(receipt.packetEvidenceId), "archived review packet");
    const context = object(packet.context, "archived review context");
    const before: Snapshot = finalize({
      schemaVersion: 1, catalogDigest: snapshot.catalogDigest, catalogRevision: snapshot.catalogRevision,
      semanticDigest: "", generatedAt: snapshot.generatedAt,
      ...context, decisions: context.decisions ?? [],
    } as Snapshot);
    const toolIds = list(packet.toolIds).map((id) => text(id));
    if (canonical(reviewPacket(before, toolIds)) !== canonical(packet)) throw new Error("Archived packet context does not match its identity");
    for (const evidence of before.evidence) {
      if (canonical(evidenceById.get(evidence.id)) !== canonical(evidence)) throw new Error(`Archived evidence reference differs: ${evidence.id}`);
      store.readEvidence(evidence);
    }
    return { receipt, packet, before, toolIds, dependencies: before.evidence.filter((evidence) => submissionIds.has(evidence.id)).map((evidence) => evidence.id) };
  });
  const applied = new Set<string>();
  const history = new Map<string, { ancestors: Set<string>; changes: GraphRecords }>();
  const contributions = new Map<string, ReviewContribution>();
  while (pending.length) {
    const index = pending.findIndex((entry) => entry.dependencies.every((id) => applied.has(id)));
    if (index < 0) throw new Error("Review packet history has a cycle or missing predecessor");
    const { receipt, packet, before, toolIds, dependencies } = pending.splice(index, 1)[0];
    progress(`Replaying review ${receipt.submissionEvidenceId}`);
    // Earlier records must themselves be reproducible; the archived context is not a graph oracle.
    // Reconstruct only causal predecessors: a later, independent review can touch
    // tools selected by this packet without being part of its historical input.
    const ancestors = new Set(dependencies.flatMap((id) => [id, ...history.get(id)!.ancestors]));
    const historicalGraph = Object.fromEntries(TABLES.map((key) => {
      const table = new Map<string, GraphRecord>(nativeGraph[key].map((record) => [record.id, record]));
      for (const [id, entry] of history) if (ancestors.has(id)) for (const record of entry.changes[key]) table.set(record.id, record);
      return [key, [...table.values()]];
    })) as GraphRecords;
    const established = toolSubgraph({ ...snapshot, ...historicalGraph, profiles: before.profiles }, toolIds);
    for (const key of TABLES) checkRecords(`Review input ${key}`, before[key] ?? [], established[key] ?? []);
    const submission = object(read(receipt.submissionEvidenceId), "review submission");
    const after = importReview(before, retained, packet, submission.result, submission.decisions ?? undefined);
    const changes = Object.fromEntries(TABLES.map((key) => {
      const previous = new Map<string, GraphRecord>((before[key] ?? []).map((record) => [record.id, record]));
      return [key, (after[key] ?? []).filter((record) => canonical(previous.get(record.id)) !== canonical(record))];
    })) as GraphRecords;
    history.set(receipt.submissionEvidenceId, { ancestors, changes });
    for (const key of TABLES) for (const record of changes[key]) records[key].set(record.id, record);
    for (const tool of after.tools) {
      const previous = before.tools.find((item) => item.id === tool.id)!;
      const contribution = contributions.get(tool.id) ?? { gaps: new Map<string, Gap>(), coverage: {}, evidenceIds: new Set<string>() };
      for (const item of tool.gaps) if (!previous.gaps.some((g) => canonical(g) === canonical(item))) contribution.gaps.set(item.id, item);
      for (const area of ["integration", "capability"] as const) if (tool[area] !== previous[area]) contribution.coverage[area] = tool[area];
      for (const id of tool.evidenceIds) if (!previous.evidenceIds.includes(id)) contribution.evidenceIds.add(id);
      contributions.set(tool.id, contribution);
    }
    applied.add(receipt.submissionEvidenceId);
  }
  for (const key of TABLES) checkRecords(key, [...records[key].values()], snapshot[key] ?? []);
  for (const [toolId, contribution] of contributions) {
    const tool = snapshot.tools.find((item) => item.id === toolId);
    if (!tool) throw new Error(`Missing reviewed tool ${toolId}`);
    for (const item of contribution.gaps.values()) if (!tool.gaps.some((g) => canonical(g) === canonical(item))) throw new Error(`Missing or altered review gap ${toolId}/${item.id}`);
    for (const [area, state] of Object.entries(contribution.coverage)) if (tool[area as "integration" | "capability"] !== state) throw new Error(`Review coverage mismatch ${toolId}/${area}`);
    for (const id of contribution.evidenceIds) if (!tool.evidenceIds.includes(id)) throw new Error(`Missing tool review evidence ${toolId}/${id}`);
  }
  return { profiles: snapshot.profiles.length, reviews: applied.size };
}
