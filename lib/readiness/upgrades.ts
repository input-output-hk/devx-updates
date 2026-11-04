import { citation, oneOf, verifyQuotes, type Citation, type SourceReader } from "./dijkstra";
import { compareVersions } from "./surfaces";

/**
 * Upgrade effort for a tool whose confirmed gaps all have a released upstream fix (plan revision R3). Raising the pin
 * is the minimum; this records whether the tool's own shipped code also has to change for the new era.
 * `own-work`: shipped code names eras and stops before Dijkstra (fixed era types, exhaustive era cases, era tables).
 * `prepared`: its era-specific code already has Dijkstra cases or forward-open comparisons.
 * `generic`: it reaches eras only through the library's era-generic entry points.
 * `undetermined`: reading cannot decide; R4 must.
 */
export const ERA_HANDLING = ["own-work", "prepared", "generic", "undetermined"] as const;
export type EraHandling = (typeof ERA_HANDLING)[number];

export interface Upgrade { tool: string; revision: string; eraHandling: EraHandling; summary: string; evidence: Citation[] }
export interface UpgradeRegister { schemaVersion: 1; reviewed: string; method: string[]; upgrades: Upgrade[] }

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseUpgradeRegister(raw: unknown): UpgradeRegister {
  const r = raw as Partial<UpgradeRegister>;
  if (r?.schemaVersion !== 1) throw new Error("Upgrade register must use schemaVersion 1");
  if (typeof r.reviewed !== "string" || !DATE.test(r.reviewed)) throw new Error("Upgrade register needs a reviewed date");
  if (!Array.isArray(r.method) || !r.method.every((m) => typeof m === "string" && m.trim())) throw new Error("Upgrade register needs a method");
  if (!Array.isArray(r.upgrades)) throw new Error("Upgrade register needs upgrades");
  const seen = new Set<string>();
  const upgrades = r.upgrades.map((value, index): Upgrade => {
    const u = value as Partial<Upgrade>;
    const label = `upgrade ${index} (${u?.tool})`;
    if (typeof u.tool !== "string" || !u.tool) throw new Error(`${label}: needs a tool`);
    if (seen.has(u.tool)) throw new Error(`${label}: tool is recorded twice`);
    seen.add(u.tool);
    if (typeof u.revision !== "string" || !/^[a-f0-9]{40}$/.test(u.revision)) throw new Error(`${label}: revision must be a 40-hex commit`);
    const eraHandling = oneOf(u.eraHandling, ERA_HANDLING, `${label} eraHandling`);
    if (typeof u.summary !== "string" || !u.summary.trim()) throw new Error(`${label}: needs a summary`);
    if (!Array.isArray(u.evidence)) throw new Error(`${label}: needs evidence`);
    const evidence = u.evidence.map((e, i) => citation(e, `${label} evidence ${i}`));
    if (eraHandling !== "undetermined" && !evidence.length) throw new Error(`${label}: ${eraHandling} needs evidence`);
    if (evidence.some((e) => e.revision !== u.revision)) throw new Error(`${label}: evidence must be read at the upgrade revision`);
    return { tool: u.tool, revision: u.revision, eraHandling, summary: u.summary, evidence };
  });
  return { schemaVersion: 1, reviewed: r.reviewed, method: r.method, upgrades };
}

export function verifyUpgradeSources(register: UpgradeRegister, read: SourceReader): Promise<string[]> {
  return verifyQuotes(register.upgrades.flatMap((u) => u.evidence.map((e, i): [string, Citation] => [`${u.tool} evidence ${i}`, e])), read);
}

/**
 * How far a pin (`package@from<first[|first…]`, as the classifier writes it) has to move: to the first fixed release on
 * its own release line when there is one, else to the lowest first release above it. `breaking` follows the package's
 * versioning: PVP (Haskell) treats A.B as the major, semver the first non-zero component.
 */
export interface PinStep { package: string; from: string; to: string; breaking: boolean }

const numbers = (v: string) => v.replace(/^v/, "").split(".").map(Number);
const major = (v: number[], pvp: boolean) => (pvp ? v.slice(0, 2) : (v[0] ?? 0) > 0 ? v.slice(0, 1) : v.slice(0, 2));

export function pinStep(pin: string, pvp: ReadonlySet<string>): PinStep | undefined {
  const m = /^(.+?)@([^<]+)<(.+)$/.exec(pin);
  if (!m) return undefined;
  const [, pkg, from, targets] = m;
  const isPvp = pvp.has(pkg);
  const have = numbers(from);
  const firsts = targets.split("|").map((t) => ({ tag: t, v: numbers(t) })).sort((a, b) => compareVersions(a.v, b.v));
  const same = firsts.find((f) => compareVersions(major(f.v, isPvp), major(have, isPvp)) === 0);
  const next = same ?? firsts.find((f) => compareVersions(f.v, have) > 0) ?? firsts[firsts.length - 1];
  return { package: pkg, from, to: next.tag, breaking: !same };
}

/** Bump-ready tools without an upgrade reading, readings at an older revision than the scan, and readings of unknown tools. */
export function upgradeCoverage(register: UpgradeRegister, bumpReady: string[], revisions: Map<string, string | null | undefined>) {
  const recorded = new Map(register.upgrades.map((u) => [u.tool, u]));
  return {
    missing: bumpReady.filter((t) => !recorded.has(t)),
    stale: register.upgrades.filter((u) => revisions.has(u.tool) && revisions.get(u.tool) !== u.revision).map((u) => u.tool),
    orphaned: register.upgrades.filter((u) => !revisions.has(u.tool)).map((u) => u.tool),
  };
}
