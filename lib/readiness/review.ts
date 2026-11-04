import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { artifact, canonical, digest, finalize, gap, list, object, text } from "./core";
import { addEvidence, readJson, Store, writeJson } from "./store";
import { CAPABILITY_LABELS, type CapabilityFinding, type Edge, type Snapshot, type Verification } from "./types";
import { toolSubgraph } from "./graph";
import { capabilityCondition } from "./capabilities";
import { scanIntegrations } from "./integration-scan";

export interface ReviewQueueEntry { packetId: string; toolIds: string[]; status: string }
export type ReviewEvidenceStore = Pick<Store, "readEvidence" | "evidence">;

export function reconcileReviewQueue(snapshot: Snapshot, entries: ReviewQueueEntry[]): ReviewQueueEntry[] {
  return entries.map((entry) => entry.status === "pending" && entry.packetId !== reviewPacket(snapshot, entry.toolIds).packetId ? { ...entry, status: "needs-revalidation" } : entry);
}

export function reviewPacket(snapshot: Snapshot, toolIds: string[]) {
  const graph = toolSubgraph(snapshot, toolIds);
  const tools = graph.tools.map(({ lastAttempt, lastSuccess, ...tool }) => {
    void lastAttempt; void lastSuccess; return tool;
  });
  if (!tools.length || new Set(toolIds).size !== tools.length) throw new Error("Select unique known tools for review");
  const context = { ...graph, tools };
  const taskBriefVersion = 2;
  const inputDigest = digest({ taskBriefVersion, context });
  return { schemaVersion: 1, taskBriefVersion, packetId: `packet:${inputDigest}`, inputDigest, toolIds: [...toolIds].sort(), context };
}

export function exportPacket(snapshot: Snapshot, store: Store, toolIds: string[], output: string) {
  const packet = reviewPacket(snapshot, toolIds);
  mkdirSync(output, { recursive: true });
  writeJson(join(output, "packet.json"), packet);
  for (const evidence of packet.context.evidence) writeJson(join(output, "evidence", `${evidence.digest}.json`), store.readEvidence(evidence));
  // A derived navigation aid over the packet's own bytes; it admits no findings.
  writeJson(join(output, "integration-scan.json"), scanIntegrations(packet.context, store, toolIds));
  writeJson(join(output, "result-template.json"), { packetId: packet.packetId, inputDigest: packet.inputDigest, completion: "partial", inspectedAreas: [], unreviewedAreas: ["Fill in remaining coverage"], findings: [] });
  writeFileSync(join(output, "TASKS.md"), readFileSync("docs/DEPENDENCY-REVIEW-TASKS.md", "utf8"));
  writeFileSync(join(output, "CAPABILITIES.md"), readFileSync("docs/CAPABILITY-REVIEW-FORMAT.md", "utf8"));
  const indexPath = join(store.directory, "reviews.json");
  const index = reconcileReviewQueue(snapshot, existsSync(indexPath) ? readJson(indexPath) as ReviewQueueEntry[] : []);
  const existing = index.find((r) => r.packetId === packet.packetId);
  if (!existing) index.push({ packetId: packet.packetId, toolIds: packet.toolIds, status: "pending" });
  else if (existing.status === "needs-revalidation") existing.status = "pending";
  writeJson(indexPath, index);
  return packet;
}

export function checkCitation(raw: unknown, snapshot: Snapshot, store: ReviewEvidenceStore, allowed: Set<string>): string {
  const citation = object(raw, "citation");
  const evidenceId = text(citation.evidenceId);
  if (!allowed.has(evidenceId)) throw new Error("Citation is outside the review packet");
  const evidence = snapshot.evidence.find((e) => e.id === evidenceId);
  if (!evidence) throw new Error("Unknown citation evidence");
  let value = store.readEvidence(evidence);
  const pointer = citation.pointer;
  if (typeof pointer !== "string" || (pointer !== "" && !pointer.startsWith("/"))) throw new Error("Citation requires a JSON pointer");
  if (pointer) for (const encoded of pointer.slice(1).split("/")) {
    const key = encoded.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) throw new Error(`Citation pointer does not exist: ${pointer}`);
    value = (value as Record<string, unknown>)[key];
  }
  const quote = text(citation.quote, "citation quote");
  if (!(typeof value === "string" ? value : canonical(value)).includes(quote)) throw new Error("Citation quote does not match retained evidence");
  return evidenceId;
}

