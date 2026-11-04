import { execute } from "./source";
import { AUXILIARY_PATH, SKIP_PATH, type Hit, type Rule, type Scan } from "./surfaces";
import type { ClassificationRegister } from "./surface-collect";

/**
 * Transitive dependencies (plan revision R3): boundary components a tool reaches only through another package, read
 * from the lockfiles committed at the classified revision. The manifest scan sees direct declarations only, so a tool
 * that follows the chain through a library outside the catalog (catalyst-voices through cardano-chain-follower to
 * Pallas) looked unexposed. Each link becomes a dependency hit of its own rule (`transitive:<component>`), so it
 * inherits the component's readiness and needs a lead decision like any direct dependency.
 */

export interface TransitiveLink {
  tool: string; revision: string; component: string;
  /** The locked package that is (part of) the component. */
  package: string; path: string; line: number; quote: string;
}
export interface TransitiveRegister { schemaVersion: 1; generatedAt: string; method: string[]; links: TransitiveLink[] }

interface LockRule {
  component: string;
  /** Package names as the lockfile ecosystems spell them. */
  names: RegExp;
  /** Lockfiles the names apply to, where a name means something else in another ecosystem. */
  files?: RegExp;
  excludeSurfaces?: string[];
}

/** Pallas codec crates carry the ledger surfaces only, as in the manifest rules. */
const PALLAS_CODECS = /^pallas-(?:primitives|traverse|codec|hardano|validate|utxorpc|txbuilder|configs|applying)$/;
export const LOCK_RULES: LockRule[] = [
  { component: "cardano-serialization-lib-csl", names: /^@emurgo\/cardano-serialization-lib(?:-[a-z]+)?$|^cardano-serialization-lib$/ },
  { component: "cardano-multiplatform-lib-cml", names: /^@dcspark\/cardano-multiplatform-lib(?:-[a-z]+)*$|^cml-(?:chain|core|crypto|multi-era)$/ },
  { component: "pallas", names: /^pallas(?:-network2?)?$/ },
  { component: "pallas", names: PALLAS_CODECS, excludeSurfaces: ["node-to-client-protocol", "consensus-participation"] },
  { component: "gouroboros", names: /^github\.com\/blinklabs-io\/gouroboros$/ },
  { component: "cardano-js-sdk", names: /^@cardano-sdk\/[a-z-]+$/ },
  { component: "bloxbean-cardano-client-library", names: /^com\.bloxbean\.cardano:cardano-client-(?:lib|core|backend|quicktx|plutus|transaction-spec|crypto|address|metadata|supplier|common|function)$/ },
  { component: "yaci", names: /^com\.bloxbean\.cardano:yaci(?:-core|-helper)?$/ },
  { component: "pycardano", names: /^pycardano$/ },
  { component: "cometa-js", names: /^@biglup\/cometa$/ },
  { component: "buildooor", names: /^@harmoniclabs\/buildooor$/ },
  { component: "ouroboros-miniprotocols-ts", names: /^@harmoniclabs\/ouroboros-miniprotocols-ts$/ },
  { component: "plu-ts", names: /^@harmoniclabs\/plu-ts$/ },
  { component: "cardano-data-lite", names: /^@lucid-evolution\/cardano-data-lite$|^cardano-data-lite$/ },
  { component: "evolution-sdk", names: /^@evolution-sdk\/[a-z-]+$/ },
  { component: "cardanosharp", names: /^CardanoSharp\.Wallet$/ },
  { component: "ouroboros-network-js", names: /^@stricahq\/ouroboros-network-js$/ },
  { component: "typhonjs", names: /^@stricahq\/typhonjs$/ },
  { component: "apollo", names: /^github\.com\/Salvionied\/apollo$/ },
  { component: "whisky", names: /^whisky(?:-[a-z]+)?$|^@sidan-lab\/whisky(?:-[a-z]+)?$/ },
  { component: "ledgerjs-hw-app-cardano", names: /^@cardano-foundation\/ledgerjs-hw-app-cardano$/ },
  { component: "cardano-hw-interop-lib", names: /^cardano-hw-interop-lib$/ },
  { component: "amaru", names: /^amaru-[a-z-]+$/ },
  { component: "helios", names: /^@helios-lang\/[a-z-]+$|^@hyperionbt\/helios$/ },
  { component: "scalus", names: /^org\.scalus:scalus[a-z0-9_.-]*$|^scalus$/ },
  { component: "uplc-turbo", names: /^uplc-turbo$/ },
  { component: "plutigo", names: /^github\.com\/blinklabs-io\/plutigo$/ },
  { component: "meshjs-mesh-sdk", names: /^@meshsdk\/[a-z-]+$/ },
  { component: "lucid-evolution", names: /^@lucid-evolution\/(?!cardano-data-lite$)[a-z-]+$/ },
  { component: "blaze", names: /^@blaze-cardano\/[a-z-]+$/ },
  { component: "utxorpc", names: /^@utxorpc\/[a-z-]+$|^utxorpc(?:-spec|-sdk)?$/ },
  { component: "mithril", names: /^mithril-client$/ },
  // Components without a manifest rule: a lockfile is the only place the scan meets them as packages.
  { component: "oura", names: /^oura$/ },
  { component: "adder", names: /^github\.com\/blinklabs-io\/adder$/ },
  // Aiken's evaluator crate: consumers evaluating scripts with it inherit Aiken's Plutus gap. On PyPI, `uplc` is
  // OpShin's evaluator, so only Cargo.lock counts.
  { component: "aiken", names: /^uplc$|^aiken-(?:lang|project)$/, files: /(?:^|\/)Cargo\.lock$/ },
  { component: "dolos", names: /^dolos(?:-[a-z]+)?$/ },
  { component: "yaci-store", names: /^com\.bloxbean\.cardano:yaci-store(?:-[a-z-]+)?$/ },
  { component: "julc", names: /^com\.bloxbean\.cardano:julc(?:-[a-z-]+)?$/ },
  { component: "opshin", names: /^opshin$/ },
  { component: "cquisitor-lib", names: /^@cardananium\/cquisitor-lib$|^cquisitor-lib$/ },
];

