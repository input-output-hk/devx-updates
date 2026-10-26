import { worstStatus, type BoundaryRegister, type Status } from "./boundary";
import { gapLeads, OWN, type LeadRegister } from "./leads";
import type { ToolClassification } from "./surfaces";
import { pinStep, type PinStep } from "./upgrades";

/**
 * Unlock analysis (plan revision R3/R4): which tools a fix in one component clears, directly and through other
 * components, derived from the classification (who depends on what), the lead decisions (which gaps are reached)
 * and the boundary register (which components have gaps of their own).
 *
 * A confirmed gap is one of three blockers:
 * - `upstream-fix`: the component behind it has no release with the support; it must ship one.
 * - `own-bump`: a release with the support exists; the tool only has to raise its pin.
 * - `own-gap`: the tool's own code lacks the support (an R2 `gap`, or a confirmed `own` lead for a tool outside R2);
 *   only its maintainers can clear it.
 */
export type BlockerKind = "upstream-fix" | "own-bump" | "own-gap";
export interface Blocker { via: string; kind: BlockerKind; surfaces: string[]; pin?: string }
/**
 * `cleared` lists dependencies whose gap was read as not reached; `unread` lists inherited gaps nobody has decided yet,
 * which may turn into further blockers.
 */
export interface ToolBlockers {
  tool: string; boundary: boolean; blockers: Blocker[]; undetermined: { via: string; surfaces: string[] }[]; cleared: string[];
  unread: { via: string; surfaces: string[] }[];
}

export function toolBlockers(tools: ToolClassification[], leads: LeadRegister, boundary: BoundaryRegister): ToolBlockers[] {
  const components = new Map(boundary.components.map((c) => [c.id, c]));
  const out: ToolBlockers[] = [];
  for (const tool of tools) {
    const own = components.get(tool.id);
    const blockers: Blocker[] = [];
    if (own) {
      const surfaces = own.assessments.filter((a) => a.status === "gap").flatMap((a) => a.surfaces);
      if (surfaces.length) blockers.push({ via: tool.id, kind: "own-gap", surfaces });
    } else {
      // A tool outside R2 whose own code was read and found to break (lead `via: own`).
      const surfaces = leads.leads.filter((l) => l.tool === tool.id && l.via === OWN && l.decision === "confirmed").flatMap((l) => l.surfaces);
      if (surfaces.length) blockers.push({ via: tool.id, kind: "own-gap", surfaces });
    }
    const undetermined: ToolBlockers["undetermined"] = [];
    const cleared = new Set<string>();
    for (const lead of leads.leads.filter((l) => l.tool === tool.id)) {
      if (lead.via === OWN && lead.decision !== "undetermined") continue;
      if (lead.decision === "not-reached") { cleared.add(lead.via); continue; }
      if (lead.decision === "undetermined") { undetermined.push({ via: lead.via, surfaces: lead.surfaces }); continue; }
      for (const surface of lead.surfaces) {
        const channel = tool.surfaces.find((s) => s.surface === surface)?.channels.find((c) => c.via.split("@")[0] === lead.via && c.readiness === "gap");
        // A surface decided while its component has no verdict yet blocks nothing until that verdict is a gap.
        if (!channel) continue;
        // A pinned gap (`via@version<first`) means a release with the support already exists.
        const pin = channel?.via.includes("@") ? channel.via : undefined;
        const kind: BlockerKind = pin ? "own-bump" : "upstream-fix";
        const existing = blockers.find((b) => b.via === lead.via && b.kind === kind);
        if (existing) existing.surfaces.push(surface);
        else blockers.push({ via: lead.via, kind, surfaces: [surface], ...(pin && { pin }) });
      }
    }
    const decided = new Set(leads.leads.filter((l) => l.tool === tool.id).flatMap((l) => l.surfaces.map((s) => `${l.via}\0${s}`)));
    const unread = [...gapLeads(tool)].map(([via, surfaces]) => ({ via, surfaces: surfaces.filter((s) => !decided.has(`${via}\0${s}`)) })).filter((u) => u.surfaces.length);
    if (blockers.length || undetermined.length || cleared.size || unread.length) out.push({ tool: tool.id, boundary: Boolean(own), blockers, undetermined, cleared: [...cleared].sort(), unread });
  }
  return out.sort((a, b) => (a.tool < b.tool ? -1 : 1));
}

