import { posix } from "node:path";
import { digest } from "./core";
import type { Evidence, Snapshot } from "./types";
import type { Store } from "./store";

const VERSION = 1;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export const SCAN_LIMITS = { filesPerTool: 200, bytesPerFile: 2 * 1024 * 1024, hintsPerTool: 2000, quoteCharacters: 500 } as const;
const LOCKS = new Set(["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "poetry.lock", "uv.lock", "Cargo.lock", "go.sum"]);
const RULES = [
  { id: "service-call-or-url", kind: "service", pattern: /https?:\/\/|wss?:\/\/|\bfetch\s*\(|\baxios\.(?:get|post|put|delete|request)\s*\(|\bnew\s+WebSocket\s*\(/i },
  { id: "protocol-or-wallet-marker", kind: "protocol", pattern: /\b(?:ouroboros|ogmios|chain[-_ ]?sync|local[-_ ]?tx[-_ ]?submission|json[-_ ]?rpc|CIP[-_ ]?30)\b|\bwindow\.cardano\b/i },
  { id: "embedded-or-vendored-reference", kind: "bundled", pattern: /\.(?:wasm|so|dylib|dll)\b|\binclude_bytes!|\/\/go:embed\b|\bvendor(?:ed)?[/\\]|\[submodule\s/i },
  { id: "generator-command", kind: "code-generation", pattern: /\b(?:protoc|cbindgen|bindgen|wasm-bindgen|quicktype|openapi-generator|graphql-codegen)\b/i },
  { id: "download-command", kind: "downloaded-artifact", pattern: /\b(?:curl|wget)\b|\b(?:downloadFile|download_file|downloadBinary)\s*\(|^\s*ADD\s+https?:\/\//i },
  { id: "container-build-input", kind: "build", pattern: /^\s*(?:FROM\s+\S+|COPY\s+--from=\S+)/i, file: /(?:^|\/)(?:Dockerfile|Containerfile)(?:\.[^/]*)?$/i },
] as const;

type Source = { path: string; revision: string; content: string; repo?: string };
type ScanContext = Pick<Snapshot, "tools" | "profiles" | "evidence">;
interface ScannedFile {
  evidenceId: string; path: string; revision: string; bytes: number;
  status: "scanned" | "historical" | "foreign-or-unbound" | "native-lock" | "binary" | "size-limit" | "file-limit" | "hint-limit";
}
interface Hint {
  id: string; rule: string; kind: typeof RULES[number]["kind"];
  path: string; line: number; column: number; evidenceId: string; pointer: "/content"; quote: string;
  disposition: "needs-review";
}

function capturedSource(value: unknown): Source | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return typeof row.path === "string" && typeof row.revision === "string" && typeof row.content === "string"
    ? { path: row.path, revision: row.revision, content: row.content, ...(typeof row.repo === "string" ? { repo: row.repo } : {}) } : null;
}

function belongsTo(source: Source, evidence: Evidence, repo: string | null) {
  if (!repo || !/^[a-f0-9]{40,64}$/.test(source.revision) || source.path.split("/").some((p) => !p || p === "." || p === "..")) return false;
  if (source.repo !== undefined) return source.repo.toLowerCase() === repo.toLowerCase();
  if (!evidence.sourceUrl) return false;
  try {
    const url = new URL(evidence.sourceUrl);
    return url.origin === "https://github.com" && decodeURIComponent(url.pathname) === `/${repo}/blob/${source.revision}/${source.path}`;
  } catch { return false; }
}

/** Lexical leads over captured files, never an integration review or a graph admission. */
export function scanIntegrations(context: ScanContext, store: Pick<Store, "readEvidence">, toolIds = context.tools.map((tool) => tool.id)) {
  const ids = new Set(toolIds);
  if (!ids.size || ids.size !== toolIds.length || toolIds.some((id) => !context.tools.some((tool) => tool.id === id))) throw new Error("Select unique known tools for integration scanning");
  const evidence = new Map(context.evidence.map((item) => [item.id, item]));
  const sources = new Map<string, Source | null>();
  const inspected = new Map<string, { hints: Omit<Hint, "id" | "evidenceId" | "disposition">[]; truncated: boolean }>();
  const tools = context.tools.filter((tool) => ids.has(tool.id)).sort((a, b) => compare(a.id, b.id)).map((tool) => {
    const attached = [...new Set([...tool.evidenceIds, ...context.profiles.filter((p) => p.toolId === tool.id).flatMap((p) => p.evidenceIds)])].sort();
    const files: ScannedFile[] = [], hints: Hint[] = [];
    let scanned = 0;
    for (const id of attached) {
      const item = evidence.get(id);
      if (!item) throw new Error(`Missing attached evidence ${id}`);
      if (!sources.has(id)) sources.set(id, capturedSource(store.readEvidence(item)));
      const source = sources.get(id);
      if (!source) continue;
      const file: ScannedFile = { evidenceId: id, path: source.path, revision: source.revision, bytes: Buffer.byteLength(source.content), status: "scanned" };
      files.push(file);
      if (!belongsTo(source, item, tool.repo)) { file.status = "foreign-or-unbound"; continue; }
      if (source.revision !== tool.revision) { file.status = "historical"; continue; }
      if (LOCKS.has(posix.basename(source.path))) { file.status = "native-lock"; continue; }
      if (source.content.includes("\0")) { file.status = "binary"; continue; }
      if (file.bytes > SCAN_LIMITS.bytesPerFile) { file.status = "size-limit"; continue; }
      if (scanned >= SCAN_LIMITS.filesPerTool) { file.status = "file-limit"; continue; }
      if (hints.length >= SCAN_LIMITS.hintsPerTool) { file.status = "hint-limit"; continue; }
      scanned++;
      // Exact evidence can serve several catalog roots without repeating inspection.
      if (!inspected.has(id)) {
        const found: Omit<Hint, "id" | "evidenceId" | "disposition">[] = [];
        let truncated = false;
        outer: for (const [index, line] of source.content.split(/\r?\n/).entries()) for (const rule of RULES) {
          if ("file" in rule && !rule.file.test(source.path)) continue;
          const match = rule.pattern.exec(line);
          if (!match) continue;
          if (found.length === SCAN_LIMITS.hintsPerTool) { truncated = true; break outer; }
          const start = line.length <= SCAN_LIMITS.quoteCharacters ? 0 : Math.max(0, match.index - 80);
          found.push({ rule: rule.id, kind: rule.kind, path: source.path, line: index + 1, column: start + 1, pointer: "/content", quote: line.slice(start, start + SCAN_LIMITS.quoteCharacters) });
        }
        inspected.set(id, { hints: found, truncated });
      }
      const result = inspected.get(id)!;
      const available = SCAN_LIMITS.hintsPerTool - hints.length;
      if (result.truncated || result.hints.length > available) file.status = "hint-limit";
      hints.push(...result.hints.slice(0, available).map((hint) => ({ ...hint, id: `scan-hint:${digest({ toolId: tool.id, revision: tool.revision, evidenceId: id, rule: hint.rule, line: hint.line })}`, evidenceId: id, disposition: "needs-review" as const })));
    }
    files.sort((a, b) => compare(a.path, b.path) || compare(a.evidenceId, b.evidenceId));
    hints.sort((a, b) => compare(a.path, b.path) || a.line - b.line || compare(a.rule, b.rule) || compare(a.id, b.id));
    return {
      toolId: tool.id, repo: tool.repo, revision: tool.revision ?? null, coverage: "partial" as const,
      inputEvidenceIds: attached, files, hints,
      unresolved: [
        "Only attached, retained source files at this tool's current revision were eligible. Uncaptured repository files, dependencies and deployed configuration remain unexamined.",
        "Lexical matches may be comments, documentation, examples or tests. No production scope, target identity, enabled integration or capability is established.",
        "No match does not establish absence of integrations. Manual source review and native resolution remain necessary.",
        ...(!files.some((file) => file.status === "scanned" || file.status === "hint-limit") ? ["No eligible source content was scanned."] : []),
        ...(files.some((file) => ["size-limit", "file-limit", "hint-limit"].includes(file.status)) ? ["Scan limits left source content unexamined; inspect the per-file statuses and split the evidence scope for follow-up."] : []),
        ...(files.some((file) => file.status === "binary") ? ["Binary content requires a separate artifact inventory or inspection."] : []),
      ],
    };
  });
  const bindings = [...new Set(tools.flatMap((tool) => tool.inputEvidenceIds))].sort().map((id) => ({ id, sourceUrl: evidence.get(id)!.sourceUrl ?? null }));
  const inputDigest = digest({ scannerVersion: VERSION, limits: SCAN_LIMITS, evidenceBindings: bindings, tools: tools.map(({ toolId, repo, revision, inputEvidenceIds }) => ({ toolId, repo, revision, inputEvidenceIds })) });
  return { schemaVersion: 1, scannerVersion: VERSION, inputDigest, limits: SCAN_LIMITS, rules: RULES.map(({ id, kind }) => ({ id, kind })), tools };
}