/** Rule ids for the classifier: one per component (and the Pallas codec split), kept out of the scan rule digest. */
export const transitiveRuleId = (rule: LockRule) => `transitive:${rule.component}${rule.excludeSurfaces ? "-codecs" : ""}`;
export const TRANSITIVE_RULES: Rule[] = LOCK_RULES.map((r) => ({
  id: transitiveRuleId(r), channel: "dependency", component: r.component, pattern: /$^/, ...(r.excludeSurfaces && { excludeSurfaces: r.excludeSurfaces }),
}));

const LOCKFILE = /(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lock|Cargo\.lock|go\.sum|poetry\.lock|uv\.lock|gradle\.lockfile|packages\.lock\.json)$/;
export const isLockfile = (path: string) => LOCKFILE.test(path) && !SKIP_PATH.test(path) && !AUXILIARY_PATH.test(path);

interface Locked { name: string; line: number; quote: string; parents: Set<string> }

/**
 * Locked packages with the line that names them and the packages that depend on them (`<root>` for the project's own
 * manifests). npm lockfiles mark development-only entries (`"dev": true`), which are skipped; the other formats do not
 * separate them, so a lead decision settles whether shipped code reaches the component. go.sum and gradle lockfiles
 * carry no graph: their packages count as reached from the root.
 */