export interface Unlock { tool: string; depth: number; path: string[]; bumps: string[] }
export interface ComponentUnlocks {
  component: string;
  /** Tools whose every upstream blocker is cleared once this component (and what it unblocks) ships the support. */
  unlocks: Unlock[];
  /** Tools this component blocks that still wait on something else afterwards. */
  partial: { tool: string; stillBlockedBy: string[] }[];
  /**
   * Tools with a shipped dependency or service link to the component or to a component it unlocked, without a
   * confirmed gap through it: they may need the same release, which only reading or R4 can settle.
   */
  downstream: { tool: string; via: string }[];
}

const upstream = (t: ToolBlockers) => t.blockers.filter((b) => b.kind !== "own-bump");

/**
 * Fix `component` and follow the consequences: a tool is unlocked when all its upstream-fix blockers come through
 * fixed components and it has no gap of its own; an unlocked boundary component is then treated as fixed for its own
 * consumers. A fixed component that itself waits on another component (Blockfrost on db-sync) only becomes usable
 * once that one is fixed too; until then it is listed as partial. Own-bump blockers stay listed as the pins each
 * unlocked tool still has to raise.
 */
export function unlocksOf(component: string | string[], all: ToolBlockers[], tools: ToolClassification[] = []): ComponentUnlocks {
  const fixes = typeof component === "string" ? [component] : component;
  const repaired = new Set(fixes);
  const known = new Set(all.map((t) => t.tool));
  // A fix with no blockers of its own to wait on (a service rule, a component with only its own gap) is usable at once.
  const fixed = new Map<string, string[]>(fixes.filter((c) => !known.has(c)).map((c) => [c, [c]]));
  const needsOf = (t: ToolBlockers) => upstream(t).filter((b) => !(b.kind === "own-gap" && repaired.has(b.via)));
  const unlocks: Unlock[] = [];
  for (let changed = true; changed;) {
    changed = false;
    for (const t of all) {
      if (fixed.has(t.tool)) continue;
      const needs = needsOf(t);
      if (needs.some((b) => b.kind === "own-gap" || !fixed.has(b.via))) continue;
      if (!needs.length && !repaired.has(t.tool)) continue;
      const via = needs.map((b) => b.via).sort((a, b) => fixed.get(a)!.length - fixed.get(b)!.length).pop();
      const path = [...(via ? fixed.get(via)! : []), t.tool];
      fixed.set(t.tool, path);
      // A fixed component is the fix itself, not something it unlocks; one with no gap of its own is unlocked like any tool.
      if (!t.blockers.some((b) => b.kind === "own-gap" && repaired.has(b.via))) unlocks.push({ tool: t.tool, depth: path.length - 1, path, bumps: t.blockers.filter((b) => b.kind === "own-bump").map((b) => b.pin!) });
      changed = true;
    }
  }
  const partial = all
    .filter((t) => !fixed.has(t.tool) && (repaired.has(t.tool) || upstream(t).some((b) => fixed.has(b.via))))
    .map((t) => ({ tool: t.tool, stillBlockedBy: [...new Set(needsOf(t).filter((b) => !fixed.has(b.via) || b.kind === "own-gap").map((b) => (b.kind === "own-gap" ? `${b.via} (own gap)` : b.via)))] }));
  const counted = new Set([...fixed.keys(), ...partial.map((p) => p.tool)]);
  const cleared = new Map(all.map((t) => [t.tool, new Set(t.cleared)]));
  const downstream = tools.filter((t) => !counted.has(t.id)).flatMap((t) => {
    const link = t.surfaces.flatMap((s) => s.channels).find((c) => {
      const via = c.via.split("@")[0];
      return c.scope === "shipped" && (c.channel === "dependency" || c.channel === "service") && fixed.has(via) && !cleared.get(t.id)?.has(via);
    });
    return link ? [{ tool: t.id, via: link.via.split("@")[0] }] : [];
  }).sort((a, b) => (a.tool < b.tool ? -1 : 1));
  return { component: fixes.join("+"), unlocks: unlocks.sort((a, b) => a.depth - b.depth || (a.tool < b.tool ? -1 : 1)), partial, downstream };
}

