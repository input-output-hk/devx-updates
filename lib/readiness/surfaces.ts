import { STATUSES, worstStatus, type BoundaryRegister, type Component } from "./boundary";
import type { ChangeRegister } from "./dijkstra";

/**
 * Surface classification (plan revision R3): which changed surfaces each catalog tool touches, through which
 * channel, and the readiness it inherits. Rules are lexical leads, never a verdict that a tool breaks or not.
 */

export const CHANNELS = ["implements", "dependency", "service", "marker"] as const;
export type Channel = (typeof CHANNELS)[number];
/** Readiness a touched surface inherits: an R2 status, `upstream` (the 11.2 component set itself) or `unassessed`. */
export const READINESS = [...STATUSES, "upstream", "unassessed"] as const;
export type Readiness = (typeof READINESS)[number];

export interface Rule {
  id: string; channel: Exclude<Channel, "implements">; pattern: RegExp;
  /** Boundary component whose R2 surfaces and statuses the hit inherits. */
  component?: string;
  /** Surfaces for rules without a boundary component. */
  surfaces?: string[];
  readiness?: Readiness;
  files?: RegExp;
  /** Component surfaces this artifact does not carry. */
  excludeSurfaces?: string[];
}

const MANIFEST = /(?:^|\/)(?:package\.json|Cargo\.toml|go\.mod|pom\.xml|build\.gradle(?:\.kts)?|settings\.gradle(?:\.kts)?|libs\.versions\.toml|[^/]+\.cabal|cabal\.project|package\.yaml|stack\.yaml|pyproject\.toml|requirements[^/]*\.txt|setup\.py|setup\.cfg|Pipfile|[^/]+\.csproj|Directory\.Packages\.props|pubspec\.yaml|spago\.(?:dhall|yaml)|packages\.dhall|elm\.json|build\.sbt|deps\.edn|mix\.exs|Gemfile|deno\.json|flake\.nix|aiken\.toml|composer\.json|CMakeLists\.txt|conanfile\.(?:txt|py)|vcpkg\.json|Package\.swift|Podfile)$/;
const HASKELL = /(?:^|\/)(?:[^/]+\.cabal|cabal\.project(?:\.[^/]+)?|package\.yaml|stack\.yaml)$/;
const ERA_NAMES = ["byron", "shelley", "allegra", "mary", "alonzo", "babbage", "conway"];

const dep = (component: string, pattern: RegExp): Rule => ({ id: `dependency:${component}`, channel: "dependency", component, pattern, files: MANIFEST });
const upstream = (id: string, pattern: RegExp, surfaces: string[]): Rule => ({ id: `dependency:${id}`, channel: "dependency", surfaces, readiness: "upstream", pattern, files: MANIFEST });
const service = (id: string, pattern: RegExp, target: { component?: string; surfaces?: string[]; readiness?: Readiness }): Rule => ({ id: `service:${id}`, channel: "service", pattern, ...target });
const marker = (id: string, pattern: RegExp, surfaces: string[]): Rule => ({ id: `marker:${id}`, channel: "marker", pattern, surfaces, readiness: "unassessed" });

const PROVIDER = ["era-identity", "transaction-encoding", "protocol-parameters"];
const CLI_COMMANDS = "conway|latest|babbage|alonzo|dijkstra|transaction|query|address|stake-address|stake-pool|governance|key|node|genesis|hash|debug|legacy|compatible|byron|text-view|version|--version";

