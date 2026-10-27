import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseBoundaryRegister } from "./boundary";
import { parseChangeRegister } from "./dijkstra";
import { admits, classifyTool, rankClassifications, reaches as reachesLine, readConstraint, RULES, scanSources } from "./surfaces";

const changes = parseChangeRegister(JSON.parse(readFileSync("content/readiness/dijkstra/changes.json", "utf8")));
const boundary = parseBoundaryRegister(JSON.parse(readFileSync("content/readiness/dijkstra/boundary.json", "utf8")), changes);
const hit = (scan: ReturnType<typeof scanSources>, rule: string) => scan.hits.find((h) => h.rule === rule);

test("rules reference only known surfaces and boundary components", () => {
  const surfaces = new Set(changes.surfaces.map((s) => s.id)), components = new Set(boundary.components.map((c) => c.id));
  for (const rule of RULES) {
    if (rule.component !== undefined) assert.ok(components.has(rule.component), `${rule.id} names a boundary component`);
    for (const s of rule.surfaces ?? []) assert.ok(surfaces.has(s), `${rule.id} names surface ${s}`);
    assert.ok(rule.component !== undefined || rule.surfaces?.length, `${rule.id} maps to surfaces`);
  }
});

test("scanning finds dependencies only in dependency positions and separates prose from code", () => {
  const scan = scanSources([
    { path: "package.json", content: JSON.stringify({ description: "helpers for @cardano-sdk/core", scripts: { "test:scalus": "x" }, dependencies: { "@cardano-sdk/core": "0.47.1" } }, null, 2) },
    { path: "src/provider.ts", content: "import { BlockfrostProvider } from 'x';\nconst eras = ['shelley', 'alonzo', 'babbage', 'conway'];\nconst era = 'conway';\n" },
    { path: "README.md", content: "Query through the KoiosProvider.\n" },
    { path: "node_modules/x/index.js", content: "ogmios" },
    { path: ".cursor/rules/providers.md", content: "use the KupmiosProvider" },
    { path: "Cargo.toml", content: '[dependencies]\npallas-primitives = "1.4.0"\n' },
  ], "self-tool");
  assert.equal(scan.files, 4);
  assert.equal(scan.skipped, 2);
  const sdk = hit(scan, "dependency:cardano-js-sdk")!;
  assert.equal(sdk.lines, 1, "the description and script keys are not dependencies");
  assert.match(sdk.examples[0].quote, /"@cardano-sdk\/core": "0.47.1"/);
  assert.equal(hit(scan, "dependency:scalus"), undefined);
  assert.equal(hit(scan, "dependency:pallas-codecs")!.examples[0].line, 2);
  assert.equal(hit(scan, "marker:closed-era-list")!.lines, 1, "a lone era name is not a closed list");
  assert.deepEqual([hit(scan, "service:koios")!.lines, hit(scan, "service:koios")!.docLines], [0, 1]);
  assert.equal(hit(scan, "service:ogmios"), undefined, "vendored directories are skipped");
  assert.equal(hit(scan, "service:kupo"), undefined, "editor and assistant configuration is skipped");
  assert.equal(scanSources([{ path: "Cargo.toml", content: 'pallas = "1"' }], "pallas").hits.length, 0, "a component does not depend on itself");
  const scoped = scanSources([
    { path: "benchmarks/ChainSyncBench/go.mod", content: "require github.com/blinklabs-io/gouroboros v0.159.2\n" },
    { path: "workshops/issuer/package.json", content: JSON.stringify({ dependencies: { "@cardano-sdk/core": "^0.41.4" } }, null, 2) },
    { path: "src/attestation/go.mod", content: "require github.com/blinklabs-io/gouroboros v0.213.7\n" },
    { path: "plutip-rust/Cargo.toml", content: 'plutus-ledger-api = { version = "0.2.1" }\n' },
  ]);
  const gouroboros = hit(scoped, "dependency:gouroboros")!;
  assert.deepEqual([gouroboros.lines, gouroboros.auxLines], [1, 1], "benchmarks are auxiliary; directory names merely containing 'test' are not");
  assert.equal(gouroboros.examples[0].path, "src/attestation/go.mod", "shipped examples come first");
  assert.deepEqual([hit(scoped, "dependency:cardano-js-sdk")!.lines, hit(scoped, "dependency:cardano-js-sdk")!.auxLines], [0, 1]);
  assert.equal(hit(scoped, "dependency:plutus-plutus-core"), undefined, "the Rust plutus-ledger-api crate is not the Haskell package");
  const dev = scanSources([
    { path: "package.json", content: JSON.stringify({ main: "dist/index.js", dependencies: { "@meshsdk/core": "1.9.1" }, devDependencies: { "@emurgo/cardano-serialization-lib-nodejs": "14.1.2" } }, null, 2) },
    { path: "app/package.json", content: JSON.stringify({ private: true, devDependencies: { "@cardano-sdk/core": "0.47.1" } }, null, 2) },
    { path: "Cargo.toml", content: '[dependencies]\npallas-network = "0.35.1"\n\n[dev-dependencies]\npallas-traverse = "0.30.0"\n' },
    { path: "lib.cabal", content: "library\n  build-depends: base\n\ntest-suite spec\n  build-depends:\n    , plutus-tx ^>=1.40\n" },
    { path: "build.gradle", content: "implementation 'com.bloxbean.cardano:yaci:0.4.7'\ntestImplementation 'com.bloxbean.cardano:cardano-client-lib:0.6.0'\n" },
  ]);
  const counts = (rule: string) => { const h = hit(dev, rule)!; return [h.lines, h.auxLines]; };
  assert.deepEqual(counts("dependency:meshjs-mesh-sdk"), [1, 0]);
  assert.deepEqual(counts("dependency:cardano-serialization-lib-csl"), [0, 1], "a published library's devDependencies are not shipped");
  assert.deepEqual(counts("dependency:cardano-js-sdk"), [1, 0], "an application bundles its devDependencies");
  assert.deepEqual([counts("dependency:pallas"), counts("dependency:pallas-codecs")], [[1, 0], [0, 1]], "Cargo dev-dependencies are not shipped");
  assert.deepEqual(counts("dependency:plutus-plutus-core"), [0, 1], "Cabal test-suite stanzas are not shipped");
  assert.deepEqual([counts("dependency:yaci"), counts("dependency:bloxbean-cardano-client-library")], [[1, 0], [0, 1]], "Gradle test configurations are not shipped");
  assert.equal(hit(dev, "dependency:plutus-plutus-core")!.pins, undefined, "auxiliary lines are never pins");
  const prose = scanSources([
    { path: "Cargo.toml", content: 'description = "Wrapper around the cardano-serialization-lib"\n# pallas = "0.1"\n' },
    { path: "run.sh", content: "# accepts cardano-cli style JSON\ncardano-cli latest transaction build\n" },
  ]);
  assert.deepEqual(prose.hits.map((h) => `${h.rule}:${h.lines}`), ["marker:cli-era-command:1", "service:cardano-cli:1"], "manifest comments and passing CLI mentions are not coupling");
});

