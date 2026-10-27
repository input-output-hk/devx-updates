import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseBoundaryRegister, statusSummary, verifyBoundarySources, worstStatus } from "./boundary";
import { parseChangeRegister } from "./dijkstra";

const changes = parseChangeRegister(JSON.parse(readFileSync("content/readiness/dijkstra/changes.json", "utf8")));
const revision = "b".repeat(40);
const source = (quote: string) => ({ kind: "source", repo: "txpipe/pallas", revision, path: "n2c.rs", line: 2, quote });
const tracker = () => ({ kind: "tracker", url: "https://github.com/txpipe/pallas/pull/800", title: "feat(traverse): decode the Dijkstra era", state: "merged", date: "2026-09-24" });
const base = () => ({
  schemaVersion: 1, retrieved: "2026-10-19", method: ["m"],
  components: [{
    id: "pallas", repo: "txpipe/pallas", roles: ["ledger-codec", "network-client"], surfaces: ["node-to-client-protocol", "block-encoding"],
    observed: { branch: "main", revision, date: "2026-10-15", release: { tag: "v1.4.0", date: "2026-09-17" } },
    dependsOn: [] as { component: string; version: string }[],
    assessments: [
      { surfaces: ["node-to-client-protocol"], status: "released", summary: "V23", releasedIn: { tag: "v0.35.1", date: "2026-05-05" }, evidence: [source("const PROTOCOL_V23: u64 = 32791;")] } as Record<string, unknown>,
      { surfaces: ["block-encoding"], status: "in-progress", summary: "traverse", evidence: [tracker()] as unknown[] },
    ],
  }],
});

test("the retained boundary register is valid against the change register and names catalog tools", () => {
  const register = parseBoundaryRegister(JSON.parse(readFileSync("content/readiness/dijkstra/boundary.json", "utf8")), changes);
  const stored = JSON.parse(readFileSync("data/readiness/snapshot.json", "utf8"));
  const catalog = new Set((stored.snapshot.tools as { id: string }[]).map((t) => t.id));
  for (const c of register.components) assert.ok(catalog.has(c.id), `${c.id} is a catalog tool`);
  const summary = statusSummary(register);
  assert.equal(Object.values(summary).flat().length, register.components.length);
});

test("the boundary register rejects unsupported statuses and unknown references", () => {
  assert.doesNotThrow(() => parseBoundaryRegister(base(), changes));
  const mutate = (edit: (r: ReturnType<typeof base>) => void) => { const r = base(); edit(r); return r; };
  const invalid: [string, ReturnType<typeof base>, RegExp][] = [
    ["surface outside the change register", mutate((r) => { r.components[0].surfaces.push("wallet-ui"); }), /unknown wallet-ui/],
    ["assessment outside the component", mutate((r) => { r.components[0].assessments[1].surfaces = ["cardano-cli"]; }), /unknown cardano-cli/],
    ["unassessed surface", mutate((r) => { r.components[0].surfaces.push("era-identity"); }), /unassessed surfaces: era-identity/],
    ["claim without evidence", mutate((r) => { r.components[0].assessments[1].evidence = []; }), /needs evidence for status in-progress/],
    ["release claim without a release", mutate((r) => { delete r.components[0].assessments[0].releasedIn; }), /needs releasedIn/],
    ["tracker outside GitHub", mutate((r) => { (r.components[0].assessments[1] as { evidence: { url: string }[] }).evidence[0].url = "https://example.com/1"; }), /GitHub issue or pull request/],
    ["unknown status", mutate((r) => { r.components[0].assessments[1].status = "done"; }), /status must be one of/],
    ["unknown dependency", mutate((r) => { r.components[0].dependsOn.push({ component: "nowhere", version: "1" }); }), /unknown component nowhere/],
    ["mutable observed revision", mutate((r) => { r.components[0].observed.revision = "main"; }), /40-character commit/],
  ];
  for (const [name, register, error] of invalid) assert.throws(() => parseBoundaryRegister(register, changes), error, name);
  assert.doesNotThrow(() => parseBoundaryRegister(mutate((r) => { r.components[0].assessments[1] = { surfaces: ["block-encoding"], status: "no-evidence", summary: "none", evidence: [] }; }), changes), "absence needs no evidence");
});

test("a component is only as ready as its worst surface, and sources are re-read", async () => {
  const register = parseBoundaryRegister(base(), changes);
  assert.equal(worstStatus(register.components[0]), "in-progress");
  assert.equal(worstStatus(register.components[0], "node-to-client-protocol"), "released");
  assert.deepEqual(statusSummary(register)["in-progress"], ["pallas"]);
  const read = async () => "x\nconst PROTOCOL_V23: u64 = 32791;\n";
  assert.deepEqual(await verifyBoundarySources(register, read), []);
  assert.match((await verifyBoundarySources(register, async () => "moved"))[0], /^pallas: txpipe\/pallas@b{40}:n2c.rs:2 does not contain/);
});

test("first releases accompany a confirmed release and are never empty", () => {
  const lines = [{ tag: "v0.35.1", date: "2026-05-05" }, { tag: "v1.0.0", date: "2026-05-11" }];
  const withFirsts = (firsts: unknown) => {
    const raw = base();
    raw.components[0].assessments[0].firstReleases = firsts;
    return raw;
  };
  assert.deepEqual(parseBoundaryRegister(withFirsts(lines), changes).components[0].assessments[0].firstReleases, lines);
  assert.throws(() => parseBoundaryRegister(withFirsts([]), changes), /must not be empty/);
  const unreleased = withFirsts(lines);
  Object.assign(unreleased.components[0].assessments[0], { status: "in-progress" });
  delete unreleased.components[0].assessments[0].releasedIn;
  assert.throws(() => parseBoundaryRegister(unreleased, changes), /needs releasedIn alongside firstReleases/);
});