export const RULES: Rule[] = [
  dep("cardano-serialization-lib-csl", /@emurgo\/cardano-serialization-lib|\bcardano[-_]serialization[-_]lib\b/),
  dep("cardano-multiplatform-lib-cml", /@dcspark\/cardano-multiplatform-lib|\bcardano-multiplatform-lib\b|^\s*cml-(?:chain|core|crypto|multi-era)\b/m),
  // The umbrella crate and pallas-network carry the mini-protocols; codec crates only the ledger surfaces.
  // pallas-crypto, -addresses, -math and -wallet implement nothing Dijkstra changes; pallas-uplc is uplc-turbo's crate.
  dep("pallas", /^\s*pallas(?:-network2?)?\s*=/m),
  { ...dep("pallas", /^\s*pallas-(?:primitives|traverse|codec|hardano|validate|utxorpc|txbuilder|configs|applying)\s*=/m), id: "dependency:pallas-codecs", excludeSurfaces: ["node-to-client-protocol", "consensus-participation"] },
  dep("gouroboros", /github\.com\/blinklabs-io\/gouroboros\b/),
  dep("cardano-js-sdk", /["']@cardano-sdk\/[a-z-]+["']/),
  dep("bloxbean-cardano-client-library", /\bcardano-client-(?:lib|core|backend|quicktx|plutus|transaction-spec|crypto|address|metadata|cip[0-9a-z-]*|supplier|common|function)\b/),
  dep("yaci", /com\.bloxbean\.cardano["']?\s*[:,]\s*(?:name\s*[:=]\s*)?["']?yaci(?:-core|-helper)?\b|<artifactId>yaci(?:-core|-helper)?<\/artifactId>/),
  dep("yaci-store", /\byaci-store(?:-[a-z-]+)?\b/),
  dep("pycardano", /\bpycardano\b/),
  dep("cometa-js", /@biglup\/cometa\b/),
  dep("buildooor", /@harmoniclabs\/buildooor\b/),
  dep("ouroboros-miniprotocols-ts", /@harmoniclabs\/ouroboros-miniprotocols-ts\b/),
  dep("plu-ts", /@harmoniclabs\/plu-ts\b/),
  dep("cardano-data-lite", /\bcardano-data-lite\b/),
  dep("evolution-sdk", /["']@evolution-sdk\/[a-z-]+["']/),
  dep("cardanosharp", /\bCardanoSharp\.Wallet\b/),
  dep("ouroboros-network-js", /@stricahq\/ouroboros-network-js\b/),
  dep("typhonjs", /@stricahq\/typhonjs\b/),
  dep("apollo", /github\.com\/Salvionied\/apollo\b/),
  dep("whisky", /^\s*whisky(?:-[a-z]+)?\s*=|@sidan-lab\/whisky\b/m),
  dep("elm-cardano", /\belm-cardano\/elm-cardano\b|"elm-cardano"/),
  dep("cquisitor-lib", /\bcquisitor(?:-lib)?\b/),
  dep("ledgerjs-hw-app-cardano", /@cardano-foundation\/ledgerjs-hw-app-cardano\b/),
  dep("cardano-hw-interop-lib", /\bcardano-hw-interop-lib\b/),
  dep("amaru", /^\s*amaru-[a-z-]+\s*=/m),
  dep("hydra", /\bhydra-(?:node|cardano-api|tx|plutus|prelude)\b/),
  // Haskell manifests only: the Rust plutus-ledger-api crate is a separate project.
  { ...dep("plutus-plutus-core", /\bplutus-(?:ledger-api|tx|core|tx-plugin)\b/), files: HASKELL },
  dep("opshin", /\bopshin\b/),
  dep("helios", /@helios-lang\/|@hyperionbt\/helios\b/),
  dep("plutarch", /\bplutarch(?:-[a-z-]+)?\b/),
  dep("scalus", /"org\.scalus"|["']scalus["']\s*:|\bscalus-(?:cardano-ledger|core|plugin|bloxbean-cardano-client-lib)\b/),
  dep("uplc-turbo", /\buplc-turbo\b/),
  dep("plutigo", /github\.com\/blinklabs-io\/plutigo\b/),
  dep("julc", /\bjulc(?:-[a-z-]+)?\b/),
  dep("meshjs-mesh-sdk", /["']@meshsdk\/[a-z-]+["']/),
  dep("lucid-evolution", /["']@lucid-evolution\/[a-z-]+["']/),
  dep("blaze", /["']@blaze-cardano\/[a-z-]+["']/),
  dep("atlas", /\batlas-cardano\b/),
  dep("cardano-transaction-lib-ctl", /\bcardano-transaction-lib\b/),
  dep("kuber", /\bkuber(?:-client|-server)?\b/),
  dep("utxorpc", /\butxorpc(?:-spec|-sdk)?\b|@utxorpc\//),
  dep("mithril", /\bmithril-client\b/),
  { id: "dependency:aiken", channel: "dependency", component: "aiken", pattern: /^\s*name\s*=/m, files: /(?:^|\/)aiken\.toml$/ },
  upstream("cardano-api", /\bcardano-api(?:-classic)?\b(?!-)/, ["cardano-api-haskell", "era-identity", "transaction-encoding"]),
  upstream("cardano-ledger", /\bcardano-ledger-(?:api|core|conway|dijkstra|babbage|alonzo|shelley|binary)\b/, ["era-identity", "transaction-encoding", "transaction-rules", "protocol-parameters"]),
  upstream("ouroboros-consensus", /\bouroboros-consensus(?:-cardano)?\b|\bouroboros-network(?:-protocols)?\b/, ["node-to-client-protocol", "block-encoding", "era-identity"]),

  service("blockfrost", /blockfrost\.io|@blockfrost\/|blockfrost[-_](?:js|python|go|rust|java|dotnet|haskell)\b|\bBlockfrost(?:Provider|API|Api|Client)\b/i, { component: "blockfrost" }),
  service("koios", /koios\.rest|\bKoios(?:Provider|Client|Api)\b|koios[-_](?:client|python|go|java)\b/i, { component: "koios" }),
  // Maestro is deprecated (2026-10-22): no Dijkstra support will follow, so a shipped call is a gap until the tool moves provider.
  service("maestro", /gomaestro(?:-api)?\.org|\bMaestro(?:Provider|Client)\b|@maestro-org\//i, { surfaces: PROVIDER, readiness: "gap" }),
  service("ogmios", /\bogmios\b/i, { component: "ogmios" }),
  service("kupo", /\bkupo\b|\bkupmios\b/i, { component: "kupo" }),
  service("cardano-db-sync", /cardano-db-sync|\bdb-?sync\b|\bdbsync\b|\bma_tx_out\b/i, { component: "cardano-db-sync" }),
  service("cardano-wallet", /\/v2\/(?:wallets|byron-wallets|network\/information)\b|cardano-wallet-js\b|cardano-wallet serve\b/, { component: "cardano-wallet" }),
  service("node-socket", /CARDANO_NODE_SOCKET_PATH|\bnode\.socket\b|--socket-path\b/, { surfaces: ["node-to-client-protocol"], readiness: "upstream" }),
  service("cardano-cli", new RegExp(`\\bcardano-cli\\s+(?:${CLI_COMMANDS})\\b`), { surfaces: ["cardano-cli"], readiness: "upstream" }),
  service("submit-api", /cardano-submit-api|\/api\/submit\/tx\b/, { surfaces: ["transaction-encoding"], readiness: "upstream" }),
  service("utxorpc", /\butxorpc\b|\bdolos\b/i, { component: "utxorpc" }),

  marker("closed-era-list", new RegExp(`\\bconway\\b`, "i"), ["era-identity"]),
  marker("cli-era-command", /\bcardano-cli\s+(?:conway|latest|babbage|alonzo)\b/, ["cardano-cli", "era-identity"]),
  marker("plutus-language-enum", /\bplutus[_-]?(?:script[_-]?)?v3\b|\bPlutusV3\b|\bPlutusScriptV3\b/i, ["plutus-language"]),
  marker("cost-models-or-parameters", /\bcost[_-]?models?\b|\bmax[_-]?tx[_-]?ex(?:ecution)?[_-]?units\b|\bmin[_-]?fee[_-]?ref[_-]?script\b/i, ["protocol-parameters"]),
  marker("raw-cbor-codec", /\b(?:cbor-x|borc|cbor2|cbor-js|ciborium|minicbor|serde_cbor|fxamacker\/cbor|cborg|@harmoniclabs\/cbor|jackson-dataformat-cbor|cbor-redux|cbor-web)\b/i, ["transaction-encoding", "block-encoding"]),
  marker("segregated-block-body", /\binvalid[_-]?transactions\b|\btransaction[_-]?bodies\b|\btransaction[_-]?witness[_-]?sets\b/i, ["block-encoding"]),
  marker("legacy-stake-certificate", /\bstake[_-]?registration\b|\bStakeRegistration\b|\bstake[_-]?deregistration\b|\bStakeDeregistration\b/i, ["transaction-encoding"]),
  marker("script-context", /\bScriptContext\b|\bTxInfo\b|\bscript[_-]context\b/, ["plutus-script-context"]),
  marker("pool-registration", /\bpool[_-]?registration\b|\bPoolRegistration\b|\bpool[_-]?params\b|\bPoolParams\b/i, ["stake-pool-registration"]),
  // Configuration and genesis generators: every node configuration names the Conway genesis, a Dijkstra one adds another.
  marker("genesis-config", /\b(?:ConwayGenesisFile|ConwayGenesisHash|conway-genesis\.json|DijkstraGenesisFile|TestConwayHardForkAtEpoch)\b/, ["node-configuration"]),
  marker("node-to-client", /\bNodeToClient\b|\bnode[-_ ]to[-_ ]client\b|\bn2c\b|\bLocalStateQuery\b|\blocal[-_ ]?state[-_ ]?query\b/i, ["node-to-client-protocol"]),
];

// Dependency trees, build output and development-assistant or editor configuration describe how a tool is built, not what it does.
const SKIP = /(?:^|\/)(?:node_modules|vendor|dist|build|target|\.git|\.yarn|bower_components|\.next|out|coverage|\.claude[^/]*|\.cursor|\.codex|\.windsurf|\.agents?)\/|(?:^|\/)(?:\.eslintcache|CLAUDE\.md|AGENTS\.md|GEMINI\.md|\.cursorrules|copilot-instructions\.md)$/;
const LOCKS = /(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|poetry\.lock|uv\.lock|Cargo\.lock|go\.sum|Gemfile\.lock|composer\.lock|flake\.lock|cabal\.project\.freeze|gradle\.lockfile|packages\.lock\.json)$/;
const BINARY = /\.(?:png|jpe?g|gif|webp|ico|svg|pdf|woff2?|ttf|otf|eot|zip|gz|tgz|xz|bz2|wasm|so|dylib|dll|a|o|jar|class|bin|mp4|mp3|lock|min\.js|map|plutus|cbor|der|db|sqlite)$/i;
export const SCAN_LIMITS = { bytesPerFile: 1024 * 1024, examplesPerRule: 3, pinsPerRule: 12, quoteCharacters: 200 } as const;

/**
 * Tests, examples, benchmarks, demos and workshops couple a repository to a component without shipping that coupling to
 * users. Their hits are kept as auxiliary channels that never set readiness.
 */
const AUXILIARY = /(?:^|\/)(?:[^/]*[-_.])?(?:tests?|__tests__|tester|testkit|testing|testdata|specs?|e2e|examples?|samples?|demos?|bench(?:mark)?(?:s|es)?|playgrounds?|workshops?|tutorials?|fixtures?|mocks?)(?:[-_.][^/]*)?\/|(?:^|\/)[^/]*(?:[._-](?:test|spec|bench)|Spec|Test|Tests|Bench)\.[a-z]+$/i;
export const auxiliary = (path: string) => AUXILIARY.test(path);

export interface SourceFile { path: string; content: string }
export interface Example { path: string; line: number; quote: string }
/**
 * `lines` counts shipped code and manifests; `auxLines` tests, examples, benchmarks and demos; `docLines` prose, which
 * never establishes exposure. Examples prefer shipped code, then auxiliary code, then prose.
 */
export interface Hit { rule: string; files: number; lines: number; auxLines: number; docLines: number; examples: Example[]; pins?: Example[] }
export interface Scan { files: number; skipped: number; hits: Hit[] }

const DOCS = /(?:^|\/)(?:docs?|documentation|_backup|archive|website|site)\/|\.(?:md|mdx|markdown|rst|adoc|txt|tex|org)$|(?:^|\/)(?:CHANGELOG|CHANGES|HISTORY|NEWS|README|AUTHORS)(?:\.[^/]*)?$/i;

/** Names declared in package.json dependency sections; other keys (scripts, description) are not dependencies. */
function packageDependencies(content: string): Set<string> | null {
  try {
    const json = JSON.parse(content) as Record<string, unknown>;
    const names = new Set<string>();
    for (const key of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "overrides", "resolutions"]) {
      const section = json[key];
      if (section && typeof section === "object") for (const name of Object.keys(section)) names.add(name);
    }
    return names;
  } catch { return null; }
}

function publishedLibrary(content: string): boolean {
  try {
    const json = JSON.parse(content) as Record<string, unknown>;
    return json.private !== true && ["main", "module", "exports", "types"].some((k) => json[k] !== undefined);
  } catch { return false; }
}

/**
 * Manifest lines that declare development-only dependencies: npm `devDependencies` of a published library, Cargo `dev-dependencies` tables,
 * Cabal `test-suite`/`benchmark` stanzas, Gradle test configurations and Maven test-scoped dependencies.
 */
export function developmentLines(path: string, content: string): Set<number> {
  const lines = content.split("\n"), dev = new Set<number>();
  if (/(?:^|\/)package\.json$/.test(path)) {
    // Applications bundle their devDependencies; only a published library leaves them behind.
    if (!publishedLibrary(content)) return dev;
    let depth = 0, inside = false;
    lines.forEach((line, i) => {
      if (!inside && /^\s*"devDependencies"\s*:\s*\{/.test(line)) { inside = true; depth = 0; }
      if (!inside) return;
      dev.add(i + 1);
      depth += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0);
      if (depth <= 0) inside = false;
    });
  } else if (/(?:^|\/)Cargo\.toml$/.test(path)) {
    let inside = false;
    lines.forEach((line, i) => {
      const header = /^\s*\[([^\]]+)\]/.exec(line);
      if (header) inside = /(?:^|\.)dev-dependencies(?:\.|$)/.test(header[1].replace(/'[^']*'|"[^"]*"/g, "t"));
      if (inside) dev.add(i + 1);
    });
  } else if (/\.cabal$/.test(path)) {
    let inside = false;
    lines.forEach((line, i) => {
      if (/^[A-Za-z]/.test(line)) inside = /^(?:test-suite|benchmark)\b/i.test(line);
      if (inside) dev.add(i + 1);
    });
  } else if (/(?:^|\/)build\.gradle(?:\.kts)?$/.test(path)) {
    lines.forEach((line, i) => { if (/^\s*(?:test|androidTest|testFixtures|integrationTest)[A-Za-z]*\s*[("' ]/.test(line)) dev.add(i + 1); });
  } else if (/(?:^|\/)pom\.xml$/.test(path)) {
    let start = -1;
    lines.forEach((line, i) => {
      if (/<dependency>/.test(line)) start = i;
      if (start >= 0 && /<\/dependency>/.test(line)) {
        if (lines.slice(start, i + 1).some((l) => /<scope>\s*test\s*<\/scope>/.test(l))) for (let j = start; j <= i; j++) dev.add(j + 1);
        start = -1;
      }
    });
  }
  return dev;
}

const MANIFEST_PROSE = /^\s*(?:#|--|\/\/|\/\*|\*|<!--|;)|^\s*["']?(?:description|summary|synopsis|repository|homepage|documentation|authors?|keywords|license|readme)["']?\s*[=:]/i;

export function scannable(path: string, bytes: number): boolean {
  return !SKIP.test(path) && !LOCKS.test(path) && !BINARY.test(path) && bytes <= SCAN_LIMITS.bytesPerFile;
}

/** Each rule is one global scan per file; line numbers are computed only for hits. */
export function scanSources(files: SourceFile[], self?: string, rules = RULES): Scan {
  const hits = new Map<string, Hit>();
  const pools = new Map<string, Example[][]>();
  let scanned = 0, skipped = 0;
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (!scannable(file.path, Buffer.byteLength(file.content)) || file.content.includes("\0")) { skipped++; continue; }
    scanned++;
    let starts: number[] | undefined;
    const prose = DOCS.test(file.path), aux = !prose && AUXILIARY.test(file.path);
    const npm = /(?:^|\/)package\.json$/.test(file.path) ? packageDependencies(file.content) : undefined;
    let development: Set<number> | undefined;
    for (const rule of rules) {
      if (rule.files && !rule.files.test(file.path)) continue;
      if (rule.component !== undefined && rule.component === self) continue;
      const global = new RegExp(rule.pattern.source, rule.pattern.flags.includes("g") ? rule.pattern.flags : `${rule.pattern.flags}g`);
      const lines = new Set<number>();
      for (const match of file.content.matchAll(global)) {
        starts ??= lineStarts(file.content);
        const line = lineAt(starts, match.index!);
        const text = lineText(file.content, starts, line);
        if (rule.id === "marker:closed-era-list" && !closedEraList(text)) continue;
        // Comments and descriptive keys in manifests name packages without depending on them.
        if (rule.channel === "dependency" && MANIFEST_PROSE.test(text)) continue;
        if (npm !== undefined && rule.channel === "dependency" && !(npm && npm.has(/^\s*"([^"]+)"\s*:/.exec(text)?.[1] ?? ""))) continue;
        lines.add(line);
      }
      if (!lines.size) continue;
      const hit = hits.get(rule.id) ?? { rule: rule.id, files: 0, lines: 0, auxLines: 0, docLines: 0, examples: [] };
      hit.files++;
      // Development-only manifest declarations are auxiliary like test code.
      if (rule.channel === "dependency" && !prose && !aux) development ??= developmentLines(file.path, file.content);
      const rank = (line: number) => (prose ? 2 : aux || development?.has(line) ? 1 : 0);
      const pool = pools.get(rule.id) ?? [[], [], []];
      for (const line of lines) {
        const r = rank(line);
        if (r === 2) hit.docLines++; else if (r === 1) hit.auxLines++; else hit.lines++;
        if (pool[r].length < SCAN_LIMITS.examplesPerRule) pool[r].push({ path: file.path, line, quote: lineText(file.content, starts!, line).trim().slice(0, SCAN_LIMITS.quoteCharacters) });
      }
      pools.set(rule.id, pool);
      // Versioned shipped manifest lines, so constraint checks are not limited to the first examples.
      if (rule.channel === "dependency" && !prose && !aux) {
        for (const line of [...lines].filter((l) => rank(l) === 0)) {
          const quote = lineText(file.content, starts!, line).trim().slice(0, SCAN_LIMITS.quoteCharacters);
          if (!/\d+\.\d+/.test(quote) || (hit.pins ??= []).length >= SCAN_LIMITS.pinsPerRule) continue;
          hit.pins.push({ path: file.path, line, quote });
        }
      }
      hits.set(rule.id, hit);
    }
  }
  for (const [id, pool] of pools) hits.get(id)!.examples = pool.flat().slice(0, SCAN_LIMITS.examplesPerRule);
  return { files: scanned, skipped, hits: [...hits.values()].sort((a, b) => (a.rule < b.rule ? -1 : 1)) };
}

/** A line naming Conway alongside at least two earlier eras reads as a closed era enumeration. */
function closedEraList(line: string): boolean {
  const lower = line.toLowerCase();
  return ERA_NAMES.filter((era) => new RegExp(`\\b${era}\\b`).test(lower)).length >= 3;
}

function lineStarts(content: string): number[] {
  const starts = [0];
  for (let i = content.indexOf("\n"); i !== -1; i = content.indexOf("\n", i + 1)) starts.push(i + 1);
  return starts;
}
function lineAt(starts: number[], index: number): number {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= index) lo = mid; else hi = mid - 1; }
  return lo + 1;
}
function lineText(content: string, starts: number[], line: number): string {
  const end = line < starts.length ? starts[line] - 1 : content.length;
  return content.slice(starts[line - 1], end).replace(/\r$/, "");
}

export interface Constraint { kind: "exact" | "caret" | "tilde" | "pvp" | "minimum"; version: number[] }

const VERSION = /(\d+(?:\.\d+)*)/;
const parts = (v: string) => v.split(".").map(Number);

/**
 * Read the version constraint a manifest line declares, with each ecosystem's default operator:
 * Go modules pin exactly; Cargo and Poetry default to caret; npm, Maven and Gradle to exact; Cabal `^>=` is a PVP major.
 * Unbounded or unversioned references (git, path, workspace, plain Cabal names) return null.
 */
export function readConstraint(quote: string, path: string): Constraint | null {
  if (/(?:^|\/)go\.mod$/.test(path)) {
    const m = /\sv(\d+\.\d+\.\d+)/.exec(quote);
    return m ? { kind: "exact", version: parts(m[1]) } : null;
  }
  if (/\.cabal$|cabal\.project|package\.yaml$/.test(path)) {
    const m = /(\^>=|==|>=|>)\s*(\d+(?:\.\d+)*)/.exec(quote);
    if (!m) return null;
    return { kind: m[1] === "^>=" ? "pvp" : m[1] === "==" ? "exact" : "minimum", version: parts(m[2]) };
  }
  const xml = />\s*(\d+(?:\.\d+)+)\s*</.exec(quote);
  if (xml) return { kind: "exact", version: parts(xml[1]) };
  const m = /(\^|~=|~|==|>=|>|=)?\s*v?(\d+\.\d+(?:\.\d+)*)/.exec(quote);
  if (!m) return null;
  const op = m[1] ?? "";
  const kind = op === "^" ? "caret" : op === "~" || op === "~=" ? "tilde" : op === ">=" || op === ">" ? "minimum"
    : op === "=" || op === "==" ? "exact" : /Cargo\.toml$|pyproject\.toml$/.test(path) ? "caret" : "exact";
  return { kind, version: parts(m[2]) };
}

export function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
}

/** Whether a constraint admits `needed` or a later version. */
export function admits(c: Constraint, needed: number[]): boolean {
  const [major = 0, minor = 0, patch = 0] = c.version;
  if (c.kind === "minimum") return true;
  if (c.kind === "exact") return compareVersions(c.version, needed) >= 0;
  const upper = c.kind === "pvp" ? [major, minor + 1]
    : c.kind === "tilde" ? [major, minor + 1]
    : major > 0 ? [major + 1] : minor > 0 ? [0, minor + 1] : [0, 0, patch + 1];
  return compareVersions(needed, upper) < 0;
}

/** Package versions of the target component set (R1), against which upstream Haskell pins are compared. */
export function targetVersions(changes: ChangeRegister): Map<string, string> {
  const selection = (changes.target as { componentSelection?: { components?: { package?: unknown; version?: unknown }[] } }).componentSelection;
  return new Map((selection?.components ?? []).filter((c) => typeof c.package === "string" && typeof c.version === "string").map((c) => [c.package as string, c.version as string]));
}

/** An upstream pin that cannot reach the target component set's version is a gap; unversioned names stay `upstream`. */
function upstreamPin(targets: Map<string, string>, pins: Example[]): { readiness: Readiness; via: string } | null {
  for (const pin of pins) for (const [name, version] of targets) {
    if (!new RegExp(`(?:^|[^\\w-])${name}(?![\\w-])`).test(pin.quote)) continue;
    const c = readConstraint(pin.quote.slice(pin.quote.indexOf(name) + name.length), pin.path);
    if (c && !admits(c, parts(version))) return { readiness: "gap", via: `${name}@${c.version.join(".")}<${version}` };
  }
  return null;
}

const sameLine = (a: number[], b: number[]) => (a[0] ?? 0) === (b[0] ?? 0) && ((a[0] ?? 0) > 0 || (a[1] ?? 0) === (b[1] ?? 0));

/**
 * Whether a constraint can resolve to a release with the support, given the first such release on each release line:
 * a version at or past the first release of its own line (or past every listed one) has it; a range also reaches any
 * listed first release it admits.
 */
export function reaches(c: Constraint, firsts: number[][]): boolean {
  if (c.kind === "minimum") return true;
  const latest = firsts.reduce((m, v) => (compareVersions(v, m) > 0 ? v : m));
  const has = (v: number[]) => compareVersions(v, latest) >= 0 || firsts.some((n) => sameLine(v, n) && compareVersions(v, n) >= 0);
  if (has(c.version)) return true;
  return c.kind !== "exact" && firsts.some((n) => compareVersions(n, c.version) > 0 && admits(c, n));
}

/** A consumer whose constraint cannot reach a first release with a surface's support has a gap on that surface. */
function inherited(component: Component, surface: string, examples: Example[]): { readiness: Readiness; via: string } {
  const status = worstStatus(component, surface);
  const firsts = component.assessments.find((a) => a.surfaces.includes(surface) && a.firstReleases)?.firstReleases;
  const needed = firsts?.map((r) => VERSION.exec(r.tag)?.[1]).filter((v): v is string => v !== undefined).map(parts);
  if (needed?.length) for (const e of examples) {
    const c = readConstraint(e.quote, e.path);
    if (c && !reaches(c, needed)) return { readiness: "gap", via: `${component.id}@${c.version.join(".")}<${firsts!.map((r) => r.tag).join("|")}` };
  }
  return { readiness: status, via: component.id };
}

export type Scope = "shipped" | "auxiliary";
export interface SurfaceExposure { surface: string; channels: { channel: Channel; via: string; readiness: Readiness; lines: number; scope: Scope }[]; readiness: Readiness }
/** The 11.2 component set itself: these tools define the target rather than consume it. */
export const UPSTREAM_TOOLS = new Set(["cardano-node", "cardano-cli", "cardano-submit-api", "cardano-testnet"]);
export type Exposure = "implements" | "dependency" | "service" | "marker" | "auxiliary" | "none-found" | "unknown";
/** Repository state at classification time; archived or long-idle repositories change how a gap is followed up. */
export interface RepositoryActivity { archived: boolean; pushedAt: string }
export interface ToolClassification {
  id: string; repo: string | null; revision: string | null;
  scan: { status: "scanned" | "no-public-source" | "checkout-failed"; files: number; skipped: number; note?: string };
  activity?: RepositoryActivity;
  exposure: Exposure; readiness: Readiness; surfaces: SurfaceExposure[]; hits: Hit[];
}

const READINESS_ORDER: Readiness[] = ["gap", "unassessed", "no-evidence", "tracked", "in-progress", "upstream", "released", "verified"];
const worse = (a: Readiness, b: Readiness) => (READINESS_ORDER.indexOf(a) <= READINESS_ORDER.indexOf(b) ? a : b);

/** Combine a tool's own R2 entry with its scan into touched surfaces and inherited readiness. */
export function classifyTool(
  tool: { id: string; repo: string | null; revision: string | null }, scan: Scan | { status: "no-public-source" | "checkout-failed"; note: string },
  boundary: BoundaryRegister, changes: ChangeRegister, rules = RULES,
): ToolClassification {
  const known = new Set(changes.surfaces.map((s) => s.id));
  const components = new Map(boundary.components.map((c) => [c.id, c]));
  const bySurface = new Map<string, SurfaceExposure>();
  const sets = (c: { channel: Channel; scope: Scope }) => c.channel !== "marker" && c.scope === "shipped";
  const add = (surface: string, channel: Channel, via: string, readiness: Readiness, lines: number, scope: Scope = "shipped") => {
    if (!known.has(surface)) throw new Error(`Rule ${via} names unknown surface ${surface}`);
    const entry = bySurface.get(surface) ?? { surface, channels: [], readiness: "unassessed" as Readiness };
    const coupled = entry.channels.some(sets);
    entry.channels.push({ channel, via, readiness, lines, scope });
    // Markers and auxiliary code show a surface is touched; readiness comes from what shipped code is coupled to.
    if (sets({ channel, scope })) entry.readiness = coupled ? worse(entry.readiness, readiness) : readiness;
    bySurface.set(surface, entry);
  };
  const own = components.get(tool.id);
  if (own) for (const s of own.surfaces) add(s, "implements", tool.id, worstStatus(own, s), 0);
  const isUpstream = UPSTREAM_TOOLS.has(tool.id);
  const hits = "hits" in scan ? scan.hits : [];
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const targets = targetVersions(changes);
  for (const hit of hits) {
    const rule = ruleById.get(hit.rule);
    if (!rule) throw new Error(`Unknown rule ${hit.rule}`);
    if (!(hit.lines || hit.auxLines) || isUpstream) continue;
    const scope: Scope = hit.lines ? "shipped" : "auxiliary", lines = hit.lines || hit.auxLines;
    if (rule.component !== undefined) {
      const component = components.get(rule.component);
      if (!component) throw new Error(`Rule ${rule.id} names unknown component ${rule.component}`);
      for (const s of component.surfaces.filter((x) => !rule.excludeSurfaces?.includes(x))) {
        const { readiness, via } = rule.channel === "dependency" ? inherited(component, s, hit.pins ?? hit.examples) : { readiness: worstStatus(component, s), via: rule.component };
        add(s, rule.channel, via, readiness, lines, scope);
      }
    } else {
      const pinned = rule.channel === "dependency" && rule.readiness === "upstream" && scope === "shipped" ? upstreamPin(targets, hit.pins ?? []) : null;
      for (const s of rule.surfaces ?? []) add(s, rule.channel, pinned?.via ?? rule.id, pinned?.readiness ?? rule.readiness ?? "unassessed", lines, scope);
    }
  }
  if (isUpstream) for (const s of changes.surfaces) add(s.id, "implements", tool.id, "upstream", 0);
  const surfaces = [...bySurface.values()].sort((a, b) => (a.surface < b.surface ? -1 : 1));
  const all = surfaces.flatMap((s) => s.channels);
  const channels = new Set(all.filter((c) => c.scope === "shipped").map((c) => c.channel));
  const exposure: Exposure = !("hits" in scan) && !own && !isUpstream ? "unknown"
    : (["implements", "dependency", "service"] as const).find((c) => channels.has(c))
      ?? (all.some((c) => c.scope === "auxiliary" && c.channel !== "marker") ? "auxiliary" : channels.has("marker") ? "marker" : "none-found");
  const coupled = surfaces.filter((s) => s.channels.some(sets));
  const readiness = coupled.reduce<Readiness>((w, s) => worse(w, s.readiness), coupled.length ? "verified" : "unassessed");
  return {
    id: tool.id, repo: tool.repo, revision: tool.revision,
    scan: "hits" in scan ? { status: "scanned", files: scan.files, skipped: scan.skipped } : { status: scan.status, files: 0, skipped: 0, note: scan.note },
    exposure, readiness, surfaces, hits,
  };
}

/** Investigation order: closest coupling first, then worst inherited readiness, then breadth. */
export function rankClassifications(items: ToolClassification[]): ToolClassification[] {
  const tier: Exposure[] = ["implements", "dependency", "service", "unknown", "auxiliary", "marker", "none-found"];
  return [...items].sort((a, b) => tier.indexOf(a.exposure) - tier.indexOf(b.exposure)
    || READINESS_ORDER.indexOf(a.readiness) - READINESS_ORDER.indexOf(b.readiness)
    || b.surfaces.length - a.surfaces.length || (a.id < b.id ? -1 : 1));
}

/** Path filters for other readers of the same repositories (lockfiles in the transitive pass). */
export const SKIP_PATH = SKIP, AUXILIARY_PATH = AUXILIARY;
