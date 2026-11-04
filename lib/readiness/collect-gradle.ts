import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { canonical, digest, object, text } from "./core";
import { addEvidence, Store } from "./store";
import { execute, pinnedCheckout, sourcePath } from "./source";
import { publishCollection, reuseCollection, type CollectOptions, type CollectionSelection } from "./collection";
import { gradleConfigurations } from "./gradle-selection";
import { gradleHasFailures } from "./gradle";
import { GRADLE_IMAGE, GRADLE_WORKER_LIMITS, runGradleWorker } from "./gradle-worker";
import type { NativeInput, Snapshot } from "./types";

export function gradleCaptureContext() {
  const scripts = Object.fromEntries(["gradle-resolution.init.gradle", "gradle-worker.sh"].map((name) => [name, readFileSync(resolve("scripts/readiness", name), "utf8")]));
  return { scripts, fingerprint: digest({ scripts, image: GRADLE_IMAGE, limits: GRADLE_WORKER_LIMITS, isolationVersion: 1 }) };
}

export async function collectGradle(snapshot: Snapshot, store: Store, options: CollectOptions) {
  const tool = snapshot.tools.find((t) => t.id === options.toolId)!;
  if (options.platform !== "amd64-Linux") throw new Error("Gradle worker currently requires platform amd64-Linux");
  const configurations = gradleConfigurations(options.configurations, "gradle-resolution")!;
  const path = options.path ?? "build.gradle";
  if (!tool.manifests.includes(path) || !/(^|\/)build\.gradle(\.kts)?$/.test(path) || path.split("/").some((part) => !part || part === "." || part === "..") || path.includes("\\")) throw new Error("Select a discovered checkout-relative Gradle build file");
  const sourceDirectory = posix.dirname(path);
  if (sourceDirectory !== "." && !["settings.gradle", "settings.gradle.kts"].some((name) => tool.manifests.includes(posix.join(sourceDirectory, name)))) throw new Error("Select a Gradle build root with its own settings file, not a subproject build file");
  const context = gradleCaptureContext();
  const selection: CollectionSelection = { revision: tool.revision!, adapter: "gradle-resolution", roots: options.roots, path, platform: options.platform, configurations, resolverContext: context.fingerprint };
  const cached = reuseCollection(snapshot, store, options, selection);
  if (cached) return cached;
  const checkout = await pinnedCheckout(tool.repo!, tool.revision!, options.stateDir);
  const wrapperPath = posix.join(sourceDirectory, "gradle/wrapper/gradle-wrapper.properties");
  const wrapper = readFileSync(sourcePath(checkout, wrapperPath), "utf8");
  const distribution = wrapper.match(/^distributionUrl\s*=\s*(.+)$/m)?.[1].trim().replace(/\\:/g, ":");
  if (!distribution || !/^https:\/\/(services|downloads)\.gradle\.org\/distributions\/gradle-7\.5\.1-(bin|all)\.zip$/.test(distribution)) throw new Error("Gradle collection requires the selected build's official 7.5.1 wrapper distribution; inspect a changed toolchain before collecting");
  // Immutable tracked build inputs are evidence; never load host Gradle configuration or run the wrapper.
  const files = (await execute("git", ["ls-files", "-z"], { cwd: checkout, timeout: 30000, killSignal: "SIGKILL", maxBuffer: 16 * 1024 * 1024 })).stdout.split("\0").filter((file) => /(^|\/)((build|settings)\.gradle(\.kts)?|gradle\.properties|gradle-wrapper\.properties|libs\.versions\.toml|gradle\.lockfile|verification-metadata\.xml)$|(^|\/)gradle\/dependency-locks\//.test(file));
  let sourceBytes = 0;
  const supporting = files.map((path) => {
    const content = readFileSync(sourcePath(checkout, path), "utf8"); sourceBytes += Buffer.byteLength(content);
    const evidence = store.evidence({ repo: tool.repo, revision: tool.revision, path, content }, `Gradle build input ${tool.id}/${path}`, `https://github.com/${tool.repo}/blob/${tool.revision}/${path}`);
    addEvidence(snapshot, evidence); tool.evidenceIds.push(evidence.id); return evidence.id;
  });
  const state = resolve(options.stateDir, "gradle-workers"); mkdirSync(state, { recursive: true });
  const captureDirectory = mkdtempSync(join(state, "capture-"));
  const invocation = store.evidence({ selection, repo: tool.repo, sourceDirectory, image: GRADLE_IMAGE, scripts: context.scripts, workerLimits: GRADLE_WORKER_LIMITS,
    command: `/capture/gradle-worker.sh ${sourceDirectory}`, sourceInputBytes: sourceBytes,
  }, `Gradle worker invocation for ${tool.id}`);
  addEvidence(snapshot, invocation); tool.evidenceIds.push(invocation.id); supporting.push(invocation.id);
  try {
    for (const [name, content] of Object.entries(context.scripts)) writeFileSync(join(captureDirectory, name), content);
    writeFileSync(join(captureDirectory, "selection.json"), `${canonical(configurations)}\n`);
    const started = Date.now();
    const output = await runGradleWorker(checkout, captureDirectory, sourceDirectory);
    const raw: Record<string, unknown> = { ...object(JSON.parse(output.stdout), "Gradle native output"), sourceDirectory, provenance: {
      repo: tool.repo, revision: tool.revision, image: GRADLE_IMAGE, scripts: context.scripts, selection: configurations,
      workerLimits: GRADLE_WORKER_LIMITS, isolation: "read-only root/source/capture; no host home/socket/credential mounts; bounded tmpfs; no capabilities; unique container removed",
      stderr: output.stderr, elapsedMs: Date.now() - started, captureBytes: Buffer.byteLength(output.stdout), sourceInputBytes: sourceBytes,
    } };
    const environment = object(raw.environment, "Gradle environment");
    const profile: NativeInput = {
      toolId: tool.id, release: tool.release!, revision: tool.revision!, platform: options.platform,
      features: configurations.map((s) => `${s.projectPath}/${s.configuration}:${s.scope}`),
      command: `Isolated ${GRADLE_IMAGE}: /capture/gradle-worker.sh ${sourceDirectory}; selections ${canonical(configurations)}`,
      toolchain: `Gradle ${text(raw.gradleVersion)} / ${text(environment.javaVendor)} JDK ${text(environment.javaVersion)}`,
      origin: "source-reconstruction", adapter: "gradle-resolution", rootNames: options.roots,
    };
    const result = publishCollection(snapshot, store, selection, profile, raw, supporting, `https://github.com/${tool.repo}/tree/${tool.revision}`);
    if (gradleHasFailures(raw)) throw new Error("Gradle resolution was incomplete; retained the partial native graph for inspection and retry.");
    return result.profile;
  } catch (error) {
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), { invocationEvidenceId: invocation.id });
  } finally { rmSync(captureDirectory, { recursive: true, force: true }); }
}
