import { compareSnapshots } from "../../lib/readiness/comparison";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import type { Graph } from "../../lib/map-types";
import { finalize, inventory, object } from "../../lib/readiness/core";
import { parseNativeInput, resolveNative } from "../../lib/readiness/adapters";
import { discover, github } from "../../lib/readiness/discovery";
import { githubSource } from "../../lib/readiness/source";
import { collect, refreshNative } from "../../lib/readiness/collect";
import { calculateImpact } from "../../lib/readiness/impact";
import { acquireLock, addEvidence, mergeResolution, readJson, readSnapshot, Store, writeJson } from "../../lib/readiness/store";
import { exportPacket, importReview, reconcileReviewQueue, type ReviewQueueEntry } from "../../lib/readiness/review";
import { rebuildNative } from "../../lib/readiness/rebuild";
import { replaySnapshot } from "../../lib/readiness/replay";
import { COLLECT_ADAPTERS, ECOSYSTEMS, NATIVE_ADAPTERS, type CollectAdapter } from "../../lib/readiness/types";
import { collectionCandidates } from "../../lib/readiness/candidates";
import { gradleConfigurations } from "../../lib/readiness/gradle-selection";
import { collectBatch } from "../../lib/readiness/batch";
import { readGitSnapshot } from "../../lib/readiness/snapshot-history";
import { capabilityRows } from "../../lib/readiness/capabilities";
import { investigationProjects, parseAssignments, summarizeWork, workReport } from "../../lib/readiness/work";
import { scanIntegrations } from "../../lib/readiness/integration-scan";
import { changesBySurface, parseChangeRegister, verifyCitations, type ChangeRegister } from "../../lib/readiness/dijkstra";
import { parseBoundaryRegister, statusSummary, verifyBoundarySources, type BoundaryRegister } from "../../lib/readiness/boundary";
import { classifyCatalog, reclassifyCatalog, type ClassificationRegister } from "../../lib/readiness/surface-collect";
import { leadCoverage, parseLeadRegister, verifyLeadSources } from "../../lib/readiness/leads";
import { collectTransitive, type TransitiveRegister } from "../../lib/readiness/transitive";
import { unlockReport, unlocksOf, toolBlockers } from "../../lib/readiness/unlocks";
import { parseUpgradeRegister, upgradeCoverage, verifyUpgradeSources } from "../../lib/readiness/upgrades";
import { targetVersions } from "../../lib/readiness/surfaces";
import { devnetConsistency, parseDevnetRegister } from "../../lib/readiness/devnet";
import { loadTracking, parseTrackingState, syncTracking } from "../../lib/readiness/tracking";

const { positionals, values } = parseArgs({ allowPositionals: true, options: {
  directory: { type: "string", default: "data/readiness" },
  state: { type: "string", default: ".readiness" },
  catalog: { type: "string", default: "data/cardano-graph.json" },
  assignments: { type: "string", default: "content/readiness/work-assignments.json" },
  tools: { type: "string" }, component: { type: "string" }, limit: { type: "string" }, refresh: { type: "boolean" },
  profile: { type: "string" }, input: { type: "string" }, output: { type: "string" }, before: { type: "string" },
  tool: { type: "string" }, adapter: { type: "string" }, roots: { type: "string" }, path: { type: "string" }, platform: { type: "string" },
  packet: { type: "string" }, decisions: { type: "string" },
  "before-ref": { type: "string" },
  "root-paths": { type: "string" },
  configurations: { type: "string" },
  "python-version": { type: "string" }, packages: { type: "string" }, tags: { type: "string" },
  "verify-sources": { type: "boolean" }, reclassify: { type: "boolean" },
} });

const store = new Store(resolve(values.directory!));
function required(key: "profile" | "input" | "output" | "before") {
  const value = values[key]; if (!value) throw new Error(`--${key} is required`); return value;
}

/** The devnet register, its subjects checked against the change, boundary and classification registers. */
function loadDevnet(changes: ChangeRegister, boundary: BoundaryRegister) {
  const { tools } = readJson("content/readiness/dijkstra/classification.json") as ClassificationRegister;
  return parseDevnetRegister(readJson("content/readiness/dijkstra/devnet.json"), {
    changes: new Set(changes.changes.map((c) => c.id)), components: new Set(boundary.components.map((c) => c.id)), tools: new Set(tools.map((t) => t.id)),
  });
}

