import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { gap, list, object, text } from "./core";
import { addEvidence, readJson, Store, writeJson } from "./store";
import type { Ecosystem, Evidence, Snapshot, Tool } from "./types";

const exec = promisify(execFile);

export function repositoryReference(raw: string): string | null {
  const candidate = raw.replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/^github\.com\//i, "").replace(/\/$/, "").replace(/\.git$/, "");
  return /^[a-z\d-]+\/[\w.-]+$/i.test(candidate) ? candidate : null;
}

export function detectManifests(paths: string[]): { manifests: string[]; ecosystems: Ecosystem[]; reviewFiles: string[] } {
  const patterns: [Ecosystem, RegExp][] = [
    ["npm", /(^|\/)(package\.json|package-lock\.json|yarn\.lock|bun\.lockb?|pnpm-lock\.yaml)$/],
    ["cargo", /(^|\/)Cargo\.(toml|lock)$/],
    ["cabal", /\.cabal$|(^|\/)(cabal\.project(\..+)?|stack\.yaml(\.lock)?)$/],
    ["gradle", /(^|\/)((build|settings)\.gradle(\.kts)?|gradle\.properties|gradle-wrapper\.properties|libs\.versions\.toml)$/],
    ["go", /(^|\/)go\.(mod|sum)$/],
    ["python", /(^|\/)(pyproject\.toml|poetry\.lock|uv\.lock|requirements[^/]*\.txt|Pipfile(\.lock)?|setup\.py)$/],
    ["nix", /\.nix$|(^|\/)flake\.lock$/],
    ["container", /(^|\/)(Dockerfile[^/]*|docker-compose[^/]*|compose\.ya?ml)$/],
    ["other", /(^|\/)(aiken\.toml|aiken\.lock|mix\.exs|mix\.lock|pom\.xml|Gemfile|deno\.jsonc?|deno\.lock)$/],
  ];
  const manifests = new Set<string>(); const ecosystems = new Set<Ecosystem>();
  for (const path of paths) for (const [ecosystem, pattern] of patterns) if (pattern.test(path)) { manifests.add(path); ecosystems.add(ecosystem); }
  const reviewFiles = paths.filter((path) => /(^|\/)(README[^/]*|Makefile|Justfile)|\.github\/workflows\/|(^|\/)(scripts|config|deploy)\//i.test(path));
  return { manifests: [...manifests].sort(), ecosystems: [...ecosystems].sort(), reviewFiles: reviewFiles.sort() };
}

export async function github(endpoint: string): Promise<unknown> {
  const { stdout } = await exec("gh", ["api", endpoint], { maxBuffer: 48 * 1024 * 1024, timeout: 60000, killSignal: "SIGKILL" });
  return JSON.parse(stdout);
}

interface Discovery {
  repo: string;
  release: string;
  releaseUrl: string;
  revision: string;
  stable: boolean;
  truncated: boolean;
  manifests: string[];
  ecosystems: Ecosystem[];
  reviewFiles: string[];
  evidence: Evidence[];
}

interface Job {
  status: "running" | "succeeded" | "failed";
  attemptedAt: string;
  succeededAt?: string;
  error?: string;
  result?: Discovery;
}

async function discoverRepo(repo: string, store: Store, shared: Map<string, Promise<Discovery>>, request: typeof github): Promise<Discovery> {
  const reference = repositoryReference(repo);
  if (!reference) throw new Error(`No GitHub source repository in catalog reference: ${repo}`);
  const metadata = object(await request(`repos/${reference}`));
  const canonicalRepo = text(metadata.full_name);
  const cached = shared.get(canonicalRepo.toLowerCase());
  if (cached) return cached;
  const pending = (async () => {
  let release: Record<string, unknown> | undefined;
  try { release = object(await request(`repos/${canonicalRepo}/releases/latest`)); }
  catch (error) { if (!String(error).includes("404")) throw error; }
  const ref = release ? text(release.tag_name) : text(metadata.default_branch);
  const commit = object(await request(`repos/${canonicalRepo}/commits/${encodeURIComponent(ref)}`));
  const revision = text(commit.sha);
  const tree = object(await request(`repos/${canonicalRepo}/git/trees/${revision}?recursive=1`));
  const paths = list(tree.tree).map((entry) => object(entry)).filter((e) => e.type === "blob").map((e) => text(e.path));
  const sourceUrl = `https://github.com/${canonicalRepo}/tree/${revision}`;
  const evidence = [
    store.evidence({ repo: canonicalRepo, release: release ?? null, revision, defaultBranch: metadata.default_branch }, "Release selection and immutable source identity", release ? text(release.html_url) : sourceUrl),
    store.evidence(tree, "Pinned repository tree for manifest and integration discovery", sourceUrl),
  ];
  return { repo: canonicalRepo, release: release ? ref : `unreleased:${ref}`, releaseUrl: release ? text(release.html_url) : sourceUrl, revision, stable: !!release, truncated: tree.truncated === true, ...detectManifests(paths), evidence };
  })();
  shared.set(canonicalRepo.toLowerCase(), pending);
  return pending;
}

function applyDiscovery(tool: Tool, job: Job, snapshot: Snapshot) {
  tool.lastAttempt = job.attemptedAt;
  if (job.error) {
    tool.discoveryError = job.error;
    tool.gaps = tool.gaps.filter((g) => g.area !== "discovery");
    tool.gaps.push(gap("discovery", job.error, "Retry discovery; inspect repository identity and API availability."));
    return;
  }
  const result = job.result!;
  tool.lastSuccess = job.succeededAt;
  delete tool.discoveryError;
  const previousRevision = tool.revision;
  tool.catalogRepo ??= tool.repo;
  tool.repo = result.repo; tool.release = result.release; tool.revision = result.revision; tool.releaseUrl = result.releaseUrl;
  tool.manifests = result.manifests;
  // Cached trees may predate a new ecosystem classifier; reuse their evidence, not stale labels.
  tool.ecosystems = detectManifests(result.manifests).ecosystems;
  tool.artifact = "partial";
  tool.gaps = tool.gaps.filter((g) => g.area !== "artifact" && g.area !== "discovery");
  tool.gaps.push(gap("artifact", result.stable ? "Source release identified; published package/binary correspondence and supported profiles need verification." : "No GitHub stable release was found; default-branch source is discovery evidence only.", "Confirm distribution artifacts and production configuration with release evidence."));
  const original = tool.catalogRepo && repositoryReference(tool.catalogRepo);
  if (original && original.toLowerCase() !== result.repo.toLowerCase()) tool.gaps.push(gap("artifact", `Catalog source ${original} redirects to ${result.repo}; tool/package identity may have changed.`, "Verify the release and artifact mapping before merging tool identities."));
  if (result.truncated) tool.gaps.push(gap("discovery", "GitHub returned a truncated repository tree.", "Inspect omitted subtrees before claiming manifest discovery is complete."));
  if (!result.manifests.length) tool.gaps.push(gap("discovery", "No recognized manifests were found; source may use an unsupported build system.", "Review the pinned repository and identify its distribution/build process."));
  if (previousRevision && previousRevision !== result.revision && snapshot.profiles.some((p) => p.toolId === tool.id)) {
    tool.gaps.push(gap("resolution", "Discovered source revision changed; existing profiles refer to earlier source.", "Collect a new profile and revalidate affected manual findings."));
  }
  for (const evidence of result.evidence) { addEvidence(snapshot, evidence); tool.evidenceIds.push(evidence.id); }
}

export async function discover(snapshot: Snapshot, store: Store, options: { stateDir: string; toolIds?: string[]; refresh?: boolean; limit?: number; request?: typeof github }) {
  const path = join(options.stateDir, "discovery.json");
  const jobs = existsSync(path) ? readJson(path) as Record<string, Job> : {};
  const selected = snapshot.tools.filter((t) => !options.toolIds?.length || options.toolIds.includes(t.id));
  if (options.toolIds?.some((id) => !snapshot.tools.some((t) => t.id === id))) throw new Error("Unknown tool selection");
  const repos = [...new Set(selected.map((t) => t.repo).filter((repo): repo is string => !!repo))].sort().slice(0, options.limit);
  const groups = new Map(repos.map((repo) => [repo, selected.filter((t) => t.repo === repo)]));
  const shared = new Map<string, Promise<Discovery>>();
  let cursor = 0;
  async function worker() {
    while (cursor < repos.length) {
      const repo = repos[cursor++];
      const cached = jobs[repo];
      if (cached?.status === "succeeded" && !options.refresh) {
        for (const t of groups.get(repo)!) applyDiscovery(t, cached, snapshot);
        continue;
      }
      const job: Job = { status: "running", attemptedAt: new Date().toISOString(), ...(cached?.result ? { result: cached.result, succeededAt: cached.succeededAt } : {}) };
      jobs[repo] = job; writeJson(path, jobs);
      try {
        job.result = await discoverRepo(repo, store, shared, options.request ?? github);
        job.status = "succeeded"; job.succeededAt = new Date().toISOString();
        console.log(`Discovered ${repo}: ${job.result.ecosystems.join(", ") || "unrecognized"}`);
      } catch (error) {
        job.status = "failed"; job.error = String(error).slice(0, 1500);
        console.error(`Discovery failed for ${repo}: ${job.error}`);
      }
      for (const t of groups.get(repo)!) applyDiscovery(t, job, snapshot);
      writeJson(path, jobs);
    }
  }
  await Promise.all(Array.from({ length: 3 }, worker));
  snapshot.generatedAt = new Date().toISOString(); store.save(snapshot);
}
