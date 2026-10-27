import { list, object, text } from "./core";
import { citation, oneOf, uniqueIds, verifyQuotes, type ChangeRegister, type Citation, type SourceReader } from "./dijkstra";

/** Boundary register (plan revision R2): components that implement a changed surface, and their Dijkstra status. */

export const ROLES = [
  "ledger-codec", "network-client", "chain-indexer", "node", "transaction-builder",
  "script-compiler", "script-evaluator", "hardware-signing", "devnet", "layer-two",
] as const;
/**
 * Ordered from worst to best. `gap` means cited code shows the observed revision cannot work against the
 * target; `no-evidence` means nothing was found, which is never a pass; `tracked` is an acknowledged issue
 * without code; `in-progress` is visible work toward the target definitions: code on a branch, in an open pull
 * request, or merged but unreleased. A release built only against superseded Dijkstra definitions, with no such
 * work, is a `gap`. `released` is a release that implements the target
 * definitions; `verified` additionally passed a Dijkstra network check (R4).
 */
export const STATUSES = ["gap", "no-evidence", "tracked", "in-progress", "released", "verified"] as const;
export const TRACKER_STATES = ["open", "closed", "merged"] as const;

export type Role = (typeof ROLES)[number];
export type Status = (typeof STATUSES)[number];

export interface Tracker { kind: "tracker"; url: string; title: string; state: (typeof TRACKER_STATES)[number]; date: string }
/** A devnet result (R4) for this component at `version`; `devnetConsistency` checks it against the devnet register. */
export interface DevnetEvidence { kind: "devnet"; check: string; version: string }
export type Evidence = ({ kind: "source" } & Citation) | Tracker | DevnetEvidence;
export interface Release { tag: string; date: string }
/**
 * `releasedIn` is a release confirmed to contain the support. `firstReleases` is the earliest release on each release
 * line whose tagged source contains every cited source quote; only it decides whether a consumer's pin is too old.
 */
export interface Assessment { surfaces: string[]; status: Status; summary: string; releasedIn?: Release; firstReleases?: Release[]; evidence: Evidence[] }
export interface Component {
  id: string; repo: string; roles: Role[]; surfaces: string[];
  observed: { branch: string; revision: string; date: string; release: Release | null };
  dependsOn: { component: string; version: string }[];
  assessments: Assessment[];
}
export interface BoundaryRegister { schemaVersion: 1; retrieved: string; method: string[]; components: Component[] }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REVISION = /^[a-f0-9]{40}$/;
const TRACKER = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(?:pull|issues)\/\d+$/;

function date(value: unknown, label: string): string {
  const d = text(value, label);
  if (!DATE.test(d)) throw new Error(`${label} must be a YYYY-MM-DD date`);
  return d;
}

function release(value: unknown, label: string): Release {
  const r = object(value, label);
  return { tag: text(r.tag, `${label}.tag`), date: date(r.date, `${label}.date`) };
}

function evidence(value: unknown, label: string): Evidence {
  const e = object(value, label);
  if (e.kind === "source") return { kind: "source", ...citation(e, label) };
  if (e.kind === "devnet") return { kind: "devnet", check: text(e.check, `${label}.check`), version: text(e.version, `${label}.version`) };
  if (e.kind !== "tracker") throw new Error(`${label}.kind must be source, tracker or devnet`);
  const url = text(e.url, `${label}.url`);
  if (!TRACKER.test(url)) throw new Error(`${label}.url must be a GitHub issue or pull request`);
  return { kind: "tracker", url, title: text(e.title, `${label}.title`), state: oneOf(e.state, TRACKER_STATES, `${label}.state`), date: date(e.date, `${label}.date`) };
}

function subset(value: unknown, label: string, known: Set<string>): string[] {
  const items = list(value, label).map((item) => text(item, label));
  if (!items.length || new Set(items).size !== items.length) throw new Error(`${label} must be a non-empty list without duplicates`);
  for (const item of items) if (!known.has(item)) throw new Error(`${label} references unknown ${item}`);
  return items;
}

