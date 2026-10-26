import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBoundaryRegister, worstStatus, type BoundaryRegister } from "./boundary";
import { parseChangeRegister, type ChangeRegister, type Citation } from "./dijkstra";
import { devnetConsistency, parseDevnetRegister, resultsFor, type DevnetRegister, type SubjectKind } from "./devnet";
import { OWN, parseLeadRegister, type Lead, type LeadRegister } from "./leads";
import { readJson } from "./store";
import type { ClassificationRegister } from "./surface-collect";
import { READINESS, targetVersions, UPSTREAM_TOOLS, type Readiness, type ToolClassification } from "./surfaces";
import { unlockReport, type UnlockReport } from "./unlocks";
import { linkLabel, loadTracking, parseTrackingState, type Dismissal, type LinkInfo, type TrackingRegister } from "./tracking";
import { parseUpgradeRegister, type UpgradeRegister } from "./upgrades";

/**
 * Build-time view of the Dijkstra registers for the static site (ADR-1, ADR-2): everything is read from
 * content/readiness/dijkstra and validated with the same parsers the CLI uses, so a malformed register fails the build.
 */
export interface DijkstraSite {
  changes: ChangeRegister; boundary: BoundaryRegister; leads: LeadRegister; unlocks: UnlockReport; upgrades: UpgradeRegister; devnet: DevnetRegister;
  classification: { generatedAt: string; summary: Record<string, number>; tools: Map<string, ToolClassification> };
  /** Hand-kept dismissals and issue/PR links (tracking.yaml), with GitHub state from tracking-state.json. */
  tracking: TrackingRegister; linkState: Record<string, LinkInfo>;
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
  const tracking = loadTracking(readFileSync(join(dir, "tracking.yaml"), "utf8"), new Set(register.tools.map((t) => t.id)));
  const { links: linkState } = parseTrackingState(readJson(join(dir, "tracking-state.json")));
  const inconsistent = devnetConsistency(boundary, devnet);
  if (inconsistent.length) throw new Error(`Boundary and devnet registers disagree: ${inconsistent.join("; ")}`);
  cached = {
    changes, boundary, leads, unlocks, upgrades, devnet, tracking, linkState,
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
export const viaLabel = (via: string) => via === OWN ? "own code" : via.startsWith("service:") ? `${via.slice("service:".length)} (deprecated)` : via;

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

/**
 * One verdict per tool for the overview list. `breaks`: a confirmed gap with nobody shipping the fix yet (own code,
 * an upstream fix still missing, or a released fix the tool has not taken). `in-progress`: Dijkstra work exists toward
 * the target but is not released (the 11.2 component set itself counts here until it is tagged). `ready`: the tool's
 * own support is released or verified and nothing it uses is still open. Everything else is `unverified`: no
 * confirmed gap, which is never a pass.
 */
export type HardforkState = "breaks" | "in-progress" | "ready" | "unverified" | "dismissed";
/** A link as the page shows it: `label` is `owner/repo#n` for GitHub, `info` its synced title and state if any. */
export interface ToolLink { url: string; label: string; note?: string; info?: LinkInfo }
/**
 * `dismissed` (tracking.yaml) overrides the computed state, which stays in `computed` so the page can still say what
 * the tool would otherwise be.
 */
export interface ToolState {
  tool: string; state: HardforkState; reason: string; dependents: string[]; reachedBy: string[];
  /** Upstream components whose missing fix blocks the tool, and short facts for chips; both empty when dismissed. */
  blockedBy: Blocker[]; tags: StateTag[];
  computed?: Exclude<HardforkState, "dismissed">; dismissed?: Dismissal; links: ToolLink[];
}

export const toolLinks = (site: DijkstraSite, id: string): ToolLink[] =>
  (site.tracking.get(id)?.links ?? []).map((l) => ({ ...l, label: linkLabel(l.url), ...(site.linkState[l.url] && { info: site.linkState[l.url] }) }));


const list = (items: string[]) => [...new Set(items)].map(viaLabel).join(", ");

/** Whether the tool's own code was read (an `own` lead) and found not to break on any surface it touches. */
const ownRead = (site: DijkstraSite, id: string) => {
  const own = site.leads.leads.filter((l) => l.tool === id && l.via === OWN);
  return own.length > 0 && own.every((l) => l.decision === "not-reached");
};

/** A short fact about a tool's state, shown as a chip. `bad` is a break, `work` is support under way, `act` is the tool's own next move. */
export interface StateTag { label: string; tone: "bad" | "work" | "act" }
/** A component a tool is blocked by, with its page when it is a catalog tool. */
export interface Blocker { id: string; label: string; href?: string }
type Computed = { tool: string; state: Exclude<HardforkState, "dismissed">; reason: string; blockedBy: Blocker[]; tags: StateTag[] };

const sentence = (parts: (string | false | 0 | undefined)[]) => {
  const text = parts.filter(Boolean).join("; ");
  return text[0].toUpperCase() + text.slice(1);
};

function computedState(site: DijkstraSite, tool: ToolClassification): Computed {
  const blockers = site.unlocks.blockers.find((b) => b.tool === tool.id)?.blockers ?? [];
  const own = componentStatus(site, tool.id);
  const failed = devnetResults(site, tool.id).some((r) => r.result.outcome === "fail");
  const waiting = waitingLinks(site, tool.id);
  // A gap through a deprecated provider (a `service:` rule, Maestro) will never be fixed: the tool has to move off it.
  const upstreamFix = [...new Set(blockers.filter((b) => b.kind === "upstream-fix" && !b.via.startsWith("service:")).map((b) => b.via))];
  const retired = [...new Set(blockers.filter((b) => b.kind === "upstream-fix" && b.via.startsWith("service:")).map((b) => b.via.slice("service:".length)))];
  const blockedBy = upstreamFix.map((via): Blocker => {
    const target = dependencyTarget(via);
    return { id: via, label: viaLabel(via), ...(site.classification.tools.has(target) && { href: `/map/readiness/${target}` }) };
  });
  const blocked = blockedBy.length > 0 && `blocked by ${list(upstreamFix)}`;
  const moveOff = retired.length > 0 && `must move off ${retired.join(", ")}`;
  const moveTags = retired.map((r): StateTag => ({ label: `Move off ${r}`, tone: "act" }));
  const failedTag: StateTag[] = failed ? [{ label: "Failed on devnet", tone: "bad" }] : [];
  const base = { tool: tool.id, blockedBy };
  if (UPSTREAM_TOOLS.has(tool.id)) return { ...base, state: "in-progress", reason: "Part of the node 11.2 release, not tagged yet", tags: [{ label: "Node 11.2, not tagged", tone: "work" }] };
  if (own === "in-progress" || own === "tracked") {
    const work = own === "tracked" ? "Dijkstra work tracked upstream" : "Dijkstra support underway, not released";
    return {
      ...base, state: "in-progress", reason: sentence([blocked, work, moveOff]),
      tags: [{ label: own === "tracked" ? "Work tracked" : "Support underway", tone: "work" }, ...moveTags, ...failedTag],
    };
  }
  if (blockers.length) {
    const ownGap = blockers.some((b) => b.kind === "own-gap");
    const bumps = [...new Set(blockers.filter((b) => b.kind === "own-bump").map((b) => b.pin!.split("@")[0]))];
    return {
      ...base, state: "breaks",
      reason: sentence([blocked, ownGap && "own code lacks Dijkstra support", moveOff, bumps.length && `must upgrade ${list(bumps)}`, failed && "failed on the devnet"]),
      tags: [
        ...(ownGap ? [{ label: "Own code gap", tone: "bad" } as StateTag] : []),
        ...failedTag, ...moveTags,
        ...bumps.map((b): StateTag => ({ label: `Upgrade ${viaLabel(b)}`, tone: "act" })),
      ],
    };
  }
  if ((own === "released" || own === "verified") && !waiting.length && !failed) {
    return { ...base, state: "ready", reason: own === "verified" ? "Support verified" : "Support released", tags: [] };
  }
  const unread = waiting.filter((w) => w.unread).map((w) => w.via), open = waiting.filter((w) => !w.unread).map((w) => w.via);
  const reason = unread.length ? `Inherits a gap from ${list(unread)}, not read yet`
    : open.length ? `Waits on a verdict for ${list(open)}`
    : tool.readiness === "upstream" ? "Uses only the node 11.2 components"
    : ownRead(site, tool.id) ? "Own code and dependencies read, no confirmed gap; not run against Dijkstra"
    : "No confirmed gap; not checked against Dijkstra";
  return { ...base, state: "unverified", reason, tags: failedTag };
}

export function toolState(site: DijkstraSite, tool: ToolClassification): Omit<ToolState, "dependents" | "reachedBy"> {
  const computed = computedState(site, tool);
  const links = toolLinks(site, tool.id);
  const dismissed = site.tracking.get(tool.id)?.dismissed;
  return dismissed ? { tool: tool.id, state: "dismissed", reason: dismissed.reason, blockedBy: [], tags: [], computed: computed.state, dismissed, links } : { ...computed, links };
}

/**
 * What the node release ships that tools reach under their own names: the local socket, the submit API and the
 * Haskell libraries. None is a catalog tool, so a tool using any of them depends on cardano-node.
 */
const NODE_SIDE = new Set(["node-socket", "submit-api", "cardano-api", "cardano-ledger", "cardano-ledger-conway", "ouroboros-consensus", "ouroboros-network"]);

/** The catalog tool a channel's `via` reaches: rule prefixes and version pins dropped, node-side names folded into cardano-node. */
export function dependencyTarget(via: string): string {
  const name = via.split("@")[0].replace(/^(?:service|dependency):/, "");
  return NODE_SIDE.has(name) ? "cardano-node" : name;
}

/**
 * Every tool whose shipped code touches a changed surface, with its state, most-reached first. `dependents` are
 * catalog tools that reach the tool directly through a shipped dependency or service call; `reachedBy` adds the tools
 * that reach it through those, at any depth (what a gap in it can break). Ties fall to direct dependents, then
 * `weight` (stars).
 */
export function toolStates(site: DijkstraSite, weight: (id: string) => number = () => 0): ToolState[] {
  const tools = [...site.classification.tools.values()];
  const dependents = new Map<string, Set<string>>();
  for (const t of tools) for (const s of t.surfaces) for (const c of s.channels) {
    if (c.scope !== "shipped" || (c.channel !== "dependency" && c.channel !== "service")) continue;
    const via = dependencyTarget(c.via);
    if (via !== t.id) (dependents.get(via) ?? dependents.set(via, new Set()).get(via)!).add(t.id);
  }
  const reached = (id: string) => {
    const seen = new Set<string>(), queue = [...(dependents.get(id) ?? [])];
    for (let next; (next = queue.pop()) !== undefined;) {
      if (next === id || seen.has(next)) continue;
      seen.add(next);
      queue.push(...(dependents.get(next) ?? []));
    }
    return [...seen].sort();
  };
  return tools.filter((t) => t.surfaces.some((s) => s.channels.some((c) => c.scope === "shipped")))
    .map((t) => ({ ...toolState(site, t), dependents: [...(dependents.get(t.id) ?? [])].sort(), reachedBy: reached(t.id) }))
    .sort((a, b) => b.reachedBy.length - a.reachedBy.length || b.dependents.length - a.dependents.length
      || weight(b.tool) - weight(a.tool) || (a.tool < b.tool ? -1 : 1));
}
