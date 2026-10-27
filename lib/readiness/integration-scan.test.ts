import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Graph } from "../map-types";
import type { Evidence } from "./types";
import { canonical, finalize, inventory } from "./core";
import { addEvidence, Store } from "./store";
import { scanIntegrations, SCAN_LIMITS } from "./integration-scan";
import { checkCitation, exportPacket, reviewPacket } from "./review";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "integration-scan-"));
  const store = new Store(directory);
  const snapshot = inventory({ nodes: ["wallet", "sibling", "empty"].map((id) => ({ id, name: id, team: "Team", repo: "owner/repo" })) } as Graph, "catalog");
  for (const tool of snapshot.tools) tool.revision = "a".repeat(40);
  const source = (path: string, content: string, overrides: Record<string, unknown> = {}, toolIds = ["wallet"]) => {
    const value = { repo: "owner/repo", revision: "a".repeat(40), path, content, ...overrides };
    const evidence = store.evidence(value, `Source ${path}`, `https://github.com/owner/repo/blob/${value.revision}/${path}`);
    addEvidence(snapshot, evidence);
    for (const id of toolIds) snapshot.tools.find((tool) => tool.id === id)!.evidenceIds.push(evidence.id);
    return evidence;
  };
  return { snapshot, store, source, directory, close: () => rmSync(directory, { recursive: true, force: true }) };
}

test("scan retains exact citations and lexical categories without admitting edges, capabilities or runtime scope", () => {
  const f = fixture();
  try {
    f.source("src/provider.ts", 'fetch(endpoint);\r\nnew WebSocket(url);\r\n// documentation: CIP-30 and window.cardano\r\nconst bytes = include_bytes!("script.wasm");\r\n');
    f.source("Dockerfile", 'FROM registry.example/image:latest\nRUN curl https://example/binary -o /tool\nRUN protoc schema.proto\n');
    f.source("tests/example.ts", 'fetch("https://example/test")');
    finalize(f.snapshot); const before = canonical(f.snapshot);
    const report = scanIntegrations(f.snapshot, f.store, ["wallet"]);
    const tool = report.tools[0];
    assert.equal(tool.coverage, "partial");
    assert.deepEqual(new Set(tool.hints.map((hint) => hint.kind)), new Set(["service", "protocol", "bundled", "build", "downloaded-artifact", "code-generation"]));
    assert.ok(tool.hints.some((hint) => hint.path.startsWith("tests/")), "tests are leads, never silently promoted to runtime");
    const allowed = new Set(tool.inputEvidenceIds);
    for (const hint of tool.hints) {
      assert.equal(checkCitation(hint, f.snapshot, f.store, allowed), hint.evidenceId);
      const source = f.store.readEvidence(f.snapshot.evidence.find((e) => e.id === hint.evidenceId)!) as { content: string };
      assert.ok(source.content.split(/\r?\n/)[hint.line - 1].slice(hint.column - 1).startsWith(hint.quote));
      assert.equal(hint.disposition, "needs-review"); assert.ok(!("scope" in hint));
    }
    assert.equal(canonical(f.snapshot), before);
    assert.equal(f.snapshot.edges.length, 0); assert.equal(f.snapshot.capabilities?.length ?? 0, 0);
    const reordered = structuredClone(f.snapshot); reordered.tools.reverse(); reordered.evidence.reverse(); for (const t of reordered.tools) t.evidenceIds.reverse();
    assert.deepEqual(scanIntegrations(reordered, f.store, ["wallet"]), report);
  } finally { f.close(); }
});

