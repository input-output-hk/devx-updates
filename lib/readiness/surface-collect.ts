import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { digest } from "./core";
import { repositoryReference } from "./discovery";
import { execute } from "./source";
import type { BoundaryRegister } from "./boundary";
import type { ChangeRegister } from "./dijkstra";
import { TRANSITIVE_RULES, withTransitive, type TransitiveLink } from "./transitive";
import { classifyTool, rankClassifications, RULES, scannable, scanSources, type RepositoryActivity, type Scan, type ToolClassification } from "./surfaces";

/** Rule identity: cached scans are reused only while the rule set is unchanged. */
export const SCANNER_VERSION = 11;
export const RULES_DIGEST = digest([SCANNER_VERSION, ...RULES.map((r) => [r.id, r.pattern.source, r.pattern.flags, r.files?.source ?? null, r.component ?? null, r.surfaces ?? null, r.readiness ?? null, r.excludeSurfaces ?? null])]);

const git = (cwd: string, args: string[], timeout = 300000) =>
  execute("git", args, { cwd, timeout, killSignal: "SIGKILL", maxBuffer: 256 * 1024 * 1024 });

async function defaultHead(repo: string, stateDir: string): Promise<string> {
  const head = (await git(stateDir, ["ls-remote", `https://github.com/${repo}.git`, "HEAD"], 60000)).stdout.split(/\s/)[0];
  if (!/^[a-f0-9]{40}$/.test(head)) throw new Error(`No default-branch head for ${repo}`);
  return head;
}

/** Archive state and last push; unavailable metadata is omitted rather than guessed. */
async function activity(repo: string, stateDir: string): Promise<RepositoryActivity | undefined> {
  try {
    const out = (await execute("gh", ["api", `repos/${repo}`, "--jq", "{archived: .archived, pushedAt: .pushed_at}"], { cwd: stateDir, timeout: 60000 })).stdout;
    const parsed = JSON.parse(out) as RepositoryActivity;
    return typeof parsed.archived === "boolean" && typeof parsed.pushedAt === "string" ? parsed : undefined;
  } catch { return undefined; }
}

/** Shallow, blob-limited checkout; scanning skips larger files anyway. */
async function checkout(repo: string, revision: string, stateDir: string, key = revision): Promise<string> {
  const directory = resolve(stateDir, "surface-sources", key);
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  await git(directory, ["init", "-q"]);
  await git(directory, ["remote", "add", "origin", `https://github.com/${repo}.git`]);
  await git(directory, ["fetch", "-q", "--depth=1", `--filter=blob:limit=${1024 * 1024}`, "origin", revision]);
  await git(directory, ["checkout", "-q", "--detach", revision]);
  return directory;
}

async function scanCheckout(directory: string, self: string): Promise<Scan> {
  const paths = (await git(directory, ["ls-files", "-z"])).stdout.split("\0").filter(Boolean);
  const files = [];
  let skipped = 0;
  for (const path of paths) {
    const full = join(directory, path);
    let size: number;
    try { const stat = statSync(full); if (!stat.isFile()) { skipped++; continue; } size = stat.size; } catch { skipped++; continue; }
    if (!scannable(path, size)) { skipped++; continue; }
    files.push({ path, content: readFileSync(full, "utf8") });
  }
  const scan = scanSources(files, self);
  return { ...scan, skipped: scan.skipped + skipped };
}

/** Scan rules plus the transitive ones; the latter stay out of RULES_DIGEST so cached scans remain valid. */
const CLASSIFY_RULES = [...RULES, ...TRANSITIVE_RULES];
/** Lockfile links recorded at the revision being classified (a link read at another revision is stale and dropped). */
const linksFor = (links: TransitiveLink[] | undefined, id: string, revision: string) => (links ?? []).filter((l) => l.tool === id && l.revision === revision);

export interface ClassificationRegister {
  schemaVersion: 1; generatedAt: string; rulesDigest: string; changeTarget: unknown; boundaryRetrieved: string;
  summary: Record<string, number>; tools: ToolClassification[];
}

/**
 * Recompute a classification at the recorded revisions after a register or rule change: cached scans are reused, and a
 * scan the current rules lack is redone at the same revision. Default-branch heads are not re-observed, so lead
 * decisions read at those revisions stay valid.
 */
