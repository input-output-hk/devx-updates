# Dijkstra devnet recipe (R4)

What `content/readiness/dijkstra/devnet.json` was produced with. Everything runs locally against a one-pool
testnet; nothing is sent to any public network.

Needs `curl`, `jq`, `gh`, `go`, `python3`, `xxd` and `script` (util-linux). About 2.5 GB of disk: the node
tarball unpacks to ~1 GB, the Go module cache takes ~0.5 GB, Ogmios and Kupo ~0.2 GB each. Step 9 also needs
`cargo` and `rustc` (on NixOS: `nix shell nixpkgs#cargo nixpkgs#rustc nixpkgs#gcc`) and `node`/`npm`, and about
2 GB more for the Rust builds.

`DEVNET_DIR` (default `/tmp/dijkstra-11.2.1`) must be a short path: the node socket lives under it and Unix
socket paths are limited to 108 bytes.

## Steps

1. `./start.sh` (leave it running). Downloads the official node **11.2.1** Linux amd64 archive,
   verifies SHA256 `88276ed753f460ee876c03c305ad68de9e4a16945f7c741e08130bf296791174`,
   and runs revision `90bc1cd9380a78a63091ff673f8c5693152c8f60` (CLI 11.7.0.0).
   GitHub marks this tag as a prerelease. The generated versioned configuration enables the experimental
   Dijkstra fork at epoch 2; the script also writes an equivalent legacy configuration for services.
   Epochs are 200 slots of 0.1 s, so the chain enters Dijkstra after about 40 seconds.
2. `./hardfork.sh 11`, then `./hardfork.sh 12 <txid printed by the first run>`. The test fork trigger moves the
   era but leaves the protocol version at 10, so two hard-fork initiation actions raise it to 12 before testing PV12 behavior.
3. `./build-probe.sh v0.221.0 $DEVNET_DIR/probe-v0.221.0` (the 2026-11-01 run also built `v0.213.9`, `v0.216.3`, `v0.213.0` and `v0.208.5`). `probe/` calls gouroboros
   the way its consumers do; see the comment at the top of `probe/main.go`.
4. Node-to-client: `python3 -I handshake.py $DEVNET_DIR/env/socket/node1/sock 42 16,17,18,19,20,21,22` and
   `... 23`; `probe-<version> handshake <socket>`.
5. `MEMPOOL_PROBE=$DEVNET_DIR/probe-v0.213.9 ./transactions.sh`. The script refuses to run below PV12. Conway-built and Dijkstra-built cases (including Dijkstra metadata), one
   submission each, while the probe records the mempool to `$DEVNET_DIR/work/tx/mempool.hex`. Label those lines
   with `python3 -I txid.py`, prefix each with a name, and feed them to `probe-<version> decode`.
   Then `MEMPOOL_PROBE=... ./advanced.sh` builds the Dijkstra-only bodies transactions.sh does not: a direct deposit
   into the stake key transactions.sh registered, a top-level transaction carrying a signed sub-transaction
   (`cardano-cli dijkstra sub-transaction`), an output holding a PlutusV4 reference script, a native signature guard,
   a PlutusV4 guard (its always-succeeding script runs in phase two), an account balance interval the account meets and
   one it does not, which the node must reject. Guards and balance intervals need cardano-cli 11.7 (node 11.2.1). Its
   mempool goes to `$DEVNET_DIR/work/adv/mempool.hex`. Label both mempools and envelopes the same way (one file,
   `labeled`): pair each mempool line with the envelope of the same transaction id.
6. `probe-<version> chain <socket>` syncs from origin through gouroboros; `probe-v0.213.9 first-blocks <socket>`
   prints the first raw block per era, and `python3 -I cbor_dump.py <hex> 3` shows its structure.
7. `./services.sh` runs Ogmios v7.0.0 and Kupo v2.12. `OGMIOS_PORT` and `KUPO_PORT` move them off 1337 and 1442 when
   another local service (Yaci DevKit, for one) holds those ports.
8. `./tools.sh txtop` and `./tools.sh cardano-node-api` build both tools at their historical control revisions (txtop `86a013e`, cardano-node-api `1368155`), pinned and
   upgraded, and exercise them. The upgraded cardano-node-api only builds with the two files in `patches/`; those
   patches are this experiment's, not upstream changes. `./tools.sh txtop-release [GOUROBOROS]` builds txtop's latest
   release v0.17.0 as released and with its gouroboros pin raised (default v0.221.0), puts a Dijkstra payment in the
   mempool and records what each build draws.
