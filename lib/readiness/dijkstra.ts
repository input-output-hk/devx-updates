import { list, object, text } from "./core";

/** Hardfork change register (plan revision R1): what Dijkstra changes, where, and on what evidence. */

export const ACTIVATIONS = ["pv12", "pv13-intra-era", "node-11.2-upgrade"] as const;
export const COMPATIBILITY = ["decode-break", "encode-break", "additive", "rule-change", "interface-change"] as const;
export const BASES = ["source-verified", "documented", "provisional"] as const;

export type Activation = (typeof ACTIVATIONS)[number];
export type Compatibility = (typeof COMPATIBILITY)[number];
export type Basis = (typeof BASES)[number];

export interface Citation { repo: string; revision: string; path: string; line: number; quote: string }
export interface Change {
  id: string; title: string; scope: string[]; activation: Activation; surfaces: string[];
  compatibility: Compatibility; basis: Basis; summary: string; affects: string; citations: Citation[];
}
export interface ChangeRegister {
  schemaVersion: 1;
  target: Record<string, unknown>;
  scope: { id: string; title: string; activation: Activation }[];
  surfaces: { id: string; description: string }[];
  changes: Change[];
  /** Areas read at the target and found unchanged, so the absence of a change is itself cited. */
  unchanged: { id: string; title: string; summary: string; citations: Citation[] }[];
}

const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const REVISION = /^[a-f0-9]{40}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (!allowed.includes(value as T)) throw new Error(`${label} must be one of ${allowed.join(", ")}`);
  return value as T;
}

function ids(value: unknown, label: string, known: Set<string>): string[] {
  const items = list(value, label).map((item) => text(item, label));
  if (!items.length || new Set(items).size !== items.length) throw new Error(`${label} must be a non-empty list without duplicates`);
  for (const item of items) if (!known.has(item)) throw new Error(`${label} references unknown ${item}`);
  return items;
}

export function uniqueIds<T extends { id: string }>(items: T[], label: string): Set<string> {
  const seen = new Set<string>();
  for (const { id } of items) {
    if (!ID.test(id) || seen.has(id)) throw new Error(`${label} id ${id} is malformed or duplicated`);
    seen.add(id);
  }
  return seen;
}

export function citation(value: unknown, label: string): Citation {
  const c = object(value, label);
  const repo = text(c.repo, `${label}.repo`), revision = text(c.revision, `${label}.revision`), path = text(c.path, `${label}.path`), quote = text(c.quote, `${label}.quote`);
  if (!REPO.test(repo) || !REVISION.test(revision)) throw new Error(`${label} needs an owner/repo and an immutable 40-character revision`);
  if (path.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`${label}.path must be a relative file path`);
  if (!Number.isInteger(c.line) || (c.line as number) < 1) throw new Error(`${label}.line must be a positive integer`);
  if (!quote.trim() || quote.includes("\n")) throw new Error(`${label}.quote must be a non-empty single-line excerpt`);
  return { repo, revision, path, line: c.line as number, quote };
}

export function parseChangeRegister(raw: unknown): ChangeRegister {
  const root = object(raw, "register");
  if (root.schemaVersion !== 1) throw new Error("Unsupported change register schemaVersion");
  const target = object(root.target, "target");
  const scope = list(root.scope, "scope").map((item, i) => {
    const s = object(item, `scope[${i}]`);
    return { id: text(s.id, `scope[${i}].id`), title: text(s.title, `scope[${i}].title`), activation: oneOf(s.activation, ACTIVATIONS, `scope[${i}].activation`) };
  });
  const surfaces = list(root.surfaces, "surfaces").map((item, i) => {
    const s = object(item, `surfaces[${i}]`);
    return { id: text(s.id, `surfaces[${i}].id`), description: text(s.description, `surfaces[${i}].description`) };
  });
  const scopeIds = uniqueIds(scope, "scope"), surfaceIds = uniqueIds(surfaces, "surface");
  const changes = list(root.changes, "changes").map((item, i): Change => {
    const label = `changes[${i}]`, c = object(item, label);
    const citations = list(c.citations, `${label}.citations`).map((entry, j) => citation(entry, `${label}.citations[${j}]`));
    const basis = oneOf(c.basis, BASES, `${label}.basis`);
    // Anything other than a provisional claim must point at the code or document it rests on.
    if (!citations.length && basis !== "provisional") throw new Error(`${label} needs at least one citation unless provisional`);
    return {
      id: text(c.id, `${label}.id`), title: text(c.title, `${label}.title`), scope: ids(c.scope, `${label}.scope`, scopeIds),
      activation: oneOf(c.activation, ACTIVATIONS, `${label}.activation`), surfaces: ids(c.surfaces, `${label}.surfaces`, surfaceIds),
      compatibility: oneOf(c.compatibility, COMPATIBILITY, `${label}.compatibility`), basis,
      summary: text(c.summary, `${label}.summary`), affects: text(c.affects, `${label}.affects`), citations,
    };
  });
  uniqueIds(changes, "change");
  const used = new Set(changes.flatMap((c) => c.surfaces));
  const unused = surfaces.filter((s) => !used.has(s.id)).map((s) => s.id);
  if (unused.length) throw new Error(`Surfaces without any change: ${unused.join(", ")}`);
  const unchanged = (root.unchanged === undefined ? [] : list(root.unchanged, "unchanged")).map((item, i) => {
    const label = `unchanged[${i}]`, u = object(item, label);
    const citations = list(u.citations, `${label}.citations`).map((entry, j) => citation(entry, `${label}.citations[${j}]`));
    if (!citations.length) throw new Error(`${label} needs at least one citation`);
    return { id: text(u.id, `${label}.id`), title: text(u.title, `${label}.title`), summary: text(u.summary, `${label}.summary`), citations };
  });
  uniqueIds(unchanged, "unchanged");
  return { schemaVersion: 1, target, scope, surfaces, changes, unchanged };
}

export type SourceReader = (repo: string, revision: string, path: string) => Promise<string>;

/** Check every citation's quote still sits on its recorded line at the pinned revision. */
export async function verifyCitations(register: ChangeRegister, read: SourceReader): Promise<string[]> {
  return verifyQuotes([...register.changes, ...register.unchanged].flatMap((entry) => entry.citations.map((c): [string, Citation] => [entry.id, c])), read);
}

/** Read each pinned file once and report every labelled quote that is not on its recorded line. */
export async function verifyQuotes(citations: [string, Citation][], read: SourceReader): Promise<string[]> {
  const files = new Map<string, Promise<string[]>>();
  const failures: string[] = [];
  for (const [label, c] of citations) {
    const key = `${c.repo}@${c.revision}:${c.path}`;
    if (!files.has(key)) files.set(key, read(c.repo, c.revision, c.path).then((content) => content.split("\n")));
    const lines = await files.get(key)!;
    if (!lines[c.line - 1]?.includes(c.quote)) failures.push(`${label}: ${key}:${c.line} does not contain ${JSON.stringify(c.quote)}`);
  }
  return failures;
}

/** Changes per surface, for the boundary and classification registers that consume this vocabulary. */
export function changesBySurface(register: ChangeRegister): Record<string, string[]> {
  return Object.fromEntries(register.surfaces.map((s) => [s.id, register.changes.filter((c) => c.surfaces.includes(s.id)).map((c) => c.id)]));
}