async function main() {
  const command = positionals[0] ?? "help";
  if (command === "help") {
    console.log(`Readiness collection (all output remains local)

inventory       Create or reconcile coverage for every catalog tool
discover        Discover pinned source and manifests via gh (resumes by default)
                --tools id,id --limit N --refresh
import-native   --profile profile.json --input native-output.json
collect         --tool id --adapter <collector> --roots package,package
                --platform target [--path manifest-path] [--refresh]
                npm-lock: --root-paths workspace/path,workspace/path ('.' = lock root)
                gradle-resolution: --configurations selection.json --platform amd64-Linux
                uv-tree: --python-version 3.13; go-packages: --packages ./... --tags tag,tag
refresh-native  Refresh registered collection profiles against discovered source revisions
                --tools id,id --limit N --refresh (limit counts distinct requests)
collect-batch   --input batch.json [--tools id,id] [--limit N] [--refresh]
                Persist pinned requests and resume unfinished native collections
report          Emit coverage, impact and work queues (--assignments path.json)
show            --tool id (coverage, manifests, and profiles)
candidates      List supported collection starting points, including nested workspaces [--tools id,id]
validate        Validate snapshot, references, semantic digest, and evidence checksums
compact-storage Rewrite snapshot storage as verified JSON chunks without changing graph data
export-snapshot --output snapshot.json (self-contained graph for comparison or backup)
replay          Reconstruct native graphs and manual findings from retained evidence/packets
rebuild-native  Upgrade native graph records using retained inputs (no network)
capture-source  --tool id --path source-file (retain pinned source for citations)
scan-integrations [--tools id,id] [--output report.json] (lexical leads from retained source)
export-review   --tools id,id --output .readiness/reviews/name
import-review   --packet packet.json --input result.json [--decisions decisions.json]
diff            --before old-snapshot.json | --before-ref git-ref [--output changes.json.gz]
check-changes   [--input content/readiness/dijkstra/changes.json] [--verify-sources]
check-boundary  [--input content/readiness/dijkstra/boundary.json] [--verify-sources]
classify-surfaces [--tools a,b] [--output content/readiness/dijkstra/classification.json] [--state .readiness] [--reclassify]
transitive      [--tools a,b] [--output content/readiness/dijkstra/transitive.json]
                Boundary components reached only through lockfiles; merged by classify-surfaces --reclassify
check-leads     [--input content/readiness/dijkstra/leads.json] [--verify-sources]
check-upgrades  [--verify-sources]
                Own era handling of every bump-ready tool (content/readiness/dijkstra/upgrades.json)
check-devnet    Devnet results (content/readiness/dijkstra/devnet.json): subjects, recipes, and the boundary evidence citing them
sync-tracking   Read the title and open/merged/closed state of every GitHub link in
                content/readiness/dijkstra/tracking.yaml via gh (read-only) into tracking-state.json
unlocks         [--component scalus[,cardano-js-sdk]] [--output content/readiness/dijkstra/unlocks.json]
                What a fix in one component unlocks, directly and through other components
                Validate the hardfork change register; optionally re-read every cited quote via gh

Common options: --directory data/readiness --state .readiness --catalog data/cardano-graph.json
Native adapters: ${NATIVE_ADAPTERS.join(", ")}.
Runnable collectors: ${COLLECT_ADAPTERS.join(", ")}.`);
    return;
  }
  if (command === "inventory") {
    const catalog = readJson(values.catalog!) as Graph;
    const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const next = inventory(catalog, revision);
    if (existsSync(join(store.directory, "snapshot.json"))) {
      const previous = store.load();
      // Removed roots need explicit archival rather than silently orphaning their graph.
      if (previous.tools.some((t) => !next.tools.some((n) => n.id === t.id))) throw new Error("Catalog removed tools; archive the previous snapshot and reconcile removals explicitly.");
      for (const tool of next.tools) {
        const existing = previous.tools.find((t) => t.id === tool.id);
        if (existing) {
          const changedSource = existing.catalogRepo !== undefined && existing.catalogRepo !== tool.catalogRepo;
          Object.assign(tool, existing, { name: tool.name, maintainer: tool.maintainer, catalogRepo: tool.catalogRepo, registryHint: tool.registryHint, packageHint: tool.packageHint, ...(changedSource ? { repo: tool.repo } : {}) });
        }
      }
      Object.assign(next, { profiles: previous.profiles, artifacts: previous.artifacts, occurrences: previous.occurrences, edges: previous.edges, evidence: previous.evidence, decisions: previous.decisions, ...(previous.collections ? { collections: previous.collections } : {}) });
      if (previous.capabilities) next.capabilities = previous.capabilities;
      if (previous.capabilityDecisions) next.capabilityDecisions = previous.capabilityDecisions;
      if (previous.reviewSubmissions) next.reviewSubmissions = previous.reviewSubmissions;
      if (previous.catalogDigest === next.catalogDigest) next.catalogRevision = previous.catalogRevision;
    }
    store.save(next);
    console.log(`Accounted for ${next.tools.length} tools; catalog ${next.catalogDigest.slice(0, 12)}`);
    return;
  }
  if (command === "check-changes") {
    const register = parseChangeRegister(readJson(values.input ?? "content/readiness/dijkstra/changes.json"));
    const failures = values["verify-sources"] ? await verifyCitations(register, (repo, revision, path) => githubSource(repo, revision, path)) : [];
    for (const failure of failures) console.error(failure);
    if (failures.length) throw new Error(`${failures.length} citations no longer match their pinned sources`);
    const citations = register.changes.reduce((sum, c) => sum + c.citations.length, 0);
    console.log(JSON.stringify({ changes: register.changes.length, citations, sourcesVerified: Boolean(values["verify-sources"]), bySurface: changesBySurface(register) }, null, 2));
    return;
  }
  if (command === "check-boundary") {
    const changes = parseChangeRegister(readJson("content/readiness/dijkstra/changes.json"));
    const register = parseBoundaryRegister(readJson(values.input ?? "content/readiness/dijkstra/boundary.json"), changes);
    const failures = values["verify-sources"] ? await verifyBoundarySources(register, (repo, revision, path) => githubSource(repo, revision, path)) : [];
    for (const failure of failures) console.error(failure);
    if (failures.length) throw new Error(`${failures.length} citations no longer match their pinned sources`);
    const devnet = loadDevnet(changes, register);
    const inconsistent = devnetConsistency(register, devnet);
    for (const problem of inconsistent) console.error(problem);
    if (inconsistent.length) throw new Error(`${inconsistent.length} assessments disagree with the devnet register`);
    const evidence = register.components.reduce((sum, c) => sum + c.assessments.reduce((n, a) => n + a.evidence.length, 0), 0);
    console.log(JSON.stringify({ components: register.components.length, evidence, sourcesVerified: Boolean(values["verify-sources"]), byWorstStatus: statusSummary(register) }, null, 2));
    return;
  }
  if (command === "classify-surfaces") {
    const changes = parseChangeRegister(readJson("content/readiness/dijkstra/changes.json"));
    const boundary = parseBoundaryRegister(readJson("content/readiness/dijkstra/boundary.json"), changes);
    const output = values.output ?? "content/readiness/dijkstra/classification.json";
    const transitiveFile = "content/readiness/dijkstra/transitive.json";
    const transitive = existsSync(transitiveFile) ? (readJson(transitiveFile) as TransitiveRegister).links : undefined;
    if (values.reclassify) {
      // Same revisions, current rules and registers: keeps lead decisions valid.
      const register = await reclassifyCatalog(readJson(output) as ClassificationRegister, boundary, changes, { stateDir: values.state!, log: (line) => console.error(line), transitive });
      writeFileSync(output, `${JSON.stringify(register, null, 1)}\n`);
      console.log(JSON.stringify({ tools: register.tools.length, byExposure: register.summary, reclassified: true }));
      return;
    }
    const wanted = values.tools?.split(",");
    const tools = store.load().tools.filter((t) => !wanted || wanted.includes(t.id));
    if (wanted && tools.length !== wanted.length) throw new Error("--tools names an unknown tool");
    const register = await classifyCatalog(tools.map((t) => ({ id: t.id, repo: t.repo })), boundary, changes, { stateDir: values.state!, log: (line) => console.error(line), transitive });
    writeFileSync(output, `${JSON.stringify(register, null, 1)}\n`);
    console.log(JSON.stringify({ tools: register.tools.length, byExposure: register.summary }));
    return;
  }
  if (command === "transitive") {
    // Lockfiles at the classified revisions; run classify-surfaces --reclassify afterwards to merge the links.
    const output = values.output ?? "content/readiness/dijkstra/transitive.json";
    const classification = readJson("content/readiness/dijkstra/classification.json") as ClassificationRegister;
    const links = await collectTransitive(classification, { tools: values.tools?.split(","), log: (line) => console.error(line) });
    const previous = values.tools && existsSync(output) ? (readJson(output) as TransitiveRegister).links.filter((l) => !values.tools!.split(",").includes(l.tool)) : [];
    const register: TransitiveRegister = {
      schemaVersion: 1, generatedAt: new Date().toISOString(),
      method: [
        "Lockfiles committed at each tool's classified revision (package-lock, npm-shrinkwrap, pnpm-lock, yarn.lock, bun.lock, Cargo.lock, go.sum, poetry.lock, uv.lock, gradle.lockfile, packages.lock.json; test, example and vendored paths excluded) are read for packages of boundary components.",
        "A component the tool already declares in a manifest is not repeated. npm lockfile entries marked dev are skipped; other formats do not mark development-only packages, so the lead decision settles whether shipped code reaches the component.",
        "Each link is merged into classification.json as a shipped dependency hit of rule transitive:<component> and inherits the component's readiness like a direct dependency.",
      ],
      links: [...previous, ...links].sort((a, b) => (a.tool < b.tool ? -1 : a.tool > b.tool ? 1 : a.component < b.component ? -1 : 1)),
    };
    writeFileSync(output, `${JSON.stringify(register, null, 1)}\n`);
    console.log(JSON.stringify({ links: register.links.length, tools: new Set(register.links.map((l) => l.tool)).size }));
    return;
  }
  if (command === "unlocks") {
    const changes = parseChangeRegister(readJson("content/readiness/dijkstra/changes.json"));
    const boundary = parseBoundaryRegister(readJson("content/readiness/dijkstra/boundary.json"), changes);
    const leads = parseLeadRegister(readJson("content/readiness/dijkstra/leads.json"), changes);
    const { tools } = readJson("content/readiness/dijkstra/classification.json") as ClassificationRegister;
    if (values.component) {
      const fixes = values.component.split(",");
      for (const id of fixes) if (!boundary.components.some((c) => c.id === id) && !leads.leads.some((l) => l.via === id)) throw new Error(`Unknown component ${id}`);
      console.log(JSON.stringify(unlocksOf(fixes, toolBlockers(tools, leads, boundary), tools), null, 2));
      return;
    }
    const report = unlockReport(tools, leads, boundary, new Set(targetVersions(changes).keys()));
    writeFileSync(values.output ?? "content/readiness/dijkstra/unlocks.json", `${JSON.stringify(report, null, 1)}\n`);
    console.log(JSON.stringify({ bumpReady: report.bumpReady.map((t) => t.tool), components: report.components.map((c) => `${c.component}: ${c.unlocks.length} unlocked, ${c.partial.length} partial, ${c.downstream.length} downstream`) }, null, 2));
    return;
  }
  if (command === "check-upgrades") {
    const register = parseUpgradeRegister(readJson("content/readiness/dijkstra/upgrades.json"));
    const { tools } = readJson("content/readiness/dijkstra/classification.json") as ClassificationRegister;
    const { bumpReady } = readJson("content/readiness/dijkstra/unlocks.json") as { bumpReady: { tool: string }[] };
    const failures = values["verify-sources"] ? await verifyUpgradeSources(register, (repo, revision, path) => githubSource(repo, revision, path)) : [];
    for (const failure of failures) console.error(failure);
    if (failures.length) throw new Error(`${failures.length} upgrade citations no longer match their pinned sources`);
    const coverage = upgradeCoverage(register, bumpReady.map((b) => b.tool), new Map(tools.map((t) => [t.id, t.revision])));
    const byHandling = Object.fromEntries(register.upgrades.map((u) => u.eraHandling).map((h, _, all) => [h, all.filter((x) => x === h).length]));
    console.log(JSON.stringify({ upgrades: register.upgrades.length, sourcesVerified: Boolean(values["verify-sources"]), byHandling, ...coverage }, null, 2));
    if (coverage.orphaned.length) throw new Error(`Upgrades match no classified tool: ${coverage.orphaned.join(", ")}`);
    return;
  }
  if (command === "check-devnet") {
    const changes = parseChangeRegister(readJson("content/readiness/dijkstra/changes.json"));
    const boundary = parseBoundaryRegister(readJson("content/readiness/dijkstra/boundary.json"), changes);
    const devnet = loadDevnet(changes, boundary);
    const missing = [devnet.run.recipe, ...devnet.checks.flatMap((c) => c.recipe)].filter((path) => !existsSync(path));
    const inconsistent = devnetConsistency(boundary, devnet);
    for (const problem of [...missing.map((path) => `missing recipe ${path}`), ...inconsistent]) console.error(problem);
    const results = devnet.checks.flatMap((c) => c.results);
    console.log(JSON.stringify({ checks: devnet.checks.length, results: results.length, failing: results.filter((r) => r.outcome === "fail").map((r) => `${r.kind} ${r.id}${r.version ? ` ${r.version}` : ""}`) }, null, 2));
    if (missing.length || inconsistent.length) throw new Error("The devnet register does not match the recipe or the boundary register");
    return;
  }
  if (command === "sync-tracking") {
    const { tools } = readJson("content/readiness/dijkstra/classification.json") as ClassificationRegister;
    const register = loadTracking(readFileSync("content/readiness/dijkstra/tracking.yaml", "utf8"), new Set(tools.map((t) => t.id)));
    const output = "content/readiness/dijkstra/tracking-state.json";
    const previous = parseTrackingState(readJson(output));
    const { state, failures } = await syncTracking(register, previous, github, new Date().toISOString().slice(0, 10));
    writeFileSync(output, `${JSON.stringify(state, null, 1)}\n`);
    for (const failure of failures) console.error(failure);
    const byState = Object.values(state.links).reduce<Record<string, number>>((n, l) => ({ ...n, [l.state]: (n[l.state] ?? 0) + 1 }), {});
    console.log(JSON.stringify({ tools: register.size, dismissed: [...register.values()].filter((t) => t.dismissed).length, links: Object.keys(state.links).length, byState, failed: failures.length }, null, 2));
    if (failures.length) process.exitCode = 1;
    return;
  }
  if (command === "check-leads") {
    const changes = parseChangeRegister(readJson("content/readiness/dijkstra/changes.json"));
    const register = parseLeadRegister(readJson(values.input ?? "content/readiness/dijkstra/leads.json"), changes);
    const classification = readJson("content/readiness/dijkstra/classification.json") as ClassificationRegister;
    const failures = values["verify-sources"] ? await verifyLeadSources(register, (repo, revision, path) => githubSource(repo, revision, path)) : [];
    for (const failure of failures) console.error(failure);
    if (failures.length) throw new Error(`${failures.length} lead citations no longer match their pinned sources`);
    const boundary = parseBoundaryRegister(readJson("content/readiness/dijkstra/boundary.json"), changes);
    const coverage = leadCoverage(register, classification.tools, new Set(boundary.components.map((c) => c.id)));
    console.log(JSON.stringify({ leads: register.leads.length, sourcesVerified: Boolean(values["verify-sources"]), ...coverage }, null, 2));
    if (coverage.orphaned.length) throw new Error(`Leads match no classified gap: ${coverage.orphaned.join(", ")}`);
    return;
  }
  const snapshot = store.load();
  if (command === "discover") {
    const limit = values.limit === undefined ? undefined : Number(values.limit);
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) throw new Error("--limit must be a positive integer");
    await discover(snapshot, store, { stateDir: values.state!, toolIds: values.tools?.split(","), limit, refresh: values.refresh });
  } else if (command === "collect") {
    if (!values.tool || !values.roots || !values.platform || !(COLLECT_ADAPTERS as readonly unknown[]).includes(values.adapter)) throw new Error(`collect requires --tool, --adapter (${COLLECT_ADAPTERS.join(", ")}), --roots, and --platform`);
    await collect(snapshot, store, { toolId: values.tool, adapter: values.adapter as CollectAdapter, roots: values.roots.split(","), ...(values["root-paths"] !== undefined ? { rootPaths: values["root-paths"].split(",") } : {}), configurations: gradleConfigurations(values.configurations ? readJson(values.configurations) : undefined, values.adapter!), path: values.path, platform: values.platform, stateDir: values.state!, refresh: values.refresh, pythonVersion: values["python-version"], patterns: values.packages?.split(","), tags: values.tags?.split(",") });
  } else if (command === "collect-batch") {
    const summary = await collectBatch(snapshot, store, readJson(required("input")), { stateDir: values.state!, refresh: values.refresh, toolIds: values.tools?.split(","), limit: values.limit === undefined ? undefined : Number(values.limit) });
    console.log(JSON.stringify(summary));
    if (summary.failed || summary.deferred) process.exitCode = 1;
  } else if (command === "refresh-native") {
    const summary = await refreshNative(snapshot, store, values.state!, values.refresh, { toolIds: values.tools?.split(","), limit: values.limit === undefined ? undefined : Number(values.limit) });
    console.log(JSON.stringify(summary));
    if (summary.failed) process.exitCode = 1;
  } else if (command === "import-native") {
    const input = parseNativeInput(readJson(required("profile")));
    const raw = readJson(required("input"));
    const nativeEvidence = store.evidence(raw, `${input.adapter} for ${input.toolId} ${input.release}`);
    const profileEvidence = store.evidence(input, "Native collection profile and command");
    const result = resolveNative(raw, input, { native: nativeEvidence.id, configuration: profileEvidence.id });
    addEvidence(snapshot, nativeEvidence); addEvidence(snapshot, profileEvidence);
    mergeResolution(snapshot, result); store.save(snapshot);
    console.log(`Imported ${result.occurrences.length} occurrences and ${result.edges.length} edges; profile coverage ${result.profile.coverage}`);
  } else if (command === "report") {
    const assignments = parseAssignments(readJson(resolve(values.assignments!)));
    finalize(snapshot);
    const reviewPath = join(store.directory, "reviews.json");
    if (existsSync(reviewPath)) writeJson(reviewPath, reconcileReviewQueue(snapshot, readJson(reviewPath) as ReviewQueueEntry[]));
    const report = {
      snapshot: snapshot.semanticDigest,
      tools: snapshot.tools.length,
      discovered: snapshot.tools.filter((t) => t.lastSuccess).length,
      withProfiles: new Set(snapshot.profiles.map((p) => p.toolId)).size,
      profiles: snapshot.profiles.length,
      completeProfiles: snapshot.profiles.filter((p) => p.coverage === "complete").length,
      capabilityFindings: capabilityRows(snapshot),
      unresolvedTools: snapshot.tools.filter((t) => t.resolution === "unresolved").length,
      gaps: snapshot.tools.flatMap((tool) => tool.gaps.map((g) => ({ toolId: tool.id, ...g }))),
      ecosystemBacklog: Object.fromEntries(ECOSYSTEMS.map((ecosystem) => [ecosystem, snapshot.tools.filter((t) => t.ecosystems.includes(ecosystem)).length])),
    };
    writeJson(join(store.directory, "report.json"), report);
    const impacts = calculateImpact(snapshot);
    writeJson(join(store.directory, "impact.json"), impacts);
    const projects = investigationProjects(snapshot, impacts);
    writeJson(join(store.directory, "projects.json"), projects);
    writeJson(join(store.directory, "work.json"), summarizeWork(workReport(snapshot, assignments, projects)));
    writeJson(join(store.directory, "integration-scan.json"), scanIntegrations(snapshot, store));
    console.log(JSON.stringify({ ...report, gaps: report.gaps.length }, null, 2));
  } else if (command === "candidates") {
    console.log(JSON.stringify(collectionCandidates(snapshot, values.tools?.split(",")), null, 2));
  } else if (command === "scan-integrations") {
    const report = scanIntegrations(snapshot, store, values.tools?.split(","));
    const output = values.output ?? join(store.directory, "integration-scan.json");
    writeJson(output, report);
    console.log(JSON.stringify({ output, tools: report.tools.length, hints: report.tools.reduce((sum, tool) => sum + tool.hints.length, 0), coverage: "partial; retained source only; all leads need review" }));
  } else if (command === "capture-source") {
    const tool = snapshot.tools.find((t) => t.id === values.tool);
    const path = values.path;
    if (!tool?.revision || !tool.repo || !path || path.split("/").some((p) => !p || p === "." || p === "..")) throw new Error("Select a discovered --tool and a relative --path");
    const content = await githubSource(tool.repo, tool.revision, path);
    const evidence = store.evidence({ repo: tool.repo, revision: tool.revision, path, content }, `Source ${tool.id}/${path}`, `https://github.com/${tool.repo}/blob/${tool.revision}/${path}`);
    addEvidence(snapshot, evidence); tool.evidenceIds.push(evidence.id); store.save(snapshot);
    console.log(`Captured ${evidence.id}; cite /content with an exact excerpt`);
  } else if (command === "export-review") {
    if (!values.tools) throw new Error("--tools is required");
    const packet = exportPacket(snapshot, store, values.tools.split(","), required("output"));
    console.log(`Exported ${packet.packetId}; manual tasks and result template are in ${values.output}`);
  } else if (command === "import-review") {
    if (!values.packet) throw new Error("--packet is required");
    const packet = readJson(values.packet);
    const next = importReview(snapshot, store, packet, readJson(required("input")), values.decisions ? readJson(values.decisions) : undefined);
    store.save(next);
    const path = join(store.directory, "reviews.json");
    if (existsSync(path)) {
      const index = readJson(path) as { packetId: string; status: string }[];
      const entry = index.find((r) => r.packetId === object(packet).packetId);
      if (entry) entry.status = values.decisions ? "decisions-recorded" : "findings-returned";
      writeJson(path, index);
    }
    console.log(`Imported review; compatibility remains unassessed`);
  } else if (command === "show") {
    const tool = snapshot.tools.find((t) => t.id === values.tool);
    if (!tool) throw new Error("Select a known --tool");
    console.log(JSON.stringify({ tool, profiles: snapshot.profiles.filter((p) => p.toolId === tool.id) }, null, 2));
  } else if (command === "compact-storage") {
    store.save(snapshot, { preserveTimestamp: true });
    console.log(`Partitioned snapshot storage; semantic digest remains ${snapshot.semanticDigest}`);
  } else if (command === "export-snapshot") {
    const output = required("output");
    if (resolve(output) === join(store.directory, "snapshot.json")) throw new Error("Export to a separate file; do not replace the canonical snapshot manifest");
    writeJson(output, snapshot);
    console.log(`Exported self-contained snapshot to ${output}`);
  } else if (command === "validate") {
    store.verify(snapshot); console.log(`Validated ${snapshot.tools.length} tools, ${snapshot.profiles.length} profiles, ${snapshot.evidence.length} evidence objects.`);
  } else if (command === "replay") {
    const result = replaySnapshot(snapshot, store, (message) => console.error(message));
    console.log(`Replayed ${result.profiles} native profiles and ${result.reviews} review submissions with identical graph records and review contributions.`);
  } else if (command === "rebuild-native") {
    const next = rebuildNative(snapshot, store);
    store.save(next);
    const path = join(store.directory, "reviews.json");
    if (existsSync(path)) {
      writeJson(path, reconcileReviewQueue(next, readJson(path) as ReviewQueueEntry[]));
    }
    console.log("Rebuilt native graphs from retained evidence. Export fresh review packets for changed contexts.");
  } else if (command === "diff") {
    const before = values["before-ref"] ? readGitSnapshot(values["before-ref"]) : readSnapshot(required("before"));
    const changes = compareSnapshots(before, snapshot);
    if (values.output) writeJson(values.output, changes); else console.log(JSON.stringify(changes, null, 2));
  } else throw new Error(`Unknown command ${command}; use help`);
}

async function run() {
  const readOnly = ["help", "show", "candidates", "validate", "replay", "diff", "export-snapshot"].includes(positionals[0] ?? "help");
  const release = readOnly ? () => {} : acquireLock(store.directory);
  try { await main(); } finally { release(); }
}

run().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