export function parseBoundaryRegister(raw: unknown, changes: ChangeRegister): BoundaryRegister {
  const root = object(raw, "boundary");
  if (root.schemaVersion !== 1) throw new Error("Unsupported boundary register schemaVersion");
  const surfaceIds = new Set(changes.surfaces.map((s) => s.id));
  const components = list(root.components, "components").map((item, i): Component => {
    const c = object(item, `components[${i}]`);
    const label = `components[${i}] ${String(c.id)}`;
    const repo = text(c.repo, `${label}.repo`);
    const surfaces = subset(c.surfaces, `${label}.surfaces`, surfaceIds);
    const observed = object(c.observed, `${label}.observed`);
    const revision = text(observed.revision, `${label}.observed.revision`);
    if (!REVISION.test(revision)) throw new Error(`${label}.observed.revision must be a 40-character commit`);
    const assessments = list(c.assessments, `${label}.assessments`).map((entry, j): Assessment => {
      const a = object(entry, `${label}.assessments[${j}]`), at = `${label}.assessments[${j}]`;
      const status = oneOf(a.status, STATUSES, `${at}.status`);
      const found = list(a.evidence, `${at}.evidence`).map((e, k) => evidence(e, `${at}.evidence[${k}]`));
      // An absence is recorded against the observed revision; every other status must point at what it rests on.
      if (status !== "no-evidence" && !found.length) throw new Error(`${at} needs evidence for status ${status}`);
      if ((status === "released" || status === "verified") && a.releasedIn === undefined) throw new Error(`${at} needs releasedIn for status ${status}`);
      if (status === "verified" && !found.some((e) => e.kind === "devnet")) throw new Error(`${at} needs devnet evidence for status verified`);
      if (a.firstReleases !== undefined && a.releasedIn === undefined) throw new Error(`${at} needs releasedIn alongside firstReleases`);
      const firsts = a.firstReleases === undefined ? undefined : list(a.firstReleases, `${at}.firstReleases`).map((r, k) => release(r, `${at}.firstReleases[${k}]`));
      if (firsts && !firsts.length) throw new Error(`${at}.firstReleases must not be empty`);
      return {
        surfaces: subset(a.surfaces, `${at}.surfaces`, new Set(surfaces)), status, summary: text(a.summary, `${at}.summary`),
        ...(a.releasedIn === undefined ? {} : { releasedIn: release(a.releasedIn, `${at}.releasedIn`) }),
        ...(firsts ? { firstReleases: firsts } : {}), evidence: found,
      };
    });
    const assessed = new Set(assessments.flatMap((a) => a.surfaces));
    const unassessed = surfaces.filter((s) => !assessed.has(s));
    if (unassessed.length) throw new Error(`${label} has unassessed surfaces: ${unassessed.join(", ")}`);
    return {
      id: text(c.id, `${label}.id`), repo, roles: subset(c.roles, `${label}.roles`, new Set(ROLES)) as Role[], surfaces,
      observed: {
        branch: text(observed.branch, `${label}.observed.branch`), revision, date: date(observed.date, `${label}.observed.date`),
        release: observed.release === null ? null : release(observed.release, `${label}.observed.release`),
      },
      dependsOn: list(c.dependsOn, `${label}.dependsOn`).map((d, k) => {
        const dep = object(d, `${label}.dependsOn[${k}]`);
        return { component: text(dep.component, `${label}.dependsOn[${k}].component`), version: text(dep.version, `${label}.dependsOn[${k}].version`) };
      }),
      assessments,
    };
  });
  const ids = uniqueIds(components, "component");
  for (const c of components) for (const d of c.dependsOn) if (!ids.has(d.component)) throw new Error(`${c.id} depends on unknown component ${d.component}`);
  return { schemaVersion: 1, retrieved: date(root.retrieved, "retrieved"), method: list(root.method, "method").map((m) => text(m, "method")), components };
}

/** Re-read every source citation at its pinned revision. */
export function verifyBoundarySources(register: BoundaryRegister, read: SourceReader): Promise<string[]> {
  return verifyQuotes(register.components.flatMap((c) => c.assessments.flatMap((a) => a.evidence.flatMap((e): [string, Citation][] => (e.kind === "source" ? [[c.id, e]] : [])))), read);
}

/** The worst status per surface, so a component is only as ready as its weakest changed surface. */
export function worstStatus(component: Component, surface?: string): Status {
  const relevant = component.assessments.filter((a) => surface === undefined || a.surfaces.includes(surface));
  return relevant.reduce<Status>((worst, a) => (STATUSES.indexOf(a.status) < STATUSES.indexOf(worst) ? a.status : worst), "verified");
}

/** Component count per status, using each component's worst status. */
export function statusSummary(register: BoundaryRegister): Record<Status, string[]> {
  const summary = Object.fromEntries(STATUSES.map((s) => [s, [] as string[]])) as Record<Status, string[]>;
  for (const c of register.components) summary[worstStatus(c)].push(c.id);
  return summary;
}