9. Codecs (rerun 2026-11-23). `build-pallas-probe.sh <revision> $DEVNET_DIR/pallas-probe-<name> [dijkstra]` for Pallas
   v1.5.0-rc.3 (`0e187bc5`) and main (`0b17c8f6`), both with `dijkstra`, which turns on Pallas's unstable feature. Pass
   a commit, not a tag object: Cargo resolves an annotated tag's object id, but the lock then names the commit. Build
   inside `nix shell nixpkgs#cargo nixpkgs#rustc nixpkgs#gcc`; a bare rustup shim has no default toolchain. `pallas-probe-<name> chain <socket>` decodes every block the way Oura and Dolos do;
   `pallas-probe-<name> decode < labeled` decodes the mempool lines from step 5. `pallas-probe-main blocks <socket>
   > $DEVNET_DIR/blocks.txt` dumps every raw block for the codecs without a node client:
   `build-cml-probe.sh 6.2.0 $DEVNET_DIR/cml-probe-6.2.0`, then `cml-probe-6.2.0 blocks < blocks.txt` and
   `... decode < labeled`. For cardano-js-sdk, `npm install --ignore-scripts @cardano-sdk/core@0.47.1` (still the newest) into its own
   directory and run `node js-probe/probe.cjs <that directory> < labeled`. Its code is maintained in lace-sdk as
   `@laceio/cardano` since October 2026: install a version of that into another directory and run
   `node js-probe/probe.cjs <that directory> @laceio/cardano < labeled` (rerun 2026-11-25 for 0.1.1 and
   0.2.0-canary.3). The text envelopes from step 5
   (`jq -r .cborHex $DEVNET_DIR/work/tx/*.signed`, each line prefixed with a name) are decoded the same way.
10. Service layer (rerun 2026-11-01). `./service-layer.sh` runs cardano-db-sync 13.7.2.1 on a `postgres:16` container
    (port 5433) against the devnet for 150 s, then Blockfrost RYO v6.8.2 on its database (port 3100), and prints
    each one's state next to the node's tip; `./service-layer.sh stop` removes both. Needs docker and about 2 GB.
    db-sync requires the genesis hashes in the node config and Shelley's systemStart to equal Byron's
    whole-second startTime; cardano-testnet writes neither, so the script gives db-sync its own node config and a
    Shelley genesis copy rounded to Byron's second. Koios was not run: it reads the same db-sync tables.
    `DBSYNC_VERSION` and `BLOCKFROST_IMAGE` pick other versions; the defaults reproduce the 2026-11-01 run. The
    2026-11-09 run used `DBSYNC_VERSION=13.8.0.0` and `blockfrost/backend-ryo:v7.0.0@sha256:2db3d989…`; the 2026-11-23
    run used 13.8.0.0 (still the newest) and `blockfrost/backend-ryo:v7.0.1@sha256:3b236371…`. From 13.8.0.0
    db-sync reads `TraceOptions` instead of the iohk-monitoring keys, and from v7 the Blockfrost image reads no
    `BLOCKFROST_CONFIG_*` variables and has no YAML parser, so the script mounts a generated `config/default.json`.
    `BLOCKFROST_ONLY=1` reruns only Blockfrost on the database a previous run left. After the chain is indexed, the script
    checks that each test transaction is in db-sync and served by Blockfrost.

11. CSL and PyCardano (rerun 2026-11-01). Without Rust: `probe-v0.213.9 blocks <socket> > $DEVNET_DIR/blocks.txt` dumps
    every Dijkstra block through gouroboros (it stops after 3 idle seconds at the tip). For CSL,
    `npm install --ignore-scripts @emurgo/cardano-serialization-lib-nodejs@<version>` into its own directory (17.0.0,
    the newest release, 15.0.3, which Blockfrost locks, and 18.0.0-beta.1, on npm without a GitHub release), then `node csl-probe/probe.cjs <that directory> txs <
    labeled` and `... blocks < blocks.txt`. For PyCardano, create a virtual environment, `pip install pycardano==0.19.2
    "cbor2<6"` (cbor2 6.x breaks the cbor2pure PyCardano imports), and run `<venv>/bin/python -I py-probe/probe.py <
    labeled`. The labeled file adds one Dijkstra-built transaction with metadata (`cardano-cli dijkstra transaction
    build ... --metadata-json-file`), which tells the codecs that read the third array element as `is_valid` apart.

12. JVM codecs (added 2026-11-09). `jvm-probe/run.sh ccl <version> < labeled` decodes the transactions with
    cardano-client-lib (0.8.0-pre8, 0.7.3) and compares each re-encode and transaction id with the original;
    `jvm-probe/run.sh yaci <version> < blocks.txt` decodes the blocks with Yaci's BlockSerializer (0.5.0-pre17), wrapping
    each as `[era, block]`. Feed it the Conway line of `first-blocks.txt` as a positive control, and the unwrapped
    `blocks.txt`, not the HFC-wrapped file. From 0.8.0-pre8 the era-aware reader and Dijkstra models are released:
    compile `jvm-probe/ccl-e2e/BranchProbe.java` (written for the branch) against `cardano-client-lib`,
    `cardano-client-ledger-cbor` and `cardano-client-transaction-spec` 0.8.0-pre8 and run `BranchProbe decode labeled
    transaction-ids.json` and, with cardano-submit-api on port 8191, `BranchProbe build <workdir> <case>...`.
    `ccl-e2e/E2E.java` and `BranchProbe.java` read `DEVNET_DIR` (default `/tmp/dj-ccl`). Its `dereg-new` case
    deregisters the stake key that `dd` and `abi-*` pay into, so run `reg-new` again before those. Needs maven and Java 25
    for Yaci 0.5.x (`nix shell nixpkgs#jdk25 nixpkgs#maven`).