export interface UnlockReport {
  schemaVersion: 1; generatedAt: string;
  /**
   * Tools whose every confirmed gap has a released upstream fix, so the next move is theirs: upgrade the dependency
   * (`steps`, and whether that crosses a breaking version) and handle the era in their own code (upgrades.json).
   * `ownStatus` is a boundary component's worst R2 status; `unread` lists inherited gaps not yet decided.
   */
  bumpReady: { tool: string; pins: string[]; steps: PinStep[]; ownStatus?: Status; unread: string[] }[];
  /** Components whose fix unlocks at least one tool, most unlocks first. */
  components: (ComponentUnlocks & { ownGap: string[] })[];
  /**
   * Many tools wait on several components at once, so single fixes understate the effect. Greedy order: each step adds
   * the component that unlocks the most tools on top of the earlier steps; `unlocked` is the running total.
   */
  fixOrder: { component: string; added: string[]; unlocked: number }[];
  blockers: ToolBlockers[];
}

/** `pvp` names the packages versioned by the Haskell PVP (the target component set), for breaking-step detection. */
export function unlockReport(tools: ToolClassification[], leads: LeadRegister, boundary: BoundaryRegister, pvp: ReadonlySet<string> = new Set()): UnlockReport {
  const blockers = toolBlockers(tools, leads, boundary);
  const bumpReady = blockers.filter((t) => t.blockers.length && !upstream(t).length).map((t) => {
    const own = boundary.components.find((c) => c.id === t.tool);
    const pins = t.blockers.map((b) => b.pin!);
    return {
      tool: t.tool, pins, steps: pins.map((p) => pinStep(p, pvp)).filter((s): s is PinStep => s !== undefined),
      ...(own && { ownStatus: worstStatus(own) }), unread: t.unread.map((u) => u.via),
    };
  });
  const candidates = [...new Set(blockers.flatMap((t) => upstream(t).map((b) => b.via)))].sort();
  const components = candidates
    .map((id) => ({ ...unlocksOf(id, blockers, tools), ownGap: boundary.components.find((c) => c.id === id)?.assessments.filter((a) => a.status === "gap").flatMap((a) => a.surfaces) ?? [] }))
    .filter((c) => c.unlocks.length || c.partial.length)
    .sort((a, b) => b.unlocks.length - a.unlocks.length || b.partial.length - a.partial.length || (a.component < b.component ? -1 : 1));
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), bumpReady, components, fixOrder: fixOrder(candidates, blockers), blockers };
}

/**
 * Greedy: each step takes the fix that unlocks the most on top of the earlier steps. A fix that cannot take effect
 * before other candidates are fixed (Blockfrost and Koios wait on db-sync) is scored together with those
 * prerequisites, per component in the bundle, and the bundle is emitted prerequisites first, one step per component.
 */
function fixOrder(candidates: string[], blockers: ToolBlockers[]): UnlockReport["fixOrder"] {
  const order: UnlockReport["fixOrder"] = [];
  const chosen: string[] = [];
  const pool = new Set(candidates);
  const byTool = new Map(blockers.map((t) => [t.tool, t]));
  // Candidates `id` waits on, in an order they can be fixed (each after the ones it waits on).
  const prerequisites = (id: string): string[] => {
    const out: string[] = [], seen = new Set<string>([id]);
    const visit = (c: string) => {
      for (const b of upstream(byTool.get(c) ?? { blockers: [] } as unknown as ToolBlockers)) {
        if (b.kind !== "upstream-fix" || !pool.has(b.via) || seen.has(b.via)) continue;
        seen.add(b.via);
        visit(b.via);
        out.push(b.via);
      }
    };
    visit(id);
    return out;
  };
  let unlocked = new Set<string>();
  while (pool.size) {
    const scored = [...pool].map((id) => {
      const bundle = [...prerequisites(id), id];
      const result = unlocksOf([...chosen, ...bundle], blockers);
      return { id, bundle, tools: new Set(result.unlocks.map((u) => u.tool)), partial: result.partial.length };
    }).map((c) => ({ ...c, rate: (c.tools.size - unlocked.size) / c.bundle.length }))
      .sort((a, b) => b.rate - a.rate || b.tools.size - a.tools.size || a.bundle.length - b.bundle.length || a.partial - b.partial || (a.id < b.id ? -1 : 1));
    const best = scored[0];
    if (best.tools.size === unlocked.size) break; // nothing left unlocks anything more
    for (const id of best.bundle) {
      chosen.push(id);
      pool.delete(id);
      const tools = new Set(unlocksOf(chosen, blockers).unlocks.map((u) => u.tool));
      order.push({ component: id, added: [...tools].filter((t) => !unlocked.has(t)).sort(), unlocked: tools.size });
      unlocked = tools;
    }
  }
  return order;
}
