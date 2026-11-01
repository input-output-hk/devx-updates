# Dijkstra devnet recipe (R4)

What `content/readiness/dijkstra/devnet.json` was produced with. Everything runs locally against a one-pool
testnet; nothing is sent to any public network.

Needs `curl`, `jq`, `gh`, `go`, `python3`, `xxd` and `script` (util-linux). About 2.5 GB of disk: the node
tarball unpacks to ~1 GB, the Go module cache takes ~0.5 GB, Ogmios and Kupo ~0.2 GB each. Step 9 also needs
`cargo` and `rustc` (on NixOS: `nix shell nixpkgs#cargo nixpkgs#rustc nixpkgs#gcc`) and `node`/`npm`, and about
2 GB more for the Rust builds.

`DEVNET_DIR` (default `/tmp/dijkstra-11.2.0`) must be a short path: the node socket lives under it and Unix
socket paths are limited to 108 bytes.

## Steps

1. `./start.sh` (leave it running). Downloads the official node **11.2.0** Linux amd64 archive,
   verifies SHA256 `8b287e300ffb2063522fc33d50da6ecee8fa10fc7445c906fae0ca9783db8e03`,
   and runs revision `dac0d7ab2dfdee1f9eda901589e3c6ac8eaa1899` (CLI 11.6.0.0).
   GitHub marks this tag as a prerelease. The generated versioned configuration enables the experimental
   Dijkstra fork at epoch 2; the script also writes an equivalent legacy configuration for services.
   Epochs are 200 slots of 0.1 s, so the chain enters Dijkstra after about 40 seconds.
2. `./hardfork.sh 11`, then `./hardfork.sh 12 <txid printed by the first run>`. The test fork trigger moves the
   era but leaves the protocol version at 10, so two hard-fork initiation actions raise it to 12 before testing PV12 behavior.
3. `./build-probe.sh v0.213.9 $DEVNET_DIR/probe-v0.213.9` (and `v0.216.3`, `v0.213.0`, `v0.208.5`). `probe/` calls gouroboros
   the way its consumers do; see the comment at the top of `probe/main.go`.
4. Node-to-client: `python3 -I handshake.py $DEVNET_DIR/env/socket/node1/sock 42 16,17,18,19,20,21,22` and
   `... 23`; `probe-<version> handshake <socket>`.
5. `MEMPOOL_PROBE=$DEVNET_DIR/probe-v0.213.9 ./transactions.sh`. The script refuses to run below PV12. Conway-built and Dijkstra-built cases (including Dijkstra metadata), one
   submission each, while the probe records the mempool to `$DEVNET_DIR/work/tx/mempool.hex`. Label those lines
   with `python3 -I txid.py`, prefix each with a name, and feed them to `probe-<version> decode`.
6. `probe-<version> chain <socket>` syncs from origin through gouroboros; `probe-v0.213.9 first-blocks <socket>`
   prints the first raw block per era, and `python3 -I cbor_dump.py <hex> 3` shows its structure.
7. `./services.sh` runs Ogmios v7.0.0 and Kupo v2.12.
8. `./tools.sh txtop` and `./tools.sh cardano-node-api` build both tools at their historical control revisions (txtop `86a013e`, cardano-node-api `1368155`), pinned and
   upgraded, and exercise them. The upgraded cardano-node-api only builds with the two files in `patches/`; those
   patches are this experiment's, not upstream changes.
