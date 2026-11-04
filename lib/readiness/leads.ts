import { citation, oneOf, verifyQuotes, type ChangeRegister, type Citation, type SourceReader } from "./dijkstra";
import type { ToolClassification } from "./surfaces";

/**
 * Lead confirmation (plan revision R3): a read of shipped code deciding whether an inherited gap is reached.
 * `confirmed`: a shipped path uses the gapped capability (decodes the changed data, opens the changed protocol,
 * evaluates the changed scripts), so the tool fails or misbehaves after the hardfork until the dependency moves.
 * `not-reached`: shipped code uses the dependency only outside the gapped capability; coupling remains.
 * `undetermined`: reading cannot decide; R4 execution or the maintainer must.
 */
export const DECISIONS = ["confirmed", "not-reached", "undetermined"] as const;
export type Decision = (typeof DECISIONS)[number];

/**
 * `via` of a decision about a tool's own code: whether the shipped lines behind its marker channels (raw CBOR codecs,
 * era lists, certificate and parameter handling) break on Dijkstra. Boundary components are assessed in R2 instead.
 */
export const OWN = "own";

export interface Lead {
  tool: string; revision: string;
  /**
   * Component or upstream package the gap is inherited from, as it prefixes the classification channel's `via`, or
   * `own` for the tool's own code.
   */
  via: string; surfaces: string[]; decision: Decision; summary: string; evidence: Citation[];
}
export interface LeadRegister { schemaVersion: 1; reviewed: string; method: string[]; leads: Lead[] }

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseLeadRegister(raw: unknown, changes: ChangeRegister): LeadRegister {
  const r = raw as Partial<LeadRegister>;
  if (r?.schemaVersion !== 1) throw new Error("Lead register must use schemaVersion 1");
  if (typeof r.reviewed !== "string" || !DATE.test(r.reviewed)) throw new Error("Lead register needs a reviewed date");
  if (!Array.isArray(r.method) || !r.method.every((m) => typeof m === "string" && m.trim())) throw new Error("Lead register needs a method");
  if (!Array.isArray(r.leads)) throw new Error("Lead register needs leads");
  const surfaces = new Set(changes.surfaces.map((s) => s.id));
  const seen = new Set<string>();
  const leads = r.leads.map((value, index): Lead => {
    const l = value as Partial<Lead>;
    const label = `lead ${index} (${l?.tool}/${l?.via})`;
    if (typeof l.tool !== "string" || typeof l.via !== "string" || !l.tool || !l.via) throw new Error(`${label}: needs tool and via`);
    if (typeof l.revision !== "string" || !/^[a-f0-9]{40}$/.test(l.revision)) throw new Error(`${label}: revision must be a 40-hex commit`);
    if (!Array.isArray(l.surfaces) || !l.surfaces.length || !l.surfaces.every((s) => surfaces.has(s))) throw new Error(`${label}: surfaces must come from the change register`);
    // One decision per tool, dependency and surface; a dependency can be reached on some surfaces and not others.
    for (const surface of l.surfaces) {
      const key = `${l.tool}\0${l.via}\0${surface}`;
      if (seen.has(key)) throw new Error(`${label}: ${surface} is decided twice`);
      seen.add(key);
    }
    const decision = oneOf(l.decision, DECISIONS, `${label} decision`);
    if (typeof l.summary !== "string" || !l.summary.trim()) throw new Error(`${label}: needs a summary`);
    if (!Array.isArray(l.evidence)) throw new Error(`${label}: needs evidence`);
    const evidence = l.evidence.map((e, i) => citation(e, `${label} evidence ${i}`));
    // A decision either way rests on quoted shipped code; only an open question may lack it.
    if (decision !== "undetermined" && !evidence.length) throw new Error(`${label}: ${decision} needs evidence`);
    if (evidence.some((e) => e.revision !== l.revision)) throw new Error(`${label}: evidence must be read at the lead revision`);
    return { tool: l.tool, revision: l.revision, via: l.via, surfaces: l.surfaces, decision, summary: l.summary, evidence };
  });
  return { schemaVersion: 1, reviewed: r.reviewed, method: r.method, leads };
}

/**
 * Shipped, non-marker channels that inherit a gap, keyed by the component or package they come through. Boundary
 * components are included: a gap one component inherits from another is R2 propagation and is decided the same way.
 */
export function gapLeads(tool: ToolClassification): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const s of tool.surfaces) for (const c of s.channels) {
    if (c.readiness !== "gap" || c.scope !== "shipped" || c.channel === "marker" || c.channel === "implements") continue;
    const via = c.via.split("@")[0];
    out.set(via, [...new Set([...(out.get(via) ?? []), s.surface])]);
  }
  return out;
}

/** Statuses that leave a consumer waiting on the component's verdict rather than on a read of its own code. */
const OPEN = new Set(["no-evidence", "tracked", "in-progress"]);

