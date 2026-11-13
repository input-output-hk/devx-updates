import { load as loadYaml } from "js-yaml";
import { list, object, text } from "./core";
import { TRACKER_STATES } from "./boundary";

/**
 * Hand-kept Dijkstra follow-up per tool (content/readiness/dijkstra/tracking.yaml): a decision to dismiss a tool, and
 * the issues and PRs that bear on its state. Titles and open/merged/closed state are not written by hand: `sync-tracking`
 * reads them from GitHub into tracking-state.json, so the YAML (and its comments) is never rewritten.
 */
export interface Dismissal { reason: string; date?: string }
export interface TrackingLink { url: string; note?: string }
export interface ToolTracking { dismissed?: Dismissal; links: TrackingLink[] }
export type TrackingRegister = Map<string, ToolTracking>;

export type LinkState = (typeof TRACKER_STATES)[number];
/**
 * `forkOf`: the issue or PR lives in a fork of that repository, so merged there is not merged upstream.
 * A `fork` link is a GitHub compare URL (upstream branch...fork branch): `merged` once no fork commit is missing
 * upstream, `open` while `ahead` commits are; `head` is the fork branch's latest commit.
 */
export interface LinkInfo {
  kind: "issue" | "pull" | "fork"; title: string; state: LinkState; checked: string; forkOf?: string;
  ahead?: number; behind?: number; head?: { sha: string; date: string };
}
export interface TrackingState { schemaVersion: 1; links: Record<string, LinkInfo> }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const GITHUB = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/(issues|pull)\/(\d+)$/;

const COMPARE = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/compare\/([A-Za-z0-9_./-]+)\.\.\.([A-Za-z0-9_.-]+):([A-Za-z0-9_.-]+):([A-Za-z0-9_./-]+)$/;

/** Upstream repo and branch, fork repo and branch of a GitHub compare URL (`base...owner:repo:branch`). */
export function forkRef(url: string) {
  const m = COMPARE.exec(url);
  return m ? { upstream: m[1], base: m[2], fork: `${m[3]}/${m[4]}`, branch: m[5] } : undefined;
}

/** `owner/repo`, `issues|pull` and number of a GitHub issue or PR URL; undefined for any other link. */
export function githubRef(url: string) {
  const m = GITHUB.exec(url);
  return m ? { repo: m[1], kind: m[2] === "pull" ? "pull" as const : "issue" as const, number: Number(m[3]) } : undefined;
}

