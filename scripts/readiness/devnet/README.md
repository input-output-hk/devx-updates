# Dijkstra devnet recipe (R4)

What `content/readiness/dijkstra/devnet.json` was produced with. Everything runs locally against a one-pool
testnet; nothing is sent to any public network.

Needs `curl`, `jq`, `gh`, `go`, `python3`, `xxd` and `script` (util-linux). About 2.5 GB of disk: the node
tarball unpacks to ~1 GB, the Go module cache takes ~0.5 GB, Ogmios and Kupo ~0.2 GB each. Step 9 also needs
`cargo` and `rustc` (on NixOS: `nix shell nixpkgs#cargo nixpkgs#rustc nixpkgs#gcc`) and `node`/`npm`, and about
2 GB more for the Rust builds.

`DEVNET_DIR` (default `/tmp/dijkstra-devnet`) must be a short path: the node socket lives under it and Unix
socket paths are limited to 108 bytes.

## Steps

1. `./start.sh` (leave it running). Downloads the static Linux build of cardano-node `34ae34db` (the 11.2
   integration branch, PR 6677) from IOG's Hydra, generates a one-pool environment with `cardano-testnet
   create-env`, adds `ExperimentalHardForksEnabled` and `TestDijkstraHardForkAtEpoch: 2`, and starts it. Epochs are
   200 slots of 0.1 s, so the chain is in Dijkstra after about 40 seconds.
2. `./hardfork.sh 11`, then `./hardfork.sh 12 <txid printed by the first run>`. The test fork trigger moves the
   era but leaves the protocol version at 10, so two hard-fork initiation actions raise it to 12 as on mainnet.
3. `./build-probe.sh v0.213.9 $DEVNET_DIR/probe-v0.213.9` (and `v0.213.0`, `v0.208.5`). `probe/` calls gouroboros
   the way its consumers do; see the comment at the top of `probe/main.go`.
4. Node-to-client: `python3 -I handshake.py $DEVNET_DIR/env/socket/node1/sock 42 16,17,18,19,20,21,22` and
   `... 23`; `probe-<version> handshake <socket>`.
5. `MEMPOOL_PROBE=$DEVNET_DIR/probe-v0.213.9 ./transactions.sh`. Conway-built and Dijkstra-built cases, one
   submission each, while the probe records the mempool to `$DEVNET_DIR/work/tx/mempool.hex`. Label those lines
   with `python3 -I txid.py`, prefix each with a name, and feed them to `probe-<version> decode`.
6. `probe-<version> chain <socket>` syncs from origin through gouroboros; `probe-v0.213.9 first-blocks <socket>`
   prints the first raw block per era, and `python3 -I cbor_dump.py <hex> 3` shows its structure.
7. `./services.sh` runs Ogmios v7.0.0 and Kupo v2.12.
8. `./tools.sh txtop` and `./tools.sh cardano-node-api` build both tools at their scanned revisions, pinned and
   upgraded, and exercise them. The upgraded cardano-node-api only builds with the two files in `patches/`; those
   patches are this experiment's, not upstream changes.
9. Codecs (2026-10-22). `build-pallas-probe.sh <revision> $DEVNET_DIR/pallas-probe-<name> [dijkstra]` for Pallas
   v1.4.0 (`aef0b5a0`), main (`e6c38ac5`) and the dijkstra branch (`e7ea1726`, with `dijkstra`, which turns on
   Pallas's unstable feature). `pallas-probe-<name> chain <socket>` decodes every block the way Oura and Dolos do;
   `pallas-probe-<name> decode < labeled` decodes the mempool lines from step 5. `pallas-probe-main blocks <socket>
   > $DEVNET_DIR/blocks.txt` dumps every raw block for the codecs without a node client:
   `build-cml-probe.sh 6.2.0 $DEVNET_DIR/cml-probe-6.2.0`, then `cml-probe-6.2.0 blocks < blocks.txt` and
   `... decode < labeled`. For cardano-js-sdk, `npm install --ignore-scripts @cardano-sdk/core@0.47.1` into its own
   directory and run `node js-probe/probe.cjs <that directory> < labeled`. The text envelopes from step 5
   (`jq -r .cborHex $DEVNET_DIR/work/tx/*.signed`, each line prefixed with a name) are decoded the same way.
