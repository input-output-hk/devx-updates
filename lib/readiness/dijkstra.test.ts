import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { changesBySurface, parseChangeRegister, verifyCitations } from "./dijkstra";

const revision = "a".repeat(40);
const cite = (line: number, quote: string) => ({ repo: "IntersectMBO/cardano-ledger", revision, path: "eras/dijkstra.cddl", line, quote });
const base = () => ({
  schemaVersion: 1,
  target: { name: "Dijkstra" },
  scope: [{ id: "cip-0176", title: "Non-segregated block body", activation: "pv12" }],
  surfaces: [{ id: "block-encoding", description: "Block CBOR" }],
  changes: [{
    id: "block-body", title: "Block body", scope: ["cip-0176"], activation: "pv12", surfaces: ["block-encoding"],
    compatibility: "decode-break", basis: "source-verified", summary: "s", affects: "a", citations: [cite(2, "block = [header, block_body]")],
  }],
});

test("the retained Dijkstra register is well-formed and covers every surface", () => {
  const register = parseChangeRegister(JSON.parse(readFileSync("content/readiness/dijkstra/changes.json", "utf8")));
  assert.ok(register.changes.length > 0);
  for (const [surface, changes] of Object.entries(changesBySurface(register))) assert.ok(changes.length, `${surface} has changes`);
  for (const change of register.changes) assert.ok(change.citations.length, `${change.id} is cited`);
});

test("the register rejects open vocabularies, unpinned citations and unsupported claims", () => {
  assert.doesNotThrow(() => parseChangeRegister(base()));
  const mutate = (edit: (r: ReturnType<typeof base>) => void) => { const r = base(); edit(r); return r; };
  const invalid: [string, ReturnType<typeof base>, RegExp][] = [
    ["unknown surface", mutate((r) => { r.changes[0].surfaces = ["wallet-ui"]; }), /unknown wallet-ui/],
    ["unknown scope", mutate((r) => { r.changes[0].scope = ["cip-9999"]; }), /unknown cip-9999/],
    ["branch name as revision", mutate((r) => { r.changes[0].citations[0].revision = "master"; }), /immutable/],
    ["path traversal", mutate((r) => { r.changes[0].citations[0].path = "../secrets"; }), /relative file path/],
    ["multi-line quote", mutate((r) => { r.changes[0].citations[0].quote = "a\nb"; }), /single-line/],
    ["uncited verified claim", mutate((r) => { r.changes[0].citations = []; }), /citation/],
    ["unknown activation", mutate((r) => { r.changes[0].activation = "soon"; }), /activation/],
    ["duplicate change", mutate((r) => { r.changes.push({ ...r.changes[0] }); }), /duplicated/],
    ["unused surface", mutate((r) => { r.surfaces.push({ id: "cardano-cli", description: "cli" }); }), /without any change: cardano-cli/],
  ];
  for (const [name, register, error] of invalid) assert.throws(() => parseChangeRegister(register), error, name);
  assert.doesNotThrow(() => parseChangeRegister(mutate((r) => { r.changes[0].basis = "provisional"; r.changes[0].citations = []; })), "provisional claims may await citations");
  const unchanged = (citations: unknown[]) => mutate((r) => { Object.assign(r, { unchanged: [{ id: "n2n", title: "Node-to-node", summary: "Same versions.", citations }] }); });
  assert.equal(parseChangeRegister(unchanged([base().changes[0].citations[0]])).unchanged[0].id, "n2n");
  assert.throws(() => parseChangeRegister(unchanged([])), /unchanged\[0\] needs at least one citation/, "an absence of change is cited too");
});

test("citation verification reads each pinned file once and reports moved or missing quotes", async () => {
  const register = parseChangeRegister(mutate());
  const reads: string[] = [];
  const read = async (repo: string, rev: string, path: string) => { reads.push(`${repo}@${rev}:${path}`); return "; header\nblock = [header, block_body]\n"; };
  assert.deepEqual(await verifyCitations(register, read), []);
  assert.equal(reads.length, 1);
  const moved = parseChangeRegister(mutate((r) => { r.changes[0].citations[0].line = 1; }));
  assert.match((await verifyCitations(moved, read))[0], /block-body: .*:1 does not contain/);
  function mutate(edit: (r: ReturnType<typeof base>) => void = () => {}) {
    const r = base(); r.changes[0].citations.push(cite(2, "block_body]")); edit(r); return r;
  }
});