9. Codecs (rerun 2026-11-01). `build-pallas-probe.sh <revision> $DEVNET_DIR/pallas-probe-<name> [dijkstra]` for Pallas
   v1.4.0 (`aef0b5a0`), main (`b4a519faa9522a1ab0629d976316d9153dfeebd7`) and the dijkstra branch (`e7ea1726`, with `dijkstra`, which turns on
   Pallas's unstable feature). `pallas-probe-<name> chain <socket>` decodes every block the way Oura and Dolos do;
   `pallas-probe-<name> decode < labeled` decodes the mempool lines from step 5. `pallas-probe-main blocks <socket>
   > $DEVNET_DIR/blocks.txt` dumps every raw block for the codecs without a node client:
   `build-cml-probe.sh 6.2.0 $DEVNET_DIR/cml-probe-6.2.0`, then `cml-probe-6.2.0 blocks < blocks.txt` and
   `... decode < labeled`. For cardano-js-sdk, `npm install --ignore-scripts @cardano-sdk/core@0.47.1` into its own
   directory and run `node js-probe/probe.cjs <that directory> < labeled`. The text envelopes from step 5
   (`jq -r .cborHex $DEVNET_DIR/work/tx/*.signed`, each line prefixed with a name) are decoded the same way.
10. Service layer (rerun 2026-11-01). `./service-layer.sh` runs cardano-db-sync 13.7.2.1 on a `postgres:16` container
    (port 5433) against the devnet for 150 s, then Blockfrost RYO v6.8.2 on its database (port 3100), and prints
    each one's state next to the node's tip; `./service-layer.sh stop` removes both. Needs docker and about 2 GB.
    db-sync requires the genesis hashes in the node config and Shelley's systemStart to equal Byron's
    whole-second startTime; cardano-testnet writes neither, so the script gives db-sync its own node config and a
    Shelley genesis copy rounded to Byron's second. Koios was not run: it reads the same db-sync tables.

11. CSL and PyCardano (rerun 2026-11-01). Without Rust: `probe-v0.213.9 blocks <socket> > $DEVNET_DIR/blocks.txt` dumps
    every Dijkstra block through gouroboros (it stops after 3 idle seconds at the tip). For CSL,
    `npm install --ignore-scripts @emurgo/cardano-serialization-lib-nodejs@<version>` into its own directory (17.0.0,
    the newest release, and 15.0.3, which Blockfrost locks), then `node csl-probe/probe.cjs <that directory> txs <
    labeled` and `... blocks < blocks.txt`. For PyCardano, create a virtual environment, `pip install pycardano==0.19.2
    "cbor2<6"` (cbor2 6.x breaks the cbor2pure PyCardano imports), and run `<venv>/bin/python -I py-probe/probe.py <
    labeled`. The labeled file adds one Dijkstra-built transaction with metadata (`cardano-cli dijkstra transaction
    build ... --metadata-json-file`), which tells the codecs that read the third array element as `is_valid` apart.

## Retained evidence and determinism

The November run is in `content/readiness/dijkstra-runs/2026-11-01/`; the complete previous assessment is in
`content/readiness/dijkstra-history/2026-10-26-integration/`. The site's `/map/dijkstra/history` compares them.
Ogmios and Kupo were also tried with the generated versioned configuration: both reject its nested genesis paths.
The remaining service checks use the flattened configuration; their successful handshake does not imply block decoding.

For fixed input bytes, tool versions and configuration, parsing, source citation checks, lexical classification,
report generation and offline fixture decoding are deterministic. Replaying a built probe against the retained
fixtures should reproduce the semantic result. GitHub observations, human source judgments, fresh dependency
resolution and live devnet runs are not deterministic. Keys, transaction hashes, slots, block counts and timing vary.
The run retains dependency locks/module lists and toolchain versions; an unconstrained fresh install is not an exact replay.

`blocks.txt.gz` contains **unwrapped** block bytes for CSL. `blocks-hfc.txt.gz` contains **HFC-wrapped** bytes for CML,
including one Conway positive control. Do not feed the unwrapped file into the CML probe: it expects `[era-tag, block]`.
`transactions-labeled.txt` has 17 encodings and can be fed directly to the transaction probes. The retained checksums
cover the fixtures and logs, not private testnet keys. Stop the local testnet after collecting evidence; use
`./service-layer.sh stop` to stop its db-sync process and remove its two containers.