13. Forks (added 2026-11-10). `forks.sh build` builds the IntersectMBO forks of Ogmios and Kupo at pinned commits
    (Ogmios `20c383a2`, Kupo `e9ef0be3`, rerun on 2026-11-24; the 2026-11-23 run used `54bb8c1c` and `ee51691d`, which
    `OGMIOS_COMMIT` and `KUPO_COMMIT` select. Native builds come from cache.iog.io; Ogmios is fetched with its git submodules). `forks.sh relay [BLOCK]` serves an existing chain with a plain node, which
    does not extend it: cardano-testnet stops when an old chain cannot grow. With BLOCK, the chain is first truncated
    after that block. `forks.sh ogmios <transaction-ids.json>` syncs from origin through Ogmios with
    `ogmios-probe/probe.mjs` and runs the ledger queries. `forks.sh kupo [<transaction-ids.json>]` indexes from origin;
    with the ids, and once Kupo reaches the tip, it lists how many outputs Kupo indexed for each test transaction.
    `forks.sh ogmios-api` (added 2026-11-23; live chain, or under `forks.sh relay`, whose mempool still validates) builds a fresh payment and a PlutusV4 guard spend, then
    runs `ogmios-probe/api.mjs`: evaluate both, submit the payment, follow it in the mempool and submit it again.

14. Blockfrost (added 2026-11-11). On the live chain, after `advanced.sh`, `blockfrost.sh spend-sub` spends the
    sub-transaction's output in an ordinary payment. Then (live, or under `forks.sh relay`) run `service-layer.sh` with
    `DBSYNC_VERSION=13.8.0.0` and the v7.0.0 image; db-sync stops at the PlutusV4 script. `blockfrost.sh resume` adds
    `plutusV4` to the database's `scripttype` enum and restarts db-sync. That is this experiment's workaround, not a fix.
    `blockfrost.sh probe` puts Blockfrost's answers for the advanced transactions next to the node's, including the
    guard and balance-interval transactions when advanced.sh built them.
    `platform-probe/` runs blockfrost-platform's `/tx/submit` pre-check (a Conway decode, at the platform's Pallas pin) on
    labeled transactions: `CARGO_TARGET_DIR=$DEVNET_DIR/platform-build cargo build --release --manifest-path
    platform-probe/Cargo.toml`, then `platform-probe < labeled`. `handshake.py` with `10,...,16` and `10,...,23`
    reproduces the version sets of the platform's 1.0.0 release and main.

15. db-sync builds (added 2026-11-27). After step 14's `spend-sub`, `db-sync.sh run NAME BIN SCHEMA_DIR` runs any
    cardano-db-sync binary from genesis on its own Postgres 16 container (port `PGPORT_HOST`, default 5434): a release,
    or a nix build of master or a branch, such as `nix build github:IntersectMBO/cardano-db-sync/<rev>#cardano-db-sync`,
    with `schema/` from the same revision. Builds older than 13.8.0.0 need `LEGACY_LOGGING=1`. `db-sync.sh resume NAME`
    adds `plutusV4` to `scripttype` by hand and restarts it. `db-sync.sh report NAME` lists every test transaction as
    indexed or missing, and checks the sub-transaction, the direct deposit, the guard redeemers and the new parameters
    against the node. `db-sync.sh stop NAME` removes the container. Run: `content/readiness/dijkstra-runs/2026-11-27-db-sync/`.

## Retained evidence and determinism

The current run is in `content/readiness/dijkstra-runs/2026-11-23/` (node 11.2.1); the 11.2.0 runs are in
`content/readiness/dijkstra-runs/2026-11-09/` to `2026-11-11-*/` and `2026-11-01/`, and the complete previous assessments are in
`content/readiness/dijkstra-history/`. The site's `/map/dijkstra/history` compares them.
Ogmios and Kupo were also tried with the generated versioned configuration: both reject its nested genesis paths.
The remaining service checks use the flattened configuration; their successful handshake does not imply block decoding.

For fixed input bytes, tool versions and configuration, parsing, source citation checks, lexical classification,
report generation and offline fixture decoding are deterministic. Replaying a built probe against the retained
fixtures should reproduce the semantic result. GitHub observations, human source judgments, fresh dependency
resolution and live devnet runs are not deterministic. Keys, transaction hashes, slots, block counts and timing vary.
The run retains dependency locks/module lists and toolchain versions; an unconstrained fresh install is not an exact replay.

`blocks.txt.gz` contains **unwrapped** block bytes for CSL. `blocks-hfc.txt.gz` contains **HFC-wrapped** bytes for CML,
including one Conway positive control. Do not feed the unwrapped file into the CML probe: it expects `[era-tag, block]`.
`transactions-labeled.txt` has 32 encodings in the 2026-11-23 run and can be fed directly to the transaction probes. The retained checksums
cover the fixtures and logs, not private testnet keys. Stop the local testnet after collecting evidence; use
`./service-layer.sh stop` to stop its db-sync process and remove its two containers.