/**
 * Shipped dependency or service channels whose component has no verdict yet (`no-evidence`, `tracked`,
 * `in-progress`). Deciding them is optional: a `not-reached` read clears the wait whatever the component later
 * turns out to be, while a reached surface stays waiting on the component.
 */
export function openLeads(tool: ToolClassification): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const s of tool.surfaces) for (const c of s.channels) {
    if (!OPEN.has(c.readiness) || c.scope !== "shipped" || c.channel === "marker" || c.channel === "implements") continue;
    const via = c.via.split("@")[0];
    if (via === tool.id) continue;
    out.set(via, [...new Set([...(out.get(via) ?? []), s.surface])]);
  }
  return out;
}

/**
 * Surfaces where a tool that is not a boundary component has shipped marker lines: its own code touches the changed
 * data, and only reading those lines can say whether it breaks.
 */
export function ownLeads(tool: ToolClassification, boundary: ReadonlySet<string>): string[] {
  if (boundary.has(tool.id)) return [];
  return tool.surfaces.filter((s) => s.channels.some((c) => c.channel === "marker" && c.scope === "shipped")).map((s) => s.surface);
}

/** Counts are per tool, dependency and surface. */
export interface LeadCoverage {
  reviewed: number; byDecision: Record<Decision, number>;
  unreviewed: { tool: string; via: string; surfaces: string[] }[]; stale: string[]; orphaned: string[];
  /**
   * Own-code surfaces without a decision, for tools with no confirmed gap: reading them is what can still move such a
   * tool out of "not verified". Tools already confirmed broken are left out; their own code changes no verdict.
   */
  ownUnreviewed: { tool: string; surfaces: string[] }[];
  /** Tools with at least one confirmed gap. */
  confirmedTools: string[];
}

/**
 * Which classification gaps have a decision, which decisions were read at an older revision, and which match no gap.
 * Own-code decisions are matched against `ownLeads` when `boundary` (the R2 component ids) is given.
 */
export function leadCoverage(register: LeadRegister, tools: ToolClassification[], boundary?: ReadonlySet<string>): LeadCoverage {
  const decided = new Map<string, Lead>(register.leads.flatMap((l) => l.surfaces.map((s): [string, Lead] => [`${l.tool}\0${l.via}\0${s}`, l])));
  const coverage: LeadCoverage = { reviewed: 0, byDecision: { confirmed: 0, "not-reached": 0, undetermined: 0 }, unreviewed: [], stale: [], orphaned: [], ownUnreviewed: [], confirmedTools: [] };
  const open = new Set([...decided.keys()].filter((k) => boundary || k.split("\0")[1] !== OWN));
  const stale = new Set<string>(), confirmed = new Set<string>();
  const leadsOf = (tool: ToolClassification): [string, string[]][] => [...gapLeads(tool), ...(boundary ? [[OWN, ownLeads(tool, boundary)] as [string, string[]]] : [])];
  const ownMissing = new Map<string, string[]>();
  for (const tool of tools) for (const [via, surfaces] of leadsOf(tool)) {
    const missing: string[] = [];
    for (const surface of surfaces) {
      const key = `${tool.id}\0${via}\0${surface}`, lead = decided.get(key);
      if (!lead) { missing.push(surface); continue; }
      open.delete(key);
      coverage.reviewed++;
      coverage.byDecision[lead.decision]++;
      if (lead.decision === "confirmed") confirmed.add(tool.id);
      if (lead.revision !== tool.revision) stale.add(`${tool.id}/${via}`);
    }
    if (!missing.length) continue;
    if (via === OWN) ownMissing.set(tool.id, missing);
    else coverage.unreviewed.push({ tool: tool.id, via, surfaces: missing });
  }
  // Optional decisions on surfaces still waiting on a component's verdict are matched, not required.
  for (const tool of tools) for (const [via, surfaces] of openLeads(tool)) for (const surface of surfaces) {
    const key = `${tool.id}\0${via}\0${surface}`;
    if (!open.delete(key)) continue;
    const lead = decided.get(key)!;
    coverage.reviewed++;
    coverage.byDecision[lead.decision]++;
    if (lead.revision !== tool.revision) stale.add(`${tool.id}/${via}`);
  }
  coverage.ownUnreviewed = [...ownMissing].filter(([tool]) => !confirmed.has(tool)).map(([tool, surfaces]) => ({ tool, surfaces }));
  coverage.orphaned = [...open].map((k) => k.split("\0").join("/"));
  coverage.stale = [...stale];
  coverage.confirmedTools = [...confirmed].sort();
  return coverage;
}

export function verifyLeadSources(register: LeadRegister, read: SourceReader): Promise<string[]> {
  return verifyQuotes(register.leads.flatMap((l) => l.evidence.map((e, i): [string, Citation] => [`${l.tool}/${l.via} evidence ${i}`, e])), read);
}