/** Validate on a copy: a partially invalid result cannot mutate the canonical graph. */
export function importReview(snapshot: Snapshot, store: ReviewEvidenceStore, rawPacket: unknown, rawResult: unknown, rawDecisions?: unknown): Snapshot {
  const packet = object(rawPacket, "packet");
  const result = object(rawResult, "result");
  const toolIds = list(packet.toolIds).map((id) => text(id));
  const resultId = `evidence:${digest(canonical({ result: rawResult, decisions: rawDecisions ?? null }))}`;
  if (snapshot.evidence.some((e) => e.id === resultId)) return snapshot;
  const current = reviewPacket(snapshot, toolIds);
  if (packet.schemaVersion !== current.schemaVersion || packet.taskBriefVersion !== current.taskBriefVersion || packet.packetId !== current.packetId || packet.inputDigest !== current.inputDigest || result.packetId !== current.packetId || result.inputDigest !== current.inputDigest) throw new Error("Stale or mismatched review packet; export current inputs and revalidate findings");
  if (!["complete", "partial"].includes(result.completion as string)) throw new Error("Result needs a completion state");
  list(result.inspectedAreas).forEach((v) => text(v)); list(result.unreviewedAreas).forEach((v) => text(v));
  const allowed = new Set(current.context.evidence.map((e) => e.id));
  const decisions = rawDecisions ? list(object(rawDecisions).decisions).map((d) => object(d)) : [];
  const findings = list(result.findings).map((f) => object(f));
  const ids = findings.map((f) => text(f.id));
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate finding IDs");
  if (decisions.some((d) => !ids.includes(text(d.findingId)))) throw new Error("Decision refers to an unknown finding");
  if (new Set(decisions.map((d) => d.findingId)).size !== decisions.length) throw new Error("Duplicate decisions");
  const next = structuredClone(snapshot);
  // Archive the checked current context, never an untrusted caller-supplied body.
  const archivedPacket = store.evidence(current, `Review packet ${current.packetId}`);
  addEvidence(next, archivedPacket);
  const submission = store.evidence({ result: rawResult, decisions: rawDecisions ?? null }, `Review submission ${current.packetId}`);
  addEvidence(next, submission);
  (next.reviewSubmissions ??= []).push({ submissionEvidenceId: submission.id, packetEvidenceId: archivedPacket.id });
  const capabilityIds = new Set<string>();
  for (const finding of findings) {
    const id = text(finding.id);
    const toolId = text(finding.toolId);
    if (!toolIds.includes(toolId)) throw new Error("Finding tool is outside packet scope");
    const tool = next.tools.find((t) => t.id === toolId)!;
    const rationale = text(finding.rationale);
    const citations = list(finding.citations).map((c) => checkCitation(c, snapshot, store, allowed));
    const evidenceIds = [...new Set([...citations, submission.id])].sort();
    const decision = decisions.find((d) => d.findingId === id);
    const verification = decision ? text(decision.verification) as Verification : "suggested";
    if (!["verified", "suggested", "disputed", "rejected"].includes(verification)) throw new Error("Invalid review verification");
    if (decision) {
      text(decision.rationale); text(decision.method);
      if (!["source-review", "maintainer-confirmation", "native-check"].includes(decision.method as string)) throw new Error("Record the evidence verification method, not agreement between review passes");
    }
    if (finding.kind === "gap") {
      const area = text(finding.area);
      if (!["artifact", "resolution", "integration", "capability", "discovery"].includes(area)) throw new Error("Invalid gap area");
      const item = gap(area as typeof tool.gaps[number]["area"], rationale, text(finding.nextAction));
      if (!tool.gaps.some((g) => g.id === item.id)) tool.gaps.push(item);
      tool.evidenceIds.push(submission.id);
      continue;
    }
    if (finding.kind === "capability") {
      const profileId = text(finding.profileId);
      const profile = next.profiles.find((p) => p.id === profileId);
      if (profile?.toolId !== toolId) throw new Error("Capability profile is outside the tool scope");
      const capability = text(finding.capability) as CapabilityFinding["capability"];
      if (!Object.hasOwn(CAPABILITY_LABELS, capability)) throw new Error("Unknown capability vocabulary; record an extension request as a gap");
      const scope = text(finding.scope) as CapabilityFinding["scope"];
      if (!["runtime", "build", "development"].includes(scope)) throw new Error("Invalid capability scope");
      const condition = capabilityCondition(finding.condition);
      const hasPinnedSource = list(finding.citations).some((raw) => {
        const citation = object(raw);
        const source = snapshot.evidence.find((e) => e.id === citation.evidenceId)!;
        const captured = store.readEvidence(source);
        if (!captured || typeof captured !== "object" || Array.isArray(captured)) return false;
        const value = captured as Record<string, unknown>;
        return citation.pointer === "/content" && typeof value.content === "string" && value.revision === profile.revision;
      });
      if (!hasPinnedSource) throw new Error("A capability requires a checked /content citation from source at the profile revision");
      const fields = { toolId, profileId, capability, scope, condition };
      const capabilityId = `capability:${digest(fields)}`;
      if (capabilityIds.has(capabilityId)) throw new Error("Duplicate capability scope in submission");
      capabilityIds.add(capabilityId);
      const existing = next.capabilities?.find((c) => c.id === capabilityId);
      if (existing && existing.verification !== verification && (!decision || decision.previousVerification !== existing.verification)) throw new Error("Changing a prior capability decision requires explicit previousVerification");
      if (existing) {
        existing.verification = verification;
        existing.evidenceIds = [...new Set([...existing.evidenceIds, ...evidenceIds])].sort();
        existing.rationale = rationale;
      } else (next.capabilities ??= []).push({ id: capabilityId, ...fields, verification, rationale, evidenceIds });
      (next.capabilityDecisions ??= []).push({ id: `decision:${digest({ packetId: current.packetId, finding: id, submission: submission.id })}`, packetId: current.packetId, capabilityId, verification, rationale: decision ? text(decision.rationale) : rationale, method: decision ? text(decision.method) : "unreviewed-suggestion", evidenceIds });
      tool.capability = "partial";
      const frontier = gap("capability", "Capability findings cover individual profiles and conditions; unexamined behaviors and configurations remain unresolved.", "Review remaining production entry points and configurations; retain historical findings when source changes.", undefined, "capabilities-unreviewed");
      tool.gaps = tool.gaps.filter((g) => g.code !== frontier.code); tool.gaps.push(frontier);
      tool.evidenceIds.push(submission.id);
      continue;
    }
    if (finding.kind !== "relationship") throw new Error("Import supports relationship, capability and gap findings; record other unresolved questions as gaps");
    if (!citations.length) throw new Error("A relationship requires at least one checked citation");
    const from = text(finding.from);
    const consumer = next.occurrences.find((n) => n.id === from);
    const profile = next.profiles.find((p) => p.id === consumer?.profileId);
    if (!consumer || profile?.toolId !== toolId) throw new Error("Consumer occurrence is outside the tool/profile scope");
    const target = object(finding.target);
    const targetArtifact = artifact({ ecosystem: text(target.ecosystem), name: text(target.name), version: target.version === null ? null : text(target.version), source: text(target.source), integrity: target.integrity === null ? null : text(target.integrity) });
    const locator = `review:${targetArtifact.id}`;
    const targetId = `occurrence:${digest({ profileId: profile.id, locator })}`;
    if (!next.artifacts.some((a) => a.id === targetArtifact.id)) next.artifacts.push(targetArtifact);
    if (!next.occurrences.some((n) => n.id === targetId)) next.occurrences.push({ id: targetId, artifactId: targetArtifact.id, profileId: profile.id, locator, evidenceIds });
    const type = text(finding.type);
    if (!["service", "protocol", "bundled", "code-generation"].includes(type)) throw new Error("Use native resolution for package edges; review imports cover integration edges");
    const scope = text(finding.scope);
    if (!["runtime", "build", "development"].includes(scope) || typeof finding.optional !== "boolean") throw new Error("Invalid scope or optionality");
    const fields = { from, to: targetId, type: type as Edge["type"], scope: scope as Edge["scope"], optional: finding.optional, condition: finding.condition === null ? null : text(finding.condition), constraint: null };
    const edgeId = `edge:${digest(fields)}`;
    const existing = next.edges.find((e) => e.id === edgeId);
    if (existing && existing.verification !== verification) {
      if (!decision || decision.previousVerification !== existing.verification) throw new Error("Changing a prior decision requires explicit previousVerification");
      existing.verification = verification;
      existing.evidenceIds = [...new Set([...existing.evidenceIds, ...evidenceIds])].sort();
    }
    if (!existing) next.edges.push({ id: edgeId, ...fields, verification, evidenceIds });
    next.decisions.push({ id: `decision:${digest({ packetId: current.packetId, finding: id, submission: submission.id })}`, packetId: current.packetId, edgeId, verification, rationale: decision ? text(decision.rationale) : rationale, method: decision ? text(decision.method) : "unreviewed-suggestion", evidenceIds });
    const frontier = gap("integration", `${targetArtifact.name}: dependency implementation/deployment remains an opaque boundary.`, "Resolve the dependency or document the interface and deployed version.", profile.id);
    if (verification !== "rejected" && !tool.gaps.some((g) => g.id === frontier.id)) tool.gaps.push(frontier);
    tool.integration = "partial";
    tool.evidenceIds.push(submission.id);
  }
  return finalize(next);
}
