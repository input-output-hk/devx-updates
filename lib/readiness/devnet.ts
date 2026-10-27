import { list, object, text } from "./core";
import { oneOf, uniqueIds } from "./dijkstra";
import type { BoundaryRegister } from "./boundary";

/**
 * Devnet register (plan revision R4): what a local Dijkstra network showed. A check is one exercise against the node;
 * each result names a change (R1), boundary component (R2) or tool, the version exercised, and the outcome. For a
 * change, `pass` means the node behaved as the change register says; for a component or tool, that the version worked.
 */
export const OUTCOMES = ["pass", "fail"] as const;
export const SUBJECTS = ["change", "component", "tool"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export type SubjectKind = (typeof SUBJECTS)[number];

export interface Result { kind: SubjectKind; id: string; version?: string; outcome: Outcome; note?: string }
export interface DevnetCheck { id: string; title: string; summary: string; results: Result[]; observed: string[]; recipe: string[] }
export interface DevnetRun {
  date: string; node: { repo: string; revision: string; build: string }; cli: string;
  setup: string[]; recipe: string;
}
export interface DevnetRegister { schemaVersion: 1; run: DevnetRun; checks: DevnetCheck[] }
export interface KnownSubjects { changes: Set<string>; components: Set<string>; tools: Set<string> }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REVISION = /^[a-f0-9]{40}$/;
const RECIPE = /^scripts\/readiness\/devnet\/[A-Za-z0-9_./-]+$/;

function strings(value: unknown, label: string): string[] {
  const items = list(value, label).map((item) => text(item, label));
  if (!items.length) throw new Error(`${label} must not be empty`);
  return items;
}

function recipe(value: unknown, label: string): string {
  const path = text(value, label);
  if (!RECIPE.test(path)) throw new Error(`${label} must be a path under scripts/readiness/devnet`);
  return path;
}

export function parseDevnetRegister(raw: unknown, known: KnownSubjects): DevnetRegister {
  const root = object(raw, "devnet");
  if (root.schemaVersion !== 1) throw new Error("Unsupported devnet register schemaVersion");
  const run = object(root.run, "run"), node = object(run.node, "run.node");
  const date = text(run.date, "run.date");
  if (!DATE.test(date)) throw new Error("run.date must be a YYYY-MM-DD date");
  const revision = text(node.revision, "run.node.revision");
  if (!REVISION.test(revision)) throw new Error("run.node.revision must be a 40-character commit");
  const byKind: Record<SubjectKind, Set<string>> = { change: known.changes, component: known.components, tool: known.tools };
  const checks = list(root.checks, "checks").map((item, i): DevnetCheck => {
    const c = object(item, `checks[${i}]`), label = `checks[${i}] ${String(c.id)}`;
    const results = list(c.results, `${label}.results`).map((entry, j): Result => {
      const r = object(entry, `${label}.results[${j}]`), at = `${label}.results[${j}]`;
      const kind = oneOf(r.kind, SUBJECTS, `${at}.kind`), id = text(r.id, `${at}.id`);
      if (!byKind[kind].has(id)) throw new Error(`${at} names unknown ${kind} ${id}`);
      return {
        kind, id, outcome: oneOf(r.outcome, OUTCOMES, `${at}.outcome`),
        ...(r.version === undefined ? {} : { version: text(r.version, `${at}.version`) }),
        ...(r.note === undefined ? {} : { note: text(r.note, `${at}.note`) }),
      };
    });
    if (!results.length) throw new Error(`${label} needs results`);
    const keys = results.map((r) => `${r.kind}\0${r.id}\0${r.version ?? ""}`);
    if (new Set(keys).size !== keys.length) throw new Error(`${label} records a subject version twice`);
    return {
      id: text(c.id, `${label}.id`), title: text(c.title, `${label}.title`), summary: text(c.summary, `${label}.summary`), results,
      observed: strings(c.observed, `${label}.observed`), recipe: list(c.recipe, `${label}.recipe`).map((p, k) => recipe(p, `${label}.recipe[${k}]`)),
    };
  });
  uniqueIds(checks, "devnet check");
  return {
    schemaVersion: 1,
    run: {
      date, node: { repo: text(node.repo, "run.node.repo"), revision, build: text(node.build, "run.node.build") },
      cli: text(run.cli, "run.cli"), setup: strings(run.setup, "run.setup"), recipe: recipe(run.recipe, "run.recipe"),
    },
    checks,
  };
}

/** Results about one subject, with the check they come from, in register order. */
export function resultsFor(register: DevnetRegister, kind: SubjectKind, id: string): { check: DevnetCheck; result: Result }[] {
  return register.checks.flatMap((check) => check.results.filter((r) => r.kind === kind && r.id === id).map((result) => ({ check, result })));
}

/**
 * Boundary assessments that cite devnet results: the check must have a result for that component at the cited version;
 * `verified` needs a cited pass, and a cited fail cannot back `released` or `verified`.
 */
export function devnetConsistency(boundary: BoundaryRegister, devnet: DevnetRegister): string[] {
  const checks = new Map(devnet.checks.map((c) => [c.id, c]));
  const problems: string[] = [];
  for (const component of boundary.components) for (const [i, a] of component.assessments.entries()) {
    const at = `${component.id} assessment ${i}`;
    const outcomes = a.evidence.flatMap((e) => {
      if (e.kind !== "devnet") return [];
      const result = checks.get(e.check)?.results.find((r) => r.kind === "component" && r.id === component.id && r.version === e.version);
      if (!result) { problems.push(`${at} cites devnet check ${e.check} for ${component.id} ${e.version}, which records no such result`); return []; }
      return [result.outcome];
    });
    if (a.status === "verified" && !outcomes.includes("pass")) problems.push(`${at} is verified without a passing devnet result`);
    if ((a.status === "released" || a.status === "verified") && outcomes.includes("fail")) problems.push(`${at} is ${a.status} but cites a failing devnet result`);
  }
  return problems;
}
