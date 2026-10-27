import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { Graph } from "../map-types";
import { canonical, finalize, inventory } from "./core";
import { resolveNative } from "./adapters";
import { mergeResolution, writeJson } from "./store";
import { compareSnapshots } from "./comparison";
import { readComparison } from "./comparison-storage";
import { calculateImpact } from "./impact";
import { investigationProjects, summarizeWork, workReport } from "./work";
import { buildSiteReports } from "./site-reports";
import { createReportLoader, loadImpactDetails } from "./report-loader";
import { detailShard } from "./report-contract";
import type { ImpactDetail, ReportReference, Reports } from "./report-contract";

function fixture() {
  const snapshot = inventory({ nodes: [{ id: "consumer", name: "Consumer", team: "Team", repo: null }, { id: "unresolved", name: "Unresolved", team: "Team", repo: null }] } as Graph, "catalog");
  snapshot.evidence.push({ id: "evidence:fixture", digest: "fixture", path: "fixture", description: "Fixture" });
  mergeResolution(snapshot, resolveNative({ lockfileVersion: 3, packages: {
    "": { name: "consumer", version: "1", dependencies: { shared: "1" } },
    "node_modules/shared": { version: "1", resolved: "https://registry.npmjs.org/shared/-/shared-1.tgz" },
  } }, { toolId: "consumer", adapter: "npm-lock", release: "v1", revision: "a".repeat(40), platform: "all", features: [], command: "read lock", toolchain: "npm", origin: "source-reconstruction", rootNames: ["consumer"] }, { native: "evidence:fixture", configuration: "evidence:fixture" }));
  return finalize(snapshot);
}