export function lockedPackages(path: string, content: string): Locked[] {
  const lines = content.split("\n");
  const byName = new Map<string, Locked>();
  const node = (name: string, index: number) => byName.get(name) ?? byName.set(name, { name, line: index + 1, quote: lines[index].trim().slice(0, 200), parents: new Set() }).get(name)!;
  const edge = (parent: string, child: string) => { (pending.get(child) ?? pending.set(child, new Set()).get(child)!).add(parent); };
  const pending = new Map<string, Set<string>>();
  const file = path.split("/").pop()!;
  const lineOf = (needle: string, from = 0) => { const i = lines.findIndex((l, n) => n >= from && l.includes(needle)); return i < 0 ? 0 : i; };
  if (file === "package-lock.json" || file === "npm-shrinkwrap.json") {
    let json: { packages?: Record<string, { dev?: boolean; devOptional?: boolean; dependencies?: Record<string, string>; optionalDependencies?: Record<string, string>; peerDependencies?: Record<string, string> }> };
    try { json = JSON.parse(content); } catch { return []; }
    let cursor = 0;
    for (const [key, entry] of Object.entries(json.packages ?? {})) {
      const name = /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)$/.exec(key)?.[1];
      const self = name ?? "<root>";
      const at = key ? lineOf(`"${key}": {`, cursor) : 0;
      if (key) cursor = at;
      if (name && (entry.dev || entry.devOptional)) continue;
      if (name) node(name, at);
      for (const dep of Object.keys({ ...entry.dependencies, ...entry.optionalDependencies, ...entry.peerDependencies })) edge(self, dep);
    }
  } else if (file === "yarn.lock") {
    // Classic: `"a@^1", a@^2:` then `  dependencies:` / `    b "^1"`; Berry: same with `    b: "npm:^1"`.
    let current: string | undefined, inDeps = false;
    lines.forEach((l, i) => {
      const head = /^"?((?:@[^/@"\s]+\/)?[^@"\s,]+)@/.exec(l);
      if (head) { current = head[1]; inDeps = false; node(current, i); return; }
      if (/^ {2}(?:dependencies|optionalDependencies|peerDependencies):/.test(l)) { inDeps = true; return; }
      if (/^ {2}\S/.test(l)) { inDeps = false; return; }
      const dep = /^ {4}"?((?:@[^/@"\s]+\/)?[^@"\s:]+)"?:?\s/.exec(l);
      if (inDeps && current && dep) edge(current, dep[1]);
    });
    // Packages no entry depends on are the project's own dependencies.
  } else if (file === "pnpm-lock.yaml") {
    let section = "", current: string | undefined, inDeps = false;
    lines.forEach((l, i) => {
      const top = /^(\w+):/.exec(l);
      if (top) { section = top[1]; current = undefined; return; }
      if (section === "importers") {
        if (/^ {4}(?:dependencies|optionalDependencies|peerDependencies):/.test(l)) inDeps = true;
        else if (/^ {4}devDependencies:/.test(l) || /^ {2}\S/.test(l)) inDeps = false;
        const dep = /^ {6}'?((?:@[^/@'\s]+\/)?[^@'\s:]+)'?:\s*$/.exec(l);
        if (inDeps && dep) edge("<root>", dep[1]);
        return;
      }
      if (section !== "packages" && section !== "snapshots") return;
      const head = /^ {2}'?\/?((?:@[^/@'\s]+\/)?[^@/'\s(]+)@[^:]*'?:\s*$/.exec(l);
      if (head) { current = head[1]; inDeps = false; if (section === "packages") node(current, i); else if (!byName.has(current)) node(current, i); return; }
      if (/^ {4}(?:dependencies|optionalDependencies):/.test(l)) { inDeps = true; return; }
      if (/^ {4}\S/.test(l)) { inDeps = false; return; }
      const dep = /^ {6}'?((?:@[^/@'\s]+\/)?[^@'\s:]+)'?:\s/.exec(l);
      if (inDeps && current && dep) edge(current, dep[1]);
    });
  } else if (file === "bun.lock") {
    let section = "";
    lines.forEach((l, i) => {
      const sec = /^ {2}"(workspaces|packages)":/.exec(l);
      if (sec) { section = sec[1]; return; }
      if (section === "workspaces") {
        const dep = /^ {8}"((?:@[^/"]+\/)?[^/"@]+)":\s*"/.exec(l);
        if (dep) edge("<root>", dep[1]);
        return;
      }
      const head = /^\s*"((?:@[^/"]+\/)?[^/"@]+)":\s*\["\1@/.exec(l);
      if (!head) return;
      node(head[1], i);
      const deps = /"(?:dependencies|optionalDependencies|peerDependencies)":\s*\{([^}]*)\}/g;
      for (let m; (m = deps.exec(l));) for (const d of m[1].matchAll(/"((?:@[^/"]+\/)?[^/"]+)":/g)) edge(head[1], d[1]);
    });
  } else if (file === "Cargo.lock" || file === "poetry.lock" || file === "uv.lock") {
    // [[package]] blocks: name, source (absent or editable/virtual for the workspace's own crates), dependencies.
    let current: string | undefined, own = false, inDeps = false;
    const close = () => { if (current && own) edge("<root>", current); };
    lines.forEach((l, i) => {
      if (l.startsWith("[[package]]")) { close(); current = undefined; own = file !== "poetry.lock"; inDeps = false; return; }
      const name = /^name = "([^"]+)"$/.exec(l);
      if (name && !current) { current = name[1]; node(current, i); return; }
      if (/^source = /.test(l) && !/editable|virtual|directory/.test(l)) own = false;
      if (/^dependencies = \[/.test(l)) { inDeps = !l.includes("]"); for (const d of l.matchAll(/"([A-Za-z0-9_.-]+)[ "]/g)) if (current) edge(current, d[1]); for (const d of l.matchAll(/name = "([^"]+)"/g)) if (current) edge(current, d[1]); return; }
      if (inDeps) {
        if (l.startsWith("]")) { inDeps = false; return; }
        const dep = /^\s*(?:\{ name = )?"([A-Za-z0-9_.-]+)/.exec(l);
        if (dep && current) edge(current, dep[1]);
      }
      if (file === "poetry.lock" && /^\[package\.dependencies\]/.test(l)) inDeps = true;
    });
    close();
  } else if (file === "go.sum") {
    lines.forEach((l, i) => { const m = /^(\S+) v[^/\s]+ h1:/.exec(l); if (m) { node(m[1], i); edge("<root>", m[1]); } });
  } else if (file === "gradle.lockfile") {
    lines.forEach((l, i) => { const m = /^([^:#\s]+:[^:\s]+):[^=\s]+=(.*)$/.exec(l); if (m && /(?:^|,)(?:runtimeClasspath|compileClasspath)(?:,|$)/.test(m[2])) { node(m[1], i); edge("<root>", m[1]); } });
  } else if (file === "packages.lock.json") {
    lines.forEach((l, i) => { const m = /^\s{6}"([A-Za-z0-9_.-]+)":\s*\{/.exec(l); if (m) { node(m[1], i); edge("<root>", m[1]); } });
  }
  for (const [child, parents] of pending) { const n = byName.get(child); if (n) for (const p of parents) n.parents.add(p); }
  // A locked package nothing else depends on was required by the project itself.
  for (const n of byName.values()) if (!n.parents.size) n.parents.add("<root>");
  return [...byName.values()];
}

const ruleOf = (name: string, path: string) => LOCK_RULES.find((r) => r.names.test(name) && (!r.files || r.files.test(path)));

/**
 * The catalog components through which `start` is reached: walk its dependents upwards; a dependent that belongs to
 * another component ends that path at that component, and reaching the project's own manifests (`<root>`) through
 * packages outside the catalog ends it at `start`'s own component.
 */
function nearestComponents(start: Locked, packages: Map<string, Locked>, path: string): { component: string; via: Locked }[] {
  const own = ruleOf(start.name, path)!.component;
  const out = new Map<string, { component: string; via: Locked }>();
  const seen = new Set<string>([start.name]);
  const queue = [...start.parents];
  for (let next; (next = queue.pop()) !== undefined;) {
    if (seen.has(next)) continue;
    seen.add(next);
    if (next === "<root>") { if (!out.has(own)) out.set(own, { component: own, via: start }); continue; }
    const p = packages.get(next), rule = ruleOf(next, path);
    if (rule && rule.component !== own) { if (p && !out.has(rule.component)) out.set(rule.component, { component: rule.component, via: p }); continue; }
    if (p) queue.push(...p.parents);
    else if (!out.has(own)) out.set(own, { component: own, via: start }); // a dependent the lockfile does not list: assume a path to the project
  }
  return [...out.values()];
}

/**
 * Links for one tool: the nearest catalog components on each lockfile path to a component's package, skipping the tool
 * itself and components it already declares in a manifest (any scan hit of the component's manifest rule). A
 * component reached only through another one it declares is that component's dependency, already carried by its own
 * classification and leads. One link per component, at its first locked line.
 */
export function transitiveLinks(tool: { id: string; revision: string; hits: Hit[] }, lockfiles: { path: string; content: string }[]): TransitiveLink[] {
  const direct = new Set(tool.hits.filter((h) => h.rule.startsWith("dependency:") && (h.lines || h.auxLines)).map((h) => h.rule.slice("dependency:".length).replace(/-codecs$/, "")));
  const found = new Map<string, TransitiveLink>();
  for (const { path, content } of lockfiles) {
    const locked = lockedPackages(path, content);
    const packages = new Map(locked.map((p) => [p.name, p]));
    for (const p of locked) {
      if (!ruleOf(p.name, path)) continue;
      for (const { component, via } of nearestComponents(p, packages, path)) {
        if (component === tool.id || direct.has(component)) continue;
        const rule = ruleOf(via.name, path)!;
        const key = transitiveRuleId(rule);
        if (!found.has(key)) found.set(key, { tool: tool.id, revision: tool.revision, component, package: via.name, path, line: via.line, quote: via.quote });
      }
    }
  }
  return [...found.values()];
}

/** The scan with each transitive link added as a shipped hit of its `transitive:` rule. */
export function withTransitive(scan: Scan, links: TransitiveLink[]): Scan {
  if (!links.length) return scan;
  const extra: Hit[] = links.map((l) => {
    const rule = LOCK_RULES.find((r) => r.component === l.component && r.names.test(l.package) && (!r.files || r.files.test(l.path)))!;
    return { rule: transitiveRuleId(rule), files: 1, lines: 1, auxLines: 0, docLines: 0, examples: [{ path: l.path, line: l.line, quote: l.quote }] };
  });
  return { ...scan, hits: [...scan.hits, ...extra] };
}

const git = (args: string[]) => execute("gh", args, { timeout: 120000, maxBuffer: 64 * 1024 * 1024 });

/** Read the committed lockfiles of every scanned tool at its classified revision (GitHub API tree plus raw file reads). */
export async function collectTransitive(
  classification: ClassificationRegister, options: { tools?: string[]; log?: (line: string) => void; concurrency?: number } = {},
): Promise<TransitiveLink[]> {
  const queue = classification.tools.filter((t) => t.scan.status === "scanned" && t.repo && t.revision && (!options.tools || options.tools.includes(t.id)));
  const links: TransitiveLink[] = [];
  const work = async () => {
    for (let tool = queue.shift(); tool; tool = queue.shift()) {
      const repo = tool.repo!.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, ""), revision = tool.revision!;
      try {
        const tree = (await git(["api", `repos/${repo}/git/trees/${revision}?recursive=1`, "--jq", ".tree[] | select(.type == \"blob\") | .path"])).stdout.split("\n").filter(isLockfile);
        const files = [];
        for (const path of tree.slice(0, 20)) {
          const response = await fetch(`https://raw.githubusercontent.com/${repo}/${revision}/${path.split("/").map(encodeURIComponent).join("/")}`);
          if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
          files.push({ path, content: await response.text() });
        }
        const found = transitiveLinks({ id: tool.id, revision, hits: tool.hits }, files);
        links.push(...found);
        options.log?.(`${tool.id}: ${tree.length} lockfiles, ${found.length} links${found.length ? ` (${found.map((l) => l.component).join(", ")})` : ""}`);
      } catch (error) {
        options.log?.(`${tool.id}: lockfiles unreadable: ${(error as Error).message.split("\n")[0]}`);
      }
    }
  };
  await Promise.all(Array.from({ length: options.concurrency ?? 6 }, work));
  return links.sort((a, b) => (a.tool < b.tool ? -1 : a.tool > b.tool ? 1 : a.component < b.component ? -1 : 1));
}
