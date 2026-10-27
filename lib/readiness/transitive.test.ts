import { test } from "node:test";
import assert from "node:assert/strict";
import { lockedPackages, transitiveLinks, withTransitive } from "./transitive";

const revision = "a".repeat(40);
const tool = (hits: { rule: string }[] = []) => ({ id: "app", revision, hits: hits.map((h) => ({ ...h, files: 1, lines: 1, auxLines: 0, docLines: 0, examples: [] })) });

test("a component reached through a package outside the catalog is linked at its own locked line", () => {
  const lock = JSON.stringify({ packages: {
    "": { dependencies: { "@blockfrost/blockfrost-js": "^6" } },
    "node_modules/@blockfrost/blockfrost-js": { dependencies: { "@emurgo/cardano-serialization-lib-nodejs": "^13" } },
    "node_modules/@emurgo/cardano-serialization-lib-nodejs": {},
    "node_modules/@cardano-sdk/core": { dev: true },
  } }, null, 2);
  const links = transitiveLinks(tool(), [{ path: "package-lock.json", content: lock }]);
  assert.deepEqual(links.map((l) => [l.component, l.package, l.quote]), [["cardano-serialization-lib-csl", "@emurgo/cardano-serialization-lib-nodejs", '"node_modules/@emurgo/cardano-serialization-lib-nodejs": {},']]);
  assert.equal(lock.split("\n")[links[0].line - 1].trim(), links[0].quote, "the line is the package's own entry");
});

test("a component reached only through a declared catalog component is that component's dependency", () => {
  const lock = [
    '"@meshsdk/core-cst@^1":', "  version \"1.9.1\"", "  dependencies:", '    "@cardano-sdk/core" "^0.46"', "",
    '"@cardano-sdk/core@^0.46":', "  version \"0.46.12\"", "",
    '"@cardano-sdk/dapp-connector@^0.13":', "  dependencies:", '    "@cardano-sdk/core" "^0.46"', "",
  ].join("\n");
  assert.deepEqual(transitiveLinks(tool([{ rule: "dependency:meshjs-mesh-sdk" }]), [{ path: "yarn.lock", content: lock }]).map((l) => l.component), ["cardano-js-sdk"],
    "dapp-connector is required by the project itself, so the sdk is reached outside Mesh too");
  const onlyMesh = lock.split("\n\"@cardano-sdk/dapp-connector")[0];
  assert.deepEqual(transitiveLinks(tool([{ rule: "dependency:meshjs-mesh-sdk" }]), [{ path: "yarn.lock", content: onlyMesh }]), []);
  assert.deepEqual(transitiveLinks(tool(), [{ path: "yarn.lock", content: onlyMesh }]).map((l) => [l.component, l.package]), [["meshjs-mesh-sdk", "@meshsdk/core-cst"]],
    "without a declaration the nearest component, Mesh, is the link");
});

test("Cargo workspace crates are the root; Pallas codec crates exclude the protocol surfaces", () => {
  const lock = [
    "[[package]]", 'name = "gateway"', 'version = "0.1.0"', "dependencies = [", ' "chain-follower",', "]", "",
    "[[package]]", 'name = "chain-follower"', 'version = "0.0.19"', 'source = "git+https://example/catalyst-libs"', "dependencies = [", ' "pallas-traverse",', "]", "",
    "[[package]]", 'name = "pallas-traverse"', 'version = "0.33.0"', 'source = "registry+https://github.com/rust-lang/crates.io-index"',
  ].join("\n");
  assert.deepEqual(lockedPackages("Cargo.lock", lock).find((p) => p.name === "pallas-traverse")?.parents, new Set(["chain-follower"]));
  const [link] = transitiveLinks(tool(), [{ path: "Cargo.lock", content: lock }]);
  assert.deepEqual([link.component, link.package, link.line], ["pallas", "pallas-traverse", 17]);
  const scan = withTransitive({ files: 1, skipped: 0, hits: [] }, [link]);
  assert.equal(scan.hits[0].rule, "transitive:pallas-codecs");
});