test("current repository binding, historical sources, native locks, binaries and missing source remain explicit", () => {
  const f = fixture();
  try {
    f.source("old.ts", "fetch(url)", { revision: "b".repeat(40) });
    f.source("foreign.ts", "fetch(url)", { repo: "other/repo" });
    const unbound = f.source("unbound.ts", "fetch(url)", { repo: undefined }); delete unbound.sourceUrl;
    f.source("package-lock.json", '"https://registry.npmjs.org/a"');
    f.source("binary.wasm", "\0fetch(url)");
    f.source("native.ts", "fetch(url)", { repo: undefined });
    const report = scanIntegrations(f.snapshot, f.store);
    const tool = report.tools.find((t) => t.toolId === "wallet")!;
    assert.deepEqual(Object.fromEntries(tool.files.map((file) => [file.path, file.status])), { "binary.wasm": "binary", "foreign.ts": "foreign-or-unbound", "native.ts": "scanned", "old.ts": "historical", "package-lock.json": "native-lock", "unbound.ts": "foreign-or-unbound" });
    assert.equal(tool.hints.length, 1);
    const empty = report.tools.find((t) => t.toolId === "empty")!;
    assert.equal(empty.coverage, "partial"); assert.ok(empty.unresolved.some((reason) => reason.includes("No eligible")));
    assert.ok(empty.unresolved.some((reason) => reason.includes("No match")));
    const priorDigest = report.inputDigest;
    unbound.sourceUrl = `https://github.com/owner/repo/blob/${"a".repeat(40)}/unbound.ts`;
    assert.notEqual(scanIntegrations(f.snapshot, f.store).inputDigest, priorDigest);
  } finally { f.close(); }
});

test("scan bounds input and output work while retaining explicit unfinished file statuses", () => {
  const f = fixture();
  try {
    f.source("oversize.ts", "x".repeat(SCAN_LIMITS.bytesPerFile + 1));
    f.source("many.ts", "fetch(url)\n".repeat(SCAN_LIMITS.hintsPerTool + 1));
    f.source("long.ts", "x".repeat(1000) + ' fetch("https://example") ' + "x".repeat(1000), {}, ["sibling"]);
    let report = scanIntegrations(f.snapshot, f.store);
    const tool = report.tools.find((t) => t.toolId === "wallet")!;
    assert.equal(tool.hints.length, SCAN_LIMITS.hintsPerTool);
    assert.equal(tool.files.find((file) => file.path === "oversize.ts")!.status, "size-limit");
    assert.equal(tool.files.find((file) => file.path === "many.ts")!.status, "hint-limit");
    const long = report.tools.find((t) => t.toolId === "sibling")!.hints[0];
    assert.equal(long.quote.length, SCAN_LIMITS.quoteCharacters); assert.ok(long.quote.includes("fetch"));
    for (let index = 0; index <= SCAN_LIMITS.filesPerTool; index++) f.source(`src/${index}.ts`, "const x = 1", {}, ["empty"]);
    report = scanIntegrations(f.snapshot, f.store, ["empty"]);
    assert.equal(report.tools[0].files.filter((file) => file.status === "file-limit").length, 1);
    assert.ok(report.tools[0].unresolved.some((reason) => reason.includes("Scan limits")));
  } finally { f.close(); }
});

test("shared evidence is read once, corrupt/missing evidence fails, and packet exports carry a derived guide", () => {
  const f = fixture();
  try {
    f.source("provider.ts", "fetch(url)", {}, ["wallet", "sibling"]);
    let reads = 0;
    const reader = { readEvidence: (item: Evidence) => { reads++; return f.store.readEvidence(item); } };
    const report = scanIntegrations(f.snapshot, reader, ["wallet", "sibling"]);
    assert.equal(reads, 1); assert.equal(report.tools[0].hints.length, 1); assert.equal(report.tools[1].hints.length, 1);
    assert.notEqual(report.tools[0].hints[0].id, report.tools[1].hints[0].id);
    const packet = reviewPacket(f.snapshot, ["wallet"]);
    exportPacket(f.snapshot, f.store, ["wallet"], join(f.directory, "packet"));
    const guide = JSON.parse(readFileSync(join(f.directory, "packet/integration-scan.json"), "utf8"));
    assert.deepEqual(guide, scanIntegrations(packet.context, f.store, ["wallet"]));
    assert.equal(reviewPacket(f.snapshot, ["wallet"]).packetId, packet.packetId, "derived guide does not mutate review inputs");
    assert.throws(() => scanIntegrations(f.snapshot, f.store, ["missing"]), /known tools/);
    assert.throws(() => scanIntegrations(f.snapshot, f.store, ["wallet", "wallet"]), /unique/);
    assert.throws(() => scanIntegrations(f.snapshot, { readEvidence: () => { throw new Error("checksum mismatch"); } }), /checksum/);
    f.snapshot.evidence = [];
    assert.throws(() => scanIntegrations(f.snapshot, f.store), /Missing attached evidence/);
  } finally { f.close(); }
});
