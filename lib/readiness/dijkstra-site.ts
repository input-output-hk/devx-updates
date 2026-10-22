import { join } from "node:path";
import { parseBoundaryRegister, worstStatus, type BoundaryRegister } from "./boundary";
import { parseChangeRegister, type ChangeRegister, type Citation } from "./dijkstra";
import { devnetConsistency, parseDevnetRegister, resultsFor, type DevnetRegister, type SubjectKind } from "./devnet";
import { parseLeadRegister, type Lead, type LeadRegister } from "./leads";
import { readJson } from "./store";
import type { ClassificationRegister } from "./surface-collect";
import { READINESS, targetVersions, type Readiness, type ToolClassification } from "./surfaces";
import { unlockReport, type UnlockReport } from "./unlocks";
import { parseUpgradeRegister, type UpgradeRegister } from "./upgrades";

/**
 * Build-time view of the Dijkstra registers for the static site (ADR-1, ADR-2): everything is read from
 * content/readiness/dijkstra and validated with the same parsers the CLI uses, so a malformed register fails the build.
 */
export interface DijkstraSite {
  changes: ChangeRegister; boundary: BoundaryRegister; leads: LeadRegister; unlocks: UnlockReport; upgrades: UpgradeRegister; devnet: DevnetRegister;
  classification: { generatedAt: string; summary: Record<string, number>; tools: Map<string, ToolClassification> };
}

let cached: DijkstraSite | undefined;

export function dijkstraSite(): DijkstraSite {
  if (cached) return cached;
  const dir = join(process.cwd(), "content/readiness/dijkstra");
  const changes = parseChangeRegister(readJson(join(dir, "changes.json")));
  const boundary = parseBoundaryRegister(readJson(join(dir, "boundary.json")), changes);
  const leads = parseLeadRegister(readJson(join(dir, "leads.json")), changes);
  const register = readJson(join(dir, "classification.json")) as ClassificationRegister;
  // Derived at build time from the committed registers, so the page never disagrees with them.
  const unlocks = unlockReport(register.tools, leads, boundary, new Set(targetVersions(changes).keys()));
  const upgrades = parseUpgradeRegister(readJson(join(dir, "upgrades.json")));
  const devnet = parseDevnetRegister(readJson(join(dir, "devnet.json")), {
    changes: new Set(changes.changes.map((c) => c.id)), components: new Set(boundary.components.map((c) => c.id)), tools: new Set(register.tools.map((t) => t.id)),
  });
  const inconsistent = devnetConsistency(boundary, devnet);
  if (inconsistent.length) throw new Error(`Boundary and devnet registers disagree: ${inconsistent.join("; ")}`);
  cached = {
    changes, boundary, leads, unlocks, upgrades, devnet,
    classification: { generatedAt: register.generatedAt, summary: register.summary, tools: new Map(register.tools.map((t) => [t.id, t])) },
  };
  return cached;
}

export const citationUrl = (c: Citation) => `https://github.com/${c.repo}/blob/${c.revision}/${c.path}#L${c.line}`;

/** A tool's lead decisions, confirmed first. */
export function toolLeads(site: DijkstraSite, id: string): Lead[] {
  const order = { confirmed: 0, undetermined: 1, "not-reached": 2 } as const;
  return site.leads.leads.filter((l) => l.tool === id).sort((a, b) => order[a.decision] - order[b.decision] || (a.via < b.via ? -1 : 1));
}

/** A gap inherited through a service rule rather than a component comes from a deprecated provider (Maestro). */
export const viaLabel = (via: string) => via.startsWith("service:") ? `${via.slice("service:".length)} (deprecated)` : via;

export function componentStatus(site: DijkstraSite, id: string) {
  const component = site.boundary.components.find((c) => c.id === id);
  return component ? worstStatus(component) : undefined;
}

/**
 * Shipped dependency or service links that no decision covers and whose component is not released: an inherited gap
 * nobody has read yet, or a component without a verdict (`no-evidence`, `tracked`, `in-progress`). Node-side services
 * (`upstream`) are left out: the node release itself carries the change.
 */
export interface Waiting { via: string; status: Readiness; unread: boolean; tools: { tool: string; surfaces: string[] }[] }

const SETTLED = new Set(["released", "verified", "upstream", "unassessed"]);

export function waitingLinks(site: DijkstraSite, only?: string): Waiting[] {
  const decided = new Set(site.leads.leads.flatMap((l) => l.surfaces.map((s) => `${l.tool}\0${l.via}\0${s}`)));
  const groups = new Map<string, Waiting>();
  for (const tool of site.classification.tools.values()) {
    if (only && tool.id !== only) continue;
    for (const s of tool.surfaces) for (const c of s.channels) {
      const via = c.via.split("@")[0];
      if (c.scope !== "shipped" || (c.channel !== "dependency" && c.channel !== "service") || SETTLED.has(c.readiness) || via === tool.id) continue;
      if (decided.has(`${tool.id}\0${via}\0${s.surface}`)) continue;
      // A component can be a gap on some surfaces and without a verdict on others: those are separate groups.
      const unread = c.readiness === "gap", key = `${via}\0${unread}`;
      const group = groups.get(key) ?? { via, status: c.readiness, unread, tools: [] };
      if (READINESS.indexOf(c.readiness) < READINESS.indexOf(group.status)) group.status = c.readiness;
      const entry = group.tools.find((t) => t.tool === tool.id) ?? (group.tools.push({ tool: tool.id, surfaces: [] }), group.tools[group.tools.length - 1]);
      if (!entry.surfaces.includes(s.surface)) entry.surfaces.push(s.surface);
      groups.set(key, group);
    }
  }
  return [...groups.values()].map((g) => ({ ...g, tools: g.tools.sort((a, b) => (a.tool < b.tool ? -1 : 1)) }))
    .sort((a, b) => Number(b.unread) - Number(a.unread) || b.tools.length - a.tools.length || (a.via < b.via ? -1 : 1));
}

export const toolUpgrade = (site: DijkstraSite, id: string) => site.upgrades.upgrades.find((u) => u.tool === id);

/** Devnet results about a tool, whether recorded against it as a tool or as a boundary component. */
export const devnetResults = (site: DijkstraSite, id: string) =>
  (["tool", "component"] as SubjectKind[]).flatMap((kind) => resultsFor(site.devnet, kind, id));