test("compressed comparisons preserve all records and static report identity with legacy support", () => {
  const directory = mkdtempSync(join(tmpdir(), "readiness-comparison-"));
  try {
    const snapshot = fixture();
    const before = finalize({ ...snapshot, artifacts: [], occurrences: [], edges: [], profiles: [] });
    const comparison = compareSnapshots(before, snapshot);
    assert.ok(comparison.relationships.length > 0);
    const plain = join(directory, "changes.json"), compressed = `${plain}.gz`;
    assert.equal(readComparison(directory, snapshot.semanticDigest), null);
    writeJson(plain, comparison);
    assert.deepEqual(readComparison(directory, snapshot.semanticDigest), comparison);
    writeJson(compressed, comparison);
    assert.deepEqual(gunzipSync(readFileSync(compressed)), readFileSync(plain));
    assert.throws(() => readComparison(directory, snapshot.semanticDigest), /Both changes/);
    unlinkSync(plain);
    const loaded = readComparison(directory, snapshot.semanticDigest);
    assert.deepEqual(loaded, comparison);
    assert.equal(readComparison(directory, "stale-snapshot"), null);
    const impacts = calculateImpact(snapshot);
    assert.deepEqual(buildSiteReports(snapshot, impacts, [], loaded), buildSiteReports(snapshot, impacts, [], comparison));
    const bytes = readFileSync(compressed);
    writeJson(compressed, comparison);
    assert.deepEqual(readFileSync(compressed), bytes, "repeat writes have deterministic gzip bytes");
    writeFileSync(compressed, bytes.subarray(0, bytes.length - 5));
    assert.throws(() => readComparison(directory, snapshot.semanticDigest), /unexpected end|buffer/i);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("static report partitions preserve full reach, paths, root-only projects, work and comparison", () => {
  const snapshot = fixture(), original = canonical(snapshot), impacts = calculateImpact(snapshot);
  const comparison = compareSnapshots(snapshot, snapshot);
  const { manifest, files } = buildSiteReports(snapshot, impacts, [], comparison);
  const read = <K extends keyof Reports>(key: K) => files.get(manifest.reports[key].file)!.data as Reports[K];
  const readDetail = (id: string) => (files.get(manifest.details[detailShard(id)].file)!.data as Record<string, ImpactDetail>)[id];
  assert.deepEqual(read("impacts").map(({ artifact, ...row }) => { void artifact; return { ...row, paths: readDetail(row.artifactId).paths }; }), impacts);
  const projects = investigationProjects(snapshot, impacts);
  assert.deepEqual(read("projects").map(({ artifact, ...row }) => { void artifact; return { ...row, paths: readDetail(row.artifactId).paths }; }), projects.map((p) => p.impact));
  assert.ok(read("projects").some((row) => !readDetail(row.artifactId).explainedPaths.length), "zero-reach roots survive partitioning");
  const path = readDetail(impacts[0].artifactId).explainedPaths[0];
  assert.deepEqual(path.labels, ["consumer@1", "shared@1"]);
  assert.equal(path.release, "v1"); assert.equal(path.platform, "all");
  assert.equal(path.profileId, snapshot.profiles[0].id);
  assert.deepEqual({ ...read("queue"), investigations: read("investigations") }, summarizeWork(workReport(snapshot)));
  assert.deepEqual(read("comparison"), comparison);
  for (const [file, envelope] of files) {
    assert.equal(envelope.digest, createHash("sha256").update(JSON.stringify(envelope.data)).digest("hex"));
    assert.ok(file.endsWith(`${envelope.digest}.json`));
  }
  assert.equal(canonical(snapshot), original, "build must not mutate retained evidence");
});

test("report identity tracks authored work and comparison independently of the graph", () => {
  const snapshot = fixture(), impacts = calculateImpact(snapshot), original = buildSiteReports(snapshot, impacts, [], null);
  const work = workReport(snapshot);
  const assigned = buildSiteReports(snapshot, impacts, [{ taskId: work.investigations[0].taskId, owner: "Owner", issueUrl: null, nextAction: "Check workflow" }], null);
  assert.notDeepEqual(original.manifest.reports.investigations, assigned.manifest.reports.investigations);
  assert.deepEqual(original.manifest.reports.impacts, assigned.manifest.reports.impacts);
  assert.deepEqual(original.manifest.details, assigned.manifest.details);
  const compared = buildSiteReports(snapshot, impacts, [], compareSnapshots(snapshot, snapshot));
  assert.notDeepEqual(original.manifest.reports.comparison, compared.manifest.reports.comparison);
  assert.equal(original.manifest.hasComparison, false); assert.equal(compared.manifest.hasComparison, true);
});

test("browser loader deduplicates concurrent requests, honors basePath and rejects mismatched deployments", async () => {
  const calls: string[] = [];
  let fail = true;
  const load = createReportLoader(async (url) => {
    calls.push(String(url));
    return Response.json({ schemaVersion: 1, digest: fail ? "old" : "new", data: ["retained"] });
  });
  const reference = { file: "impacts-new.json", digest: "new" };
  const first = load(reference, "/devx-updates");
  assert.equal(load(reference, "/devx-updates"), first);
  await assert.rejects(first, /does not match/);
  fail = false;
  assert.deepEqual(await load(reference, "/devx-updates"), ["retained"]);
  await load(reference, "/devx-updates");
  assert.equal(calls.length, 2);
  assert.ok(calls.every((url) => url === "/devx-updates/map/readiness/data/impacts-new.json"));
  await load(reference, "");
  assert.equal(calls[2], "/map/readiness/data/impacts-new.json");
});

test("HTTP errors and invalid JSON are retryable, and exports reject missing path records", async () => {
  let attempt = 0;
  const load = createReportLoader(async () => {
    attempt++;
    return attempt === 1 ? new Response("not found", { status: 404 }) : attempt === 2 ? new Response("<html>wrong</html>") : Response.json({ schemaVersion: 1, digest: "ok", data: {} });
  });
  const reference = { file: "paths-ok.json", digest: "ok" };
  await assert.rejects(load(reference), /HTTP 404/);
  await assert.rejects(load(reference), SyntaxError);
  assert.deepEqual(await load(reference), {});
  await assert.rejects(loadImpactDetails(["missing"], Array(32).fill(reference), load), /paths are missing/);
});

test("path export requests only relevant shards once and never resolves a partial result", async () => {
  const references: ReportReference[] = Array.from({ length: 32 }, (_, i) => ({ file: String(i), digest: String(i) }));
  const ids = Array.from({ length: 200 }, (_, i) => `artifact:${i}`);
  let active = 0, peak = 0;
  const calls: string[] = [];
  const load = async <T>(reference: ReportReference): Promise<T> => {
    calls.push(reference.file); active++; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1)); active--;
    return Object.fromEntries(ids.filter((id) => detailShard(id) === Number(reference.file)).map((id) => [id, { paths: {}, explainedPaths: [] }])) as T;
  };
  const result = await loadImpactDetails(ids, references, load);
  assert.equal(Object.keys(result).length, ids.length);
  assert.equal(calls.length, new Set(ids.map(detailShard)).size);
  assert.ok(peak <= 4);
  const fail = async <T>(): Promise<T> => { throw new Error("offline"); };
  await assert.rejects(loadImpactDetails(ids, references, fail), /offline/);
});