export async function reclassifyCatalog(
  previous: ClassificationRegister, boundary: BoundaryRegister, changes: ChangeRegister,
  options: { stateDir: string; concurrency?: number; log?: (line: string) => void; transitive?: TransitiveLink[] },
): Promise<ClassificationRegister> {
  const cacheDir = resolve(options.stateDir, "surface-scans");
  mkdirSync(cacheDir, { recursive: true });
  const queue = [...previous.tools];
  const results: ToolClassification[] = [];
  const work = async () => {
    for (let tool = queue.shift(); tool; tool = queue.shift()) {
      if (tool.scan.status !== "scanned" || !tool.repo || !tool.revision) {
        results.push(classifyTool({ id: tool.id, repo: tool.repo, revision: tool.revision }, { status: tool.scan.status === "scanned" ? "checkout-failed" : tool.scan.status, note: tool.scan.note ?? "" }, boundary, changes));
        continue;
      }
      const cache = join(cacheDir, `${tool.revision}-${tool.id}-${RULES_DIGEST.slice(0, 16)}.json`);
      let scan: Scan;
      if (existsSync(cache)) scan = JSON.parse(readFileSync(cache, "utf8")) as Scan;
      else {
        // Several catalog tools can share a repository revision; each scan gets its own checkout.
        const directory = await checkout(tool.repo, tool.revision, options.stateDir, `${tool.revision}-${tool.id}`);
        try { scan = await scanCheckout(directory, tool.id); } finally { rmSync(directory, { recursive: true, force: true }); }
        writeFileSync(cache, JSON.stringify(scan));
        options.log?.(`${tool.id} ${tool.revision.slice(0, 10)} rescanned files=${scan.files} hits=${scan.hits.length}`);
      }
      const merged = withTransitive(scan, linksFor(options.transitive, tool.id, tool.revision));
      results.push({ ...classifyTool({ id: tool.id, repo: tool.repo, revision: tool.revision }, merged, boundary, changes, CLASSIFY_RULES), ...(tool.activity && { activity: tool.activity }) });
    }
  };
  await Promise.all(Array.from({ length: options.concurrency ?? 6 }, work));
  return summarize(rankClassifications(results), boundary, changes);
}

function summarize(ranked: ToolClassification[], boundary: BoundaryRegister, changes: ChangeRegister): ClassificationRegister {
  const summary: Record<string, number> = {};
  for (const t of ranked) summary[t.exposure] = (summary[t.exposure] ?? 0) + 1;
  return {
    schemaVersion: 1, generatedAt: new Date().toISOString(), rulesDigest: RULES_DIGEST, changeTarget: changes.target,
    boundaryRetrieved: boundary.retrieved, summary, tools: ranked,
  };
}

export async function classifyCatalog(
  tools: { id: string; repo: string | null }[], boundary: BoundaryRegister, changes: ChangeRegister,
  options: { stateDir: string; concurrency?: number; log?: (line: string) => void; transitive?: TransitiveLink[] },
): Promise<ClassificationRegister> {
  const cacheDir = resolve(options.stateDir, "surface-scans");
  mkdirSync(cacheDir, { recursive: true });
  const byRepo = new Map<string, { id: string; repo: string | null }[]>();
  const results: ToolClassification[] = [];
  for (const tool of tools) {
    const repo = tool.repo ? repositoryReference(tool.repo) : null;
    if (!repo) {
      results.push(classifyTool({ id: tool.id, repo: tool.repo, revision: null }, { status: "no-public-source", note: "The catalog names no GitHub repository; classify through its documented services." }, boundary, changes));
      continue;
    }
    byRepo.set(repo, [...(byRepo.get(repo) ?? []), tool]);
  }
  const queue = [...byRepo.entries()];
  const work = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [repo, members] = next;
      let revision: string;
      try { revision = await defaultHead(repo, options.stateDir); } catch (error) {
        for (const tool of members) results.push(classifyTool({ id: tool.id, repo, revision: null }, { status: "checkout-failed", note: (error as Error).message.split("\n")[0] }, boundary, changes));
        continue;
      }
      const state = await activity(repo, options.stateDir);
      let directory: string | undefined;
      try {
        for (const tool of members) {
          const cache = join(cacheDir, `${revision}-${tool.id}-${RULES_DIGEST.slice(0, 16)}.json`);
          let scan: Scan;
          if (existsSync(cache)) scan = JSON.parse(readFileSync(cache, "utf8")) as Scan;
          else {
            directory ??= await checkout(repo, revision, options.stateDir);
            scan = await scanCheckout(directory, tool.id);
            writeFileSync(cache, JSON.stringify(scan));
          }
          const merged = withTransitive(scan, linksFor(options.transitive, tool.id, revision));
          results.push({ ...classifyTool({ id: tool.id, repo, revision }, merged, boundary, changes, CLASSIFY_RULES), ...(state && { activity: state }) });
          options.log?.(`${tool.id} ${revision.slice(0, 10)} files=${scan.files} hits=${scan.hits.length}`);
        }
      } catch (error) {
        for (const tool of members.filter((m) => !results.some((r) => r.id === m.id))) {
          results.push(classifyTool({ id: tool.id, repo, revision }, { status: "checkout-failed", note: (error as Error).message.split("\n")[0] }, boundary, changes));
        }
      } finally {
        // Scans are cached per revision; the checkout is only needed while scanning.
        if (directory) rmSync(directory, { recursive: true, force: true });
      }
    }
  };
  await Promise.all(Array.from({ length: options.concurrency ?? 6 }, work));
  return summarize(rankClassifications(results), boundary, changes);
}