export const linkLabel = (url: string) => {
  const ref = githubRef(url);
  if (ref) return `${ref.repo}#${ref.number}`;
  const fork = forkRef(url);
  return fork ? `${fork.fork}@${fork.branch}` : url.replace(/^https?:\/\//, "");
};

/** `known` is the classified tool ids: a typo in a tool key fails the build instead of silently showing nothing. */
export function parseTracking(raw: unknown, known: ReadonlySet<string>): TrackingRegister {
  const root = raw == null ? {} : object(raw, "tracking");
  const tools = root.tools == null ? {} : object(root.tools, "tracking.tools");
  const out: TrackingRegister = new Map();
  for (const [id, value] of Object.entries(tools)) {
    const at = `tracking.tools.${id}`;
    if (!known.has(id)) throw new Error(`${at}: unknown tool ${id}`);
    const entry = value == null ? {} : object(value, at);
    for (const key of Object.keys(entry)) if (key !== "dismissed" && key !== "links") throw new Error(`${at}: unknown field ${key}`);
    let dismissed: Dismissal | undefined;
    if (entry.dismissed != null) {
      const d = typeof entry.dismissed === "string" ? { reason: entry.dismissed } : object(entry.dismissed, `${at}.dismissed`);
      const date = d.date instanceof Date ? d.date.toISOString().slice(0, 10) : d.date;
      if (date !== undefined && (typeof date !== "string" || !DATE.test(date))) throw new Error(`${at}.dismissed.date must be a YYYY-MM-DD date`);
      dismissed = { reason: text(d.reason, `${at}.dismissed.reason`), ...(date && { date }) };
    }
    const seen = new Set<string>();
    const links = (entry.links == null ? [] : list(entry.links, `${at}.links`)).map((l, i): TrackingLink => {
      const link = typeof l === "string" ? { url: l } : object(l, `${at}.links[${i}]`);
      const url = text(link.url, `${at}.links[${i}].url`);
      if (!/^https:\/\/\S+$/.test(url)) throw new Error(`${at}.links[${i}].url must be an https URL`);
      if (seen.has(url)) throw new Error(`${at}: ${url} is listed twice`);
      seen.add(url);
      return { url, ...(link.note != null && { note: text(link.note, `${at}.links[${i}].note`) }) };
    });
    if (!dismissed && !links.length) continue;
    out.set(id, { ...(dismissed && { dismissed }), links });
  }
  return out;
}

/** tracking.yaml as written; a file of only comments (as after deleting every entry) is an empty register. */
export const loadTracking = (source: string, known: ReadonlySet<string>) =>
  parseTracking(source.replace(/^\s*#.*$/gm, "").trim() ? loadYaml(source) : null, known);

export function parseTrackingState(raw: unknown): TrackingState {
  const r = object(raw, "tracking state");
  if (r.schemaVersion !== 1) throw new Error("Tracking state must use schemaVersion 1");
  const links: Record<string, LinkInfo> = {};
  for (const [url, value] of Object.entries(object(r.links, "tracking state links"))) {
    const v = object(value, url);
    if (v.kind !== "issue" && v.kind !== "pull" && v.kind !== "fork") throw new Error(`${url}: kind must be issue, pull or fork`);
    if (!TRACKER_STATES.includes(v.state as LinkState)) throw new Error(`${url}: unknown state ${String(v.state)}`);
    if (typeof v.checked !== "string" || !DATE.test(v.checked)) throw new Error(`${url}: checked must be a YYYY-MM-DD date`);
    const info: LinkInfo = { kind: v.kind, title: text(v.title, `${url}.title`), state: v.state as LinkState, checked: v.checked };
    if (v.forkOf != null) info.forkOf = text(v.forkOf, `${url}.forkOf`);
    if (v.kind === "fork") {
      const count = (n: unknown, field: string) => { if (!Number.isInteger(n) || (n as number) < 0) throw new Error(`${url}: ${field} must be a count`); return n as number; };
      const head = object(v.head, `${url}.head`);
      if (typeof head.date !== "string" || !DATE.test(head.date)) throw new Error(`${url}: head.date must be a YYYY-MM-DD date`);
      Object.assign(info, { ahead: count(v.ahead, "ahead"), behind: count(v.behind, "behind"), head: { sha: text(head.sha, `${url}.head.sha`), date: head.date } });
    }
    links[url] = info;
  }
  return { schemaVersion: 1, links };
}

/**
 * Read every GitHub issue/PR link's title and state. `request` is `gh api` in the CLI; a failed lookup keeps the
 * previous entry and is reported, so one deleted issue does not wipe the rest.
 */
export async function syncTracking(register: TrackingRegister, previous: TrackingState, request: (endpoint: string) => Promise<unknown>, today: string) {
  const links: Record<string, LinkInfo> = {};
  const failures: string[] = [];
  const urls = [...new Set([...register.values()].flatMap((t) => t.links.map((l) => l.url)))].sort();
  const parents = new Map<string, string | null>();
  // The repository a fork was made from, or null for a repository that is not a fork; read once per repository.
  const parentOf = async (repo: string) => {
    if (!parents.has(repo)) {
      const r = object(await request(`repos/${repo}`), repo);
      parents.set(repo, r.fork === true ? text((r.parent as { full_name?: unknown } | undefined)?.full_name, `${repo} parent`) : null);
    }
    return parents.get(repo)!;
  };
  for (const url of urls) {
    const ref = githubRef(url), fork = forkRef(url);
    if (!ref && !fork) continue;
    try {
      if (fork) {
        // Fork commits missing upstream (`ahead_by`); none left means the fork's work has been merged upstream.
        const [owner, repo] = fork.fork.split("/");
        const cmp = object(await request(`repos/${fork.upstream}/compare/${fork.base}...${owner}:${repo}:${fork.branch}`), url);
        const head = object(await request(`repos/${fork.fork}/commits/${fork.branch}`), `${url} head`);
        const date = text(object(object(head.commit, `${url} commit`).committer, `${url} committer`).date, `${url} date`).slice(0, 10);
        const ahead = Number(cmp.ahead_by), behind = Number(cmp.behind_by);
        links[url] = {
          kind: "fork", title: `${fork.fork}@${fork.branch} against ${fork.upstream}@${fork.base}`, state: ahead === 0 ? "merged" : "open",
          checked: today, forkOf: fork.upstream, ahead, behind, head: { sha: text(head.sha, `${url} sha`), date },
        };
        continue;
      }
      // The issues endpoint answers for PRs too; `pull_request.merged_at` tells merged from closed.
      const issue = object(await request(`repos/${ref!.repo}/issues/${ref!.number}`), url);
      const pr = issue.pull_request as { merged_at?: string | null } | undefined;
      const state: LinkState = pr?.merged_at ? "merged" : issue.state === "closed" ? "closed" : "open";
      const forkOf = await parentOf(ref!.repo);
      links[url] = { kind: pr ? "pull" : "issue", title: text(issue.title, `${url} title`), state, checked: today, ...(forkOf && { forkOf }) };
    } catch (error) {
      failures.push(`${url}: ${(error as Error).message}`);
      if (previous.links[url]) links[url] = previous.links[url];
    }
  }
  return { state: { schemaVersion: 1 as const, links }, failures };
}