test("classification inherits R2 readiness through coupling, not through markers or prose", () => {
  const scan = scanSources([
    { path: "go.mod", content: "require github.com/blinklabs-io/gouroboros v0.209.0\n" },
    { path: "src/main.go", content: "const sock = os.Getenv(\"CARDANO_NODE_SOCKET_PATH\")\n// PlutusV3 only\n" },
    { path: "docs/usage.md", content: "Point it at Ogmios.\n" },
  ]);
  const tool = classifyTool({ id: "example", repo: "o/r", revision: "a".repeat(40) }, scan, boundary, changes);
  assert.equal(tool.exposure, "dependency");
  const n2c = tool.surfaces.find((s) => s.surface === "node-to-client-protocol")!;
  assert.deepEqual(n2c.channels.map((c) => c.via).sort(), ["gouroboros@0.209.0<v0.213.0", "service:node-socket"], "pinned below the release that added V23");
  assert.equal(n2c.readiness, "gap");
  assert.equal(tool.surfaces.some((s) => s.channels.some((c) => c.via === "ogmios")), false, "documentation mentions are not coupling");
  const current = classifyTool({ id: "current", repo: "o/c", revision: "f".repeat(40) }, scanSources([{ path: "go.mod", content: "require github.com/blinklabs-io/gouroboros v0.213.7\n" }]), boundary, changes);
  assert.equal(current.surfaces.find((s) => s.surface === "node-to-client-protocol")!.readiness, "verified", "V23 passed the devnet handshake (R4)");
  const reaches = (quote: string, path: string, needed: string) => { const c = readConstraint(quote, path); return c && admits(c, needed.split(".").map(Number)); };
  assert.equal(reaches('pallas = { git = "https://github.com/txpipe/pallas" }', "Cargo.toml", "0.35.1"), null, "git references carry no version");
  assert.equal(reaches('pallas-traverse = "0.35.0"', "Cargo.toml", "0.35.1"), true, "Cargo defaults to caret");
  assert.equal(reaches('pallas = "=0.35.0"', "Cargo.toml", "0.35.1"), false);
  assert.equal(reaches('"@cardano-sdk/core": "^0.46.10",', "package.json", "0.47.0"), false, "a 0.x caret stays within the minor");
  assert.equal(reaches(", plutus-ledger-api ^>=1.65", "a.cabal", "1.71.0.0"), false, "a PVP major stops at the next minor");
  assert.equal(reaches(", plutus-tx >= 1.5.0", "a.cabal", "1.71.0.0"), true, "lower bounds are not pins");
  assert.equal(reaches('"pycardano>=0.9.0",', "pyproject.toml", "1.0"), true);
  assert.equal(reaches("<version.ccl>0.4.3</version.ccl>", "pom.xml", "0.7"), false);
  const lines = [[0, 3, 10], [0, 4, 2]];
  assert.equal(reachesLine({ kind: "exact", version: [0, 4, 3] }, lines), true, "0.4.3 is past the first release of its own line");
  assert.equal(reachesLine({ kind: "exact", version: [0, 4, 1] }, lines), false, "0.4.1 is newer than 0.3.10 but on a line without the support");
  assert.equal(reachesLine({ kind: "exact", version: [0, 3, 4, 1] }, lines), false);
  assert.equal(reachesLine({ kind: "caret", version: [0, 3, 4] }, lines), true, "a 0.3 caret admits 0.3.10");
  assert.equal(reachesLine({ kind: "exact", version: [0, 5, 0] }, lines), true, "past every listed line");
  const yaci = (pin: string) => classifyTool({ id: "y", repo: "o/y", revision: "7".repeat(40) }, scanSources([{ path: "build.gradle", content: `implementation('com.bloxbean.cardano:yaci:${pin}')\n` }]), boundary, changes)
    .surfaces.find((s) => s.surface === "node-to-client-protocol")!;
  assert.deepEqual([yaci("0.4.3").readiness, yaci("0.4.1").readiness, yaci("0.4.1").channels[0].via], ["released", "gap", "yaci@0.4.1<v0.3.10|v0.4.2"]);
  const codecs = classifyTool({ id: "codec-user", repo: "o/u", revision: "1".repeat(40) }, scanSources([{ path: "Cargo.toml", content: 'pallas-primitives = "0.32"\n' }]), boundary, changes);
  assert.equal(codecs.surfaces.some((s) => s.surface === "node-to-client-protocol"), false, "codec crates do not carry the mini-protocols");
  assert.equal(scanSources([{ path: "Cargo.toml", content: 'pallas-crypto = "0.30"\npallas-addresses = "0.30"\n' }]).hits.length, 0, "crates outside the changed surfaces");
  const plutus = tool.surfaces.find((s) => s.surface === "plutus-language")!;
  assert.deepEqual(plutus.channels.map((c) => [c.channel, c.via, c.readiness]), [
    ["dependency", "gouroboros@0.209.0<v0.213.0", "gap"], ["marker", "marker:plutus-language-enum", "unassessed"],
  ]);
  assert.equal(plutus.readiness, "gap", "the marker does not override the dependency's readiness");

  const markersOnly = classifyTool({ id: "m", repo: "o/m", revision: "b".repeat(40) }, scanSources([{ path: "a.ts", content: "PlutusV3" }]), boundary, changes);
  assert.deepEqual([markersOnly.exposure, markersOnly.readiness], ["marker", "unassessed"]);
  const haskell = classifyTool({ id: "hs", repo: "o/h", revision: "8".repeat(40) }, scanSources([
    { path: "app/app.cabal", content: "library\n  build-depends:\n    , cardano-api\n    , ouroboros-consensus\n    , cardano-ledger-core\n" },
    { path: "cabal.project", content: "constraints:\n  , cardano-api ==11.0.0.0\n  , cardano-ledger-conway >=1.19\n" },
  ]), boundary, changes);
  const api = haskell.surfaces.find((s) => s.surface === "cardano-api-haskell")!;
  assert.deepEqual([api.channels[0].via, api.readiness], ["cardano-api@11.0.0.0<11.8.0.0", "gap"], "pins are read from every versioned manifest line, not only the examples");
  assert.equal(haskell.surfaces.find((s) => s.surface === "node-to-client-protocol")!.readiness, "upstream", "unversioned upstream names stay upstream");
  const benchOnly = classifyTool({ id: "bench", repo: "o/b", revision: "9".repeat(40) }, scanSources([{ path: "benchmarks/go.mod", content: "require github.com/blinklabs-io/gouroboros v0.159.2\n" }]), boundary, changes);
  assert.deepEqual([benchOnly.exposure, benchOnly.readiness], ["auxiliary", "unassessed"], "auxiliary coupling never sets readiness");
  assert.ok(benchOnly.surfaces.every((s) => s.channels.every((c) => c.scope === "auxiliary")));
  const none = classifyTool({ id: "n", repo: "o/n", revision: "c".repeat(40) }, scanSources([{ path: "a.ts", content: "x" }]), boundary, changes);
  assert.equal(none.exposure, "none-found");
  const hidden = classifyTool({ id: "eternl", repo: "eternl.io", revision: null }, { status: "no-public-source", note: "website" }, boundary, changes);
  assert.deepEqual([hidden.exposure, hidden.readiness], ["unknown", "unassessed"]);
  const own = classifyTool({ id: "cardano-wallet", repo: "x/y", revision: "d".repeat(40) }, scanSources([]), boundary, changes);
  assert.equal(own.exposure, "implements");
  assert.equal(own.surfaces.find((s) => s.surface === "node-to-client-protocol")!.readiness, "gap");
  const upstream = classifyTool({ id: "cardano-cli", repo: "IntersectMBO/cardano-cli", revision: "e".repeat(40) }, scanSources([]), boundary, changes);
  assert.deepEqual([upstream.exposure, upstream.readiness, upstream.surfaces.length], ["implements", "upstream", changes.surfaces.length]);

  const ranked = rankClassifications([none, markersOnly, benchOnly, hidden, tool, own]).map((t) => t.id);
  assert.deepEqual(ranked, ["cardano-wallet", "example", "eternl", "bench", "m", "n"]);
});
