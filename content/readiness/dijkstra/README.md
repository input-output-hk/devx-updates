# Dijkstra change, boundary, classification and lead registers, and the unlock report

`changes.json` lists what the Dijkstra hard fork (protocol version 12) changes,
which **surface** each change touches, when it takes effect, and the exact source
lines it rests on. It is the input for the boundary register (R2) and the
classification of catalog tools (R3) described in
[Dependency mapping and hardfork readiness](../../../docs/HARDFORK-READINESS.md).

## What it is pinned to

The current target is the official [cardano-node 11.2.0 tag](https://github.com/IntersectMBO/cardano-node/releases/tag/11.2.0),
revision `dac0d7ab2dfdee1f9eda901589e3c6ac8eaa1899`, published 2026-10-28 and marked **prerelease** by GitHub.
Versions and source revisions come from its release dependency table, retained with the run evidence.
Earlier assessments are preserved byte for byte, with SHA256 checksums: the integration-node assessment in
`content/readiness/dijkstra-history/2026-10-26-integration/` and the first tagged-node assessment (2026-11-01) in
`content/readiness/dijkstra-history/2026-11-01-node-11.2.0/`.

| Component | Version | Source commit |
| --- | --- | --- |
| cardano-ledger-dijkstra | 0.4.0.0 | `54e24ba4` |
| cardano-ledger-conway | 1.24.0.0 | `54e24ba4` |
| ouroboros-consensus | 5.2.0.0 | `952b7020` |
| ouroboros-network | 2.0.0.0 | `4646039f` |
| plutus-ledger-api | 1.71.0.0 | `261766ad` |
| cardano-api | 11.11.0.0 | `76fa5f2d` |
| cardano-cli | 11.6.0.0 | `90cc2b9a` |

The baseline is node 11.1.3 (ouroboros-consensus 4.2.1.0, `82ecba32`). Feature
scope and activation follow the Hard Fork Working Group's
[Dijkstra scope](https://github.com/IntersectMBO/cardano-node/issues/6634), retrieved 2026-10-19.

## Changes by surface

| Surface | Changes | Typical tools exposed |
| --- | --- | --- |
| node-to-client-protocol | `n2c-only-v23` | Local chain-sync/query/submit clients and libraries |
| era-identity | `era-dijkstra` | Anything with a closed era list |
| block-encoding | `block-body-non-segregated`, `header-version-info`, `leios-peras-consensus` | Chain followers, indexers, explorers |
| transaction-encoding | `mempool-tx-is-valid`, `nested-transactions`, `guards`, `account-enhancements`, `removed-encodings`, `mempool-cross-era` | Serialization libraries, transaction builders, wallets |
| transaction-rules | `nested-transactions`, `account-enhancements`, `plutus-legacy-mode`, `withdrawal-drep-requirement` | Builders, wallets, dApps |
| plutus-language / plutus-script-context | `plutus-v4`, `guards` | Script languages, evaluators, cost-model handling |
| protocol-parameters | `protocol-parameters`, `plutus-v4` | Query clients, fee calculators, governance tools |
| stake-pool-registration | `pool-bls-key` | Pool explorers/registries, SPO tooling |
| cardano-cli / cardano-api-haskell | `cli-dijkstra` | Operator scripts, Haskell consumers |
| consensus-participation | `leios-peras-consensus` | Block producers |
| node-configuration | `dijkstra-genesis-config` | Configuration and genesis generators, devnet tools, SPO tooling |

`query-pparams-encoding` also touches protocol-parameters and node-to-client:
local-state-query answers for current and future protocol parameters grow from
Conway's 31 positional fields to 54.

## Findings that need attention first

1. **Node-to-client V23 only (`n2c-only-v23`).** 11.2's consensus drops V16–V22.
   Clients that cannot negotiate V23 disconnect as soon as a node upgrades,
   *before* the fork activates. This is the earliest break in the timeline.
2. **Every block decoder breaks at the fork.** The block body is no longer
   segregated and `invalid_transactions` is gone. The target CDDL also replaces
   the header's `protocol_version`, but the node at the tagged revision
   still emits the ten-field Praos header (devnet check `block-shape`), so a
   decoder that follows the CDDL header breaks too.
3. **Conway-built transactions can fail after the fork.** Consensus re-decodes
   older-era transactions as Dijkstra (`mempool-cross-era`), and Dijkstra drops
   certificate types 0/1 and array-encoded redeemers (`removed-encodings`). At
   the pinned commit, `cardano-cli latest` still builds Conway transactions.
   On the devnet, Conway-built payments, deposit registrations, required
   signers and metadata are accepted; a deposit-less registration is rejected
   as an era mismatch (`cross-era-submission`).
4. **Closed enums.** New native-script type 6, redeemer tag 6, script/language
   tag for PlutusV4, body keys 23–27, witness key 8, parameter keys 34–56.

## Checked and unchanged

`unchanged` in `changes.json` cites areas read at the target and found unchanged:

- **Node-to-node versions** (`node-to-node-versions`): node 11.2 offers V14–V16
  with V15 as latest released, exactly like node 11.1. Peras diffusion is behind
  consensus feature flags and the node starts with none, so relays and
  alternative node implementations see no node-to-node change at the upgrade.
- **Local-state-query set** (`query-set`): only Shelley query version 15 inside
  V23, as before. Answers change shape with the era instead
  (`query-pparams-encoding`).

## Devnet setup (R4)

`dijkstra-genesis-config` is what a Dijkstra devnet needs: the node reads
`DijkstraGenesisFile` and `TestDijkstraHardForkAtEpoch` only with
`ExperimentalHardForksEnabled: true`, which also makes it forge protocol
version 12. cardano-testnet's default configuration leaves that flag off since
PR 6541, so a `--dijkstra-era` testnet must set it explicitly. The genesis file
holds the 24 upgrade parameters, including the PlutusV4 cost model as an array.

## Devnet run (`devnet.json`, R4)

Node 11.2.0 runs a one-pool devnet that enters Dijkstra at epoch 2. Two governance hard forks raise the protocol version
from 10 to 12 before the transaction matrix. The 2026-11-09 run uses CLI 11.6.0.0 and re-tests the newest release of
each critical-path component it can run. Full logs, 25 transaction encodings (including a direct deposit, a
sub-transaction and a PlutusV4 reference script), 247 Dijkstra blocks, a Conway positive control and resolved build
inputs are retained under `content/readiness/dijkstra-runs/2026-11-09/`; the recipe is in `scripts/readiness/devnet/`.
Only what ran that day is recorded; the 2026-11-01 results, including the historical patched controls, stay in the
archived assessment and on `/map/dijkstra/history`.

| Check | Result |
| --- | --- |
| `fork-to-pv12` | Dijkstra PV12; 54 protocol parameters. |
| `n2c-handshake` | Only V23 accepted; gouroboros v0.218.2, Ogmios v7.0.0, Kupo v2.12 and db-sync 13.8.0.0 connect. |
| `cross-era-submission` | Unchanged: Conway payment, deposit registration, key-hash signer and metadata accepted; deposit-less registration rejected. Dijkstra payment, deposit registration and metadata accepted. |
| `advanced-transactions` | New: a direct deposit, a sub-transaction and a PlutusV4 reference script are accepted. |
| `block-shape` | Ten-field header and non-segregated body; gouroboros v0.218.2 decodes all 205 Dijkstra blocks. |
| `service-decoding` | Ogmios 7.0.0 and Kupo 2.12 still exit on the first Dijkstra block. |
| `tx-era-detection` | gouroboros v0.218.2 reports ordinary Dijkstra transactions as Conway and returns block transactions in the Conway shape. |
| `tool-upgrades` | txtop v0.17.0 connects, as released and with gouroboros v0.218.2; its transaction list was not observed. |
| `pallas-chain-sync` | v1.5.0-rc.1 and main 3da6ff9f decode Conway, but no Dijkstra block. |
| `pallas-transactions` | Both decode all 12 Dijkstra encodings with an explicit era and unstable; era detection still fails. |
| `cml-decoding` | CML 6.2.0 decodes the Conway control; no Dijkstra block or three-element transaction. |
| `js-sdk-transactions` | @cardano-sdk/core 0.47.1 round-trips all 25 encodings and reads the new fields; guards and balance intervals not covered. |
| `db-sync-and-blockfrost` | db-sync 13.8.0.0 indexes Dijkstra blocks, then exits on the first PlutusV4 script; Blockfrost RYO v7.0.0 serves the indexed data, but /network/eras throws. |
| `csl-decoding` | CSL 17.0.0 and 15.0.3 decode no Dijkstra block or new body; re-encoding adds the legacy fourth element. |
| `pycardano-transactions` | PyCardano 0.19.2 fails on Dijkstra metadata and on all three new bodies. |
| `jvm-codecs` | New: cardano-client-lib 0.8.0-pre7 drops direct deposits and sub-transactions (wrong transaction id); Yaci 0.5.0-pre15 decodes no Dijkstra block. |
| `fork-chain-sync` | 2026-11-10, same chain: the IntersectMBO Ogmios fork (2f9b5d14) syncs all 2356 Dijkstra blocks; the Kupo fork (bdb44975) indexes everything up to block 186, including the direct deposit, then stops at the first sub-transaction. |
| `fork-ogmios-api` | 2026-11-10: the Ogmios fork returns Dijkstra transactions as an id only, has no Dijkstra protocol-parameters query, and drops mempool clients; submitting a Dijkstra payment works. |

The two fork checks ran on 2026-11-10 against the same chain, served by a node that does not produce blocks; their
evidence is in `content/readiness/dijkstra-runs/2026-11-10-forks/`. Neither fork is merged upstream or released.

Not run: Koios, guards and balance intervals (the 11.2.0 CLI has no options for them), and executing a PlutusV4 script.
Ogmios and Kupo, releases and forks alike, still reject the versioned configuration. db-sync stops before the direct deposit and the sub-transaction.
Source progress remains separate from runtime results: a newly published release is not an end-to-end devnet pass.

## Not yet covered

- JSON representations in cardano-api/cli beyond the era commands.

## Boundary register (`boundary.json`)

`boundary.json` records 61 components, re-observed at their default-branch heads, releases and cited trackers
on 2026-11-01; the components re-tested on the devnet were re-observed on 2026-11-09. Earlier pinned evidence is retained where the behavior is unchanged. It gives
a status for each surface group: `gap` (cited code cannot work against the
target), `no-evidence` (nothing found; never a pass), `tracked`, `in-progress`,
`released` and `verified` (R4). `in-progress` needs visible work toward the
target definitions (a branch, an open pull request or unreleased code); a
release built only against superseded Dijkstra definitions, with no such work,
is a `gap`. A component counts as its worst status. Source
evidence is pinned like the change register; issue and pull-request evidence
records URL, state and date.

| Worst status | Components |
| --- | --- |
| gap | 47: cardano-serialization-lib-csl, cardano-multiplatform-lib-cml, pallas, gouroboros, cardano-js-sdk, bloxbean-cardano-client-library, yaci, pycardano, cometa-js, buildooor, ouroboros-miniprotocols-ts, plu-ts, cardano-data-lite, evolution-sdk, cardanosharp, typhonjs, whisky, elm-cardano, cquisitor-lib, ledgerjs-hw-app-cardano, cardano-hw-interop-lib, ogmios, kupo, cardano-db-sync, cardano-wallet, oura, dolos, carp, scrolls, cf-ledger-sync, cardano-graphql, koios, blockfrost, cardano-rosetta-java, mithril, hydra, aiken, opshin, helios, scalus, uplc-turbo, julc, meshjs-mesh-sdk, lucid-evolution, atlas, cardano-transaction-lib-ctl, kuber |
| no-evidence | 2: ouroboros-network-js, cncli |
| in-progress | 8: apollo, amaru, dingo, yaci-store, adder, utxorpc, blaze, yaci-devkit |
| released | 4: cardano-c, plutus-plutus-core, plutarch, plutigo |


Blockfrost is the catalog's single Blockfrost entry; its source is the
run-your-own backend, which the hosted API runs, so hosted consumers inherit
its verdict. Maestro is deprecated and is not a boundary component: the
classification treats any shipped call to it as a gap (see below).

The 35 components that had no evidence were re-observed at their heads on
2026-10-20 and judged by what their code enumerates: transaction-body keys
ending at 22 (Dijkstra adds 23–27 and redefines 14), parameter-update keys
ending at 33 (Dijkstra adds 34–56), Plutus languages ending at V3, pool
parameters without the BLS key, era tables ending at Conway, script contexts
without V4's fields, and Pallas or Yaci versions that cannot decode Dijkstra
blocks. Transaction rules stay `no-evidence` unless code specific to a rule
change was found.

What changed on 2026-11-10:

- Ogmios and Kupo: the node team is porting both to the node 11.2 libraries in its own forks (IntersectMBO/ogmios,
  IntersectMBO/kupo). Block decoding moves to in progress on the strength of the forks' devnet runs. Both stay gaps:
  the Ogmios fork stubs Dijkstra transaction contents, protocol parameters and mempool monitoring, the Kupo fork stops
  at sub-transactions, and nothing is merged upstream or released. Neither is marked done until the work is merged into
  CardanoSolutions/ogmios and CardanoSolutions/kupo.

What changed on 2026-11-09:

- gouroboros: block decoding is verified from v0.217.0 (the ten-field header is accepted). Era detection still reports
  ordinary Dijkstra transactions as Conway, and block transactions come back in the Conway shape; it stays a gap.
- cardano-db-sync 13.8.0.0 is released on node 11.2.0 and decodes Dijkstra blocks, but exits on the first PlutusV4
  script (`scripttype` has no `plutusV4`). It stays the first fix in the order.
- Blockfrost RYO v7.0.0 (prerelease) serves Dijkstra data from that db-sync; its `/network/eras` gap is reproduced.
- Pallas v1.5.0-rc.1 carries the Dijkstra era behind `unstable` but still decodes no block from the node.
- Yaci becomes a gap: its newest release decodes no Dijkstra block, and the parsing work sits on a feature branch.
- cardano-client-lib 0.8.0-pre7 drops direct deposits and sub-transactions when decoding, so it computes the wrong id.

What changed on 2026-11-01:

- cardano-c 2.0.0-rc.6 contains the new parameter, witness and nested-transaction structures; it is a prerelease, not a runtime verification.
- Plutarch 1.15.0 contains the V4 module and target Plutus API. Cometa 2.0.0-rc.4 has partial coverage; pool BLS handling still has a gap.
- Apollo and Adder show implementation progress; their unsupported paths remain explicit.
- db-sync master now pins node 11.2.0. Its current release still fails at the first Dijkstra block and remains an upstream blocker.

## Classification of all catalog tools (`classification.json`)

`classification.json` records, for every one of the 268 catalog tools, which
changed surfaces it touches, through which channel, and the readiness it
inherits. Each tool's repository was scanned at its default-branch head:

- **implements**: the tool is a boundary component (R2) or the 11.2 component
  set itself (cardano-node, cardano-cli, cardano-submit-api, cardano-testnet).
- **dependency**: a manifest depends on a boundary component or on the Haskell
  ledger/consensus/API packages. When R2 names the release that added a
  surface's support, a version constraint that cannot reach that release is a
  `gap` (Go pins exactly, Cargo and Poetry default to caret, Cabal `^>=` is a
  PVP major, lower bounds never count). Haskell pins of cardano-api,
  cardano-ledger, ouroboros-consensus/-network and plutus-ledger-api are
  compared the same way with the 11.2 component-set versions above.
- **service**: code calls Blockfrost, Koios, Maestro, Ogmios, Kupo, db-sync,
  UTxO RPC/Dolos, the cardano-wallet API, a node socket, cardano-cli commands
  or the submit API. Maestro is deprecated (2026-10-22), so a shipped call to
  it is a `gap` on era identity, transactions and protocol parameters until the
  tool changes provider.
- **marker**: closed era lists, PlutusV3 enums, cost models, raw CBOR codecs,
  segregated block-body fields, legacy stake certificates, script context,
  pool registration, node-to-client code or node configuration and genesis
  files (35 tools, among them Guild Operators, Yaci DevKit, Hydra, Mithril,
  Dandelion and Plutip). Markers show a surface is touched
  but never set readiness.

Prose (docs, READMEs, changelogs) and comments in manifests never establish
exposure. Tests, examples, benchmarks, demos, playgrounds and workshops are
**auxiliary**: their hits are kept with `scope: "auxiliary"` but never set
readiness, and a tool coupled only there has exposure `auxiliary`. So are
development-only manifest declarations: a published npm library's
`devDependencies` (applications bundle theirs and keep them shipped), Cargo
`dev-dependencies`, Cabal `test-suite`/`benchmark` stanzas, Gradle test
configurations and Maven test scope. Every hit
records path, line and a quote at the scanned revision; dependency hits also
keep up to twelve versioned manifest lines (`pins`) for the constraint checks.
Each scanned tool records whether its repository is archived and when it was
last pushed.

| Exposure | Tools |
| --- | --- |
| implements | 65 |
| dependency | 86 |
| service | 45 |
| auxiliary only | 4 |
| marker only | 9 |
| none found | 18 |
| no public source | 41 |

Changed surfaces touched through shipped coupling (implements, dependency or
service): transaction encoding 176, era identity 173, protocol parameters 173,
PlutusV4/language 159, block encoding 138, node-to-client 131, transaction
rules 128, stake-pool registration 117, script context 68, cardano-cli 43,
consensus participation 28, cardano-api 26, node configuration 4. The most
used services in shipped code are Blockfrost (63), Ogmios (59), node sockets
(57), cardano-cli (39), Koios (37), db-sync (31), Kupo (31), UTxO RPC (24),
the submit API (21) and Maestro (12).

Readiness of the 207 tools outside the boundary: 116 gap, 2 in-progress,
15 upstream, 2 released, 72 unassessed. Nine catalog repositories are
archived, among them cardano-node-api, cardano-rosetta-legacy and Nami.

The scan is lexical: a dependency proves coupling to a component, not use of a
changed feature. Every inherited gap is therefore read in shipped code and
decided in `leads.json`.

## Lead confirmation (`leads.json`)

`leads.json` decides, for every tool that inherits a gap, whether shipped code
actually reaches it, per tool, dependency and surface, each decision quoting
the lines it rests on:

- `confirmed`: a shipped path reaches the assessed gap.
- `not-reached`: shipped code uses that dependency outside the gap.
- `undetermined`: source reading cannot decide; execution or additional evidence is needed.

643 entries, 1,538 surface decisions (526 confirmed, 969 not reached, 43 undetermined); all covered decisions are at current classified revisions.

On 2026-11-09, 180 leads whose quoted lines were unchanged at the newly classified revision moved to it; 7 were re-read by hand (Dolos and Oura now pin Pallas 1.4, still confirmed; Gerolamo now evaluates Plutus through buildooor, now confirmed). 81 decisions on gaps that closed (gouroboros block decoding, db-sync block and era handling, Sorbet's removed CML) were removed, and 10 new ones decided: Yaci Store, Yaci DevKit, Yano, Yaci Bridge, Ledger Sync and Rosetta Java confirmed through Yaci's block decoding; cardano-client-lib (Yaci only in an unbuilt tool), Scalus and Mesh (Kupo only in comments) and Pebble's own V4 marker not reached.

Changed source citations were re-read and moved to the new revision only when the evidence still supported the decision.
Ambiguous or missing paths remain undetermined. The sections below describe historical reading passes; their counts are as of that pass.

Two kinds of decision were added on 2026-10-26:

- **Own code** (`via: "own"`, 130 decisions on 48 tools): the shipped marker
  lines of tools that are not boundary components. Confirmed for AdaLite,
  libcardano and cardano-wallet-sdk-dart (deposit-less stake certificates),
  stakepool-operator-scripts (era names in the min-UTxO calculation, unknown
  parameters in vote tallies), gastronomy (Conway `MintedTx` on chain
  transactions) and catalyst-voices (blocks through Pallas, PlutusV4
  reference scripts).
- **Open surfaces:** a component's `no-evidence`, `tracked` or `in-progress`
  surfaces may be decided. `not-reached` reads were extended to those
  surfaces where the same reading covers them, which cleared most "waits on a
  verdict" states.

Most of the other new decisions come from the lockfile links in
`transitive.json` (30 links, 29 tools) and from CSL's new cited gaps (108
consumer surfaces).

### Libraries and node-to-client (2026-10-20)

The first pass (170 decisions) confirmed **21 tools outside the boundary**:

| Through | Tools | What breaks |
| --- | --- | --- |
| gouroboros below v0.213.0 | txtop, cardano-node-api (archived), Bursa, IBC incubator | txtop and cardano-node-api open node-to-client connections without V23; all four decode transactions or blocks with pre-target ledger types |
| ouroboros-miniprotocols-ts | Gerolamo | its own node-to-client responder offers only V16–V19, so 11.2 clients cannot connect |
| cardano-wallet | Daedalus, cardano-wallet-js | both run on the wallet's REST API, whose backend cannot connect to 11.2 |
| CSL (no PlutusV4) | Yoroi, cardano-dev-wallet, cardano-hw-cli, Hydra SDK, Masumi, cardano-rosetta-legacy (archived), csl-mobile-bridge | decode transactions or witnesses they did not build; csl-mobile-bridge re-exports the API |
| cardano-js-sdk (parameter keys stop at 37) | Lace, Nami (archived) | decode transactions with parameter updates for keys 38–56 |
| Scalus (no V4 evaluation) | Yano | evaluates scripts through Scalus |
| cardano-api below 11.8 | Marlowe, Marconi, sc-tools, Midgard | follow the node or build and submit transactions fixed to the Conway era |

What reading changed:

1. **Most CSL coupling is not reached.** Blockfrost-js, GovTool,
   cardano-signer, catalyst-core, cardano-mcp, cardano-wallet-js and the halo2
   submitter use CSL for addresses, keys, metadata or their own PlutusV3
   transactions. PlutusV4 is additive, so only tools that decode foreign
   transactions break.
2. **Pallas and plutigo pins rarely matter.** Gastronomy and Mumak never use
   `pallas::network`; plutigo below v0.8.0 appears only as an indirect Go
   requirement (txtop, the IBC incubator). cardano-up uses gouroboros only for
   network names.
3. **Haskell pins split in two.** Pins below the target cardano-api break
   tools that follow the node or submit transactions (Marlowe, Marconi,
   sc-tools, Midgard). Plutus pins below 1.71 do not break existing scripts,
   and offline emulators and local clusters (CLB, Plutip) keep running but
   cannot exercise Dijkstra.

Scanner corrections from this pass: auxiliary scope (Chrysalis's gouroboros
benchmark, Catalyst Voices's wallet tester and Hyperledger Identus's workshops
no longer count as shipped), the plutus-ledger-api rule is limited to Haskell
manifests (Plutip's Rust crate of the same name was misattributed), and
upstream Haskell pins are compared with the component set.

**16 boundary components have a confirmed gap through another component:**
Evolution SDK, Lucid Evolution, Mesh and yaci-store through Scalus
evaluation; Blaze (re-exports the serialization) and Mesh (governance
proposals) through cardano-js-sdk; Whisky and Cquisitor through CSL
transaction decoding; Adder and Scrolls through node-to-client libraries
without V23 (gouroboros v0.209.0, Pallas 0.30.1); cf-ledger-sync through
yaci 0.3.4.1 on its optional node-socket path; and Ogmios, Kupo, Kuber, Atlas,
Hydra and cardano-wallet through Haskell pins below the 11.2 component set.
Amaru's Pallas pin is not reached (node-to-node only), and consensus 3.0.1 and
4.2.1.0 already offer node-to-client V23.

Version gaps are judged against `firstReleases` in `boundary.json`: the earliest
tag on each release line whose source contains every cited quote (yaci has V23
from v0.3.10 and v0.4.2, Pallas from v0.35.1 and v1.0.0, gouroboros's
target-identical CDDL from v0.213.0, plutigo's V4 context from v0.8.0). Judging
pins against the release R2 happened to observe flagged Dingo, yaci-devkit,
Apollo and several plutigo pins that already had the support, and produced a
wrong cardano-node-api lead (it evaluates PlutusV4 at line 1233 of
`internal/utxorpc/submit.go`). After a boundary edit, `classify-surfaces
--reclassify` recomputes at the recorded revisions, reusing cached scans and
rescanning at the same revision when the rules changed.

### Service-layer reading (2026-10-20, Maestro 2026-10-22)

Moving Ogmios, Kupo, db-sync, Koios and Blockfrost to `gap` added 221
inherited links across 117 tools; every one is now decided (`leads.json` has
393 entries, 913 tool/dependency/surface decisions, all quotes re-read with
`--verify-sources`). Service links are decided per capability the tool uses:

| Service | Reached when shipped code… | Tools confirmed |
| --- | --- | --- |
| Ogmios | follows the chain (block, transaction, era), submits (transaction, era), evaluates (Plutus, transaction) or reads parameters | 37 |
| Kupo | reads any indexed data; Kupo cannot index Dijkstra blocks, so matches stop at the fork | 21 |
| db-sync | reads chain tables (block, transaction, era); parameters and pools only through `epoch_param` and pool tables | 13 |
| Koios | reads era fields (`/tip`, block and epoch info) or `/epoch_params` / `/cli_protocol_params` | 22 |
| Blockfrost | calls `/network/eras` (throws on protocol 12) or the epoch parameter endpoints; hosted and self-hosted alike | 41 |
| Maestro (deprecated) | calls Maestro at all: it will not gain Dijkstra support, so every provider surface is reached | 10 |

After this pass 97 tools had a confirmed gap. Maestro was added on
2026-10-22: ten tools ship a Maestro provider or client call (Evolution SDK,
Whisky, Blaze, Lucid, NMKR Studio, Sutra, Minswap SDK, rum, cardano-cli-guru,
CardanoKit); GovTool names it only in published proposal text and Cardano MCP
defines a client nothing imports. Typical not-reached cases: tools that implement these APIs
themselves (Dingo, Dolos, Yaci Store, Yano, Gerolamo), providers used only for
UTxOs and submission, and services named only in comments, fixtures or
deployment examples. Undetermined: CAB and CTL relay through code outside the
repository, and koios-python exposes a generic Ogmios passthrough. Atlas also
parses provider era histories as exactly seven eras, so its Ogmios and
Blockfrost providers fail once the history includes Dijkstra.

### Library and compiler reading (2026-10-20)

Assessing the 35 components that had no evidence added 85 inherited links
across 62 tools, all decided with the same precedent as CSL and Plutarch:
compiling one's own V1–V3 validators or building one's own Conway-shaped
transactions is not reached (existing Plutus versions stay valid; removed
encodings are for R4 to test), while decoding transactions, blocks or scripts
one did not build, and reading era data, is confirmed. Hardware-wallet
libraries are reached by tools that sign transactions built elsewhere
(cardano-hw-cli, Lace, Yoroi, Nami, Bursa, cardano-js-sdk's Ledger agent);
Mithril only by tools that use its chain reader, not snapshot download.
After this pass 101 tools had a confirmed gap.

### Pallas reading (2026-10-22)

The devnet made Pallas a gap on era identity and block encoding. Its 22 new
links were read: 9 confirmed (Mithril, cncli, Dolos, Oura, Scrolls, Boros,
Cardaminal, lace-anatomy, Mumak decode blocks or headers from a chain, or
foreign transaction bytes through `MultiEraTx::decode`) and 13 not reached
(tools that name the era themselves or use Pallas for primitives, addresses
and hashing).

## Unlock report (`unlocks.json`)

`unlocks` turns the three registers into the dependency view: what a fix in
one component unlocks. Each confirmed gap is one of three blockers:
`upstream-fix` (the component behind it has no release with the support),
`own-bump` (a release exists; the tool only raises its pin) or `own-gap` (a
boundary component's own R2 gap, or a confirmed own-code decision). A tool is unlocked when all its upstream
blockers come through fixed components and it has no gap of its own; an
unlocked boundary component then counts as fixed for its own consumers, so
chains such as Scalus → Mesh → dApps are followed. `downstream` lists tools
with an unconfirmed shipped link to anything unlocked.

Most SDKs wait on several services or libraries at once, so single fixes
understate the effect. A fixed component that itself waits on another one
(Blockfrost and Koios read db-sync; Kupo can follow the chain through Ogmios)
only becomes usable once that one is fixed too. `fixOrder` adds, at each step,
the fix that unlocks the most tools on top of the earlier steps. A fix that
cannot take effect yet is scored with the fixes it waits on, per component,
and listed after them. Maestro's step is a migration, not a fix: its consumers
move to another provider. Until 2026-10-26 the order treated a fix as usable
on its own and put Blockfrost first, which it cannot be without db-sync.

| Step | Fix | Tools unlocked (running total) |
| --- | --- | --- |
| 1 | cardano-db-sync | 3 |
| 2 | blockfrost | 16 |
| 3 | ogmios | 26 |
| 4 | koios | 36 |
| 5 | kupo | 43 |
| 6 | Move off Maestro | 49 |
| 7 | pallas | 54 |
| 8 | cardano-serialization-lib-csl | 58 |
| 9 | gouroboros | 62 |
| 10 | aiken | 65 |
| 11 | ledgerjs-hw-app-cardano | 67 |
| 12 | cardano-js-sdk | 69 |
| 13 | cardano-wallet | 71 |
| 14 | bloxbean-cardano-client-library | 72 |
| 15 | yaci | 74 |
| 16 | scalus | 76 |
| 17 | cquisitor-lib | 77 |
| 18 | whisky | 78 |
| 19 | buildooor | 79 |
| 20 | cardano-hw-interop-lib | 80 |
| 21 | cardano-multiplatform-lib-cml | 82 |

Tools that are boundary components with a gap of their own (Mesh, Lucid
Evolution, Evolution SDK, yaci-store, Adder, Hydra and others) are never
unlocked by upstream fixes alone.

**2 tools have a released upstream fix**, so the next move is theirs: Marlowe
and Marconi (the tagged target contains cardano-api 11.11.0.0; the first-support comparison is not a new dependency solve). txtop and cardano-node-api were bump-ready
until the devnet showed gouroboros v0.213.x cannot decode the node's Dijkstra
blocks or place ordinary Dijkstra transactions. From v0.217.0 gouroboros decodes
the blocks, but v0.218.2 still reports ordinary Dijkstra transactions as Conway,
so they keep waiting on it.
Bursa now also waits on ledgerjs-hw-app-cardano, and cf-ledger-sync has its own
gap.

Raising the pin is only the minimum. The unlock report derives each step's
distance (`steps`): ten of the eleven cross a breaking release (a 0.x minor
under semver, A.B under the Haskell PVP); only cf-ledger-sync stays on its
yaci line. `upgrades.json` records, with quoted lines at the classified
revision, whether the tool's own code handles the new era:

| Own era handling | Tools |
| --- | --- |
| own-work (names eras and stops before Dijkstra) | Atlas, Marconi, Marlowe, sc-tools, Midgard (Conway-typed builders and queries), cf-ledger-sync (era enum and genesis transitions end at Conway), IBC incubator (no Dijkstra block case), cardano-node-api (PlutusV4 gets the V3 context; adder and its own calls break on v0.213.x) |
| prepared (already has Dijkstra cases) | Bursa |
| generic (only era-generic library entry points) | txtop, Scrolls |


```sh
node --import tsx scripts/readiness/cli.ts check-upgrades [--verify-sources]  # every bump-ready tool read, none stale
```

## Dismissals and issue/PR links (`tracking.yaml`, `tracking-state.json`)

`tracking.yaml` is edited by hand. Keyed by tool id, an entry can dismiss the
tool (`dismissed: { reason, date }`) and list issues, PRs or any other https
links (`links: [{ url, note }]`); the file's header has the exact format. A
dismissed tool shows as *Dismissed* with its reason in place of its computed
state, which stays visible as "Otherwise: …". Dismissing changes only how the
tool is shown, not the unlock report or any other register. An unknown tool id
or field fails the build.

`tracking-state.json` is generated: `sync-tracking` reads the title and
open/merged/closed state of every GitHub issue/PR link through `gh api`
(read-only) and writes them there, so the YAML and its comments are never
rewritten. Work in a fork is tracked against upstream. An issue or PR in a fork
records the repository it was forked from (`forkOf`), and the site shows a
merged one as "merged in fork, not upstream", not as merged. A GitHub compare
link (`https://github.com/<upstream>/compare/<branch>...<owner>:<repo>:<branch>`)
records how many fork commits are not upstream yet and the fork's latest commit.
It reads as merged only once none are left. A link that has not been synced yet shows without a state. A failed
lookup keeps the previous entry and exits non-zero.

## On the site

`/map/dijkstra` opens with the state of every tool touching a changed surface
(Breaks after HF, In progress, Ready for HF, Target component, Not verified, Dismissed), then the
critical path (`lib/readiness/fix-graph.ts`: each blocking component placed one
column right of the furthest component it waits on, implied links dropped, then a
last column of the tools DApps build on (survey usage above 10% and a confirmed
gap, not dismissed), with the longest chains to them marked; selecting a fix
shows the tools it adds, and the fix order is a list toggle) with the tools
unlocked after each fix, then all tools ranked by how many catalog tools reach
them. The history page `/map/dijkstra/history` compares preserved assessments, surface statuses and runtime results matched by tested version. The other sub-pages hold the details: `/map/dijkstra/devnet` (the devnet checks),
`/map/dijkstra/changes` (the cited changes with their devnet outcome, and what was
checked unchanged) and `/map/dijkstra/evidence` (tools whose upstream fix is
released, with upgrade distance and own era handling; inherited gaps not read
yet and links waiting on a component verdict, grouped by component; every lead
decision with its quoted lines, collapsed per tool). Each tool page under `/map/readiness/<id>` has a Dijkstra section with
its state, issue/PR links, exposure, devnet results, blockers, upgrade, what it waits on, what fixing it unlocks (its fix-order step and on its own) and lead decisions. A malformed register fails the build.

The four components of the tagged reference node release (cardano-node,
cardano-cli, cardano-submit-api and cardano-testnet) show **Target component ·
11.2.0**, with a prerelease badge taken from the release metadata. This denotes
membership in the reference release, independently of capability test outcomes
and production hardfork readiness. The version is the node release, not the
individual executable version. Tool pages retain recorded devnet results and
explicitly identify missing component-specific results, linking to the target
checks. Archived untagged assessments retain **In progress**.

## Checking it

```sh
node --import tsx scripts/readiness/cli.ts check-changes                   # structure and vocabulary
node --import tsx scripts/readiness/cli.ts check-changes --verify-sources  # re-read every quote via gh
node --import tsx scripts/readiness/cli.ts check-boundary [--verify-sources] # boundary register, worst status per component
node --import tsx scripts/readiness/cli.ts classify-surfaces                  # rescan every catalog tool (resumable)
node --import tsx scripts/readiness/cli.ts classify-surfaces --reclassify     # recompute after a register edit, no fetching
node --import tsx scripts/readiness/cli.ts check-leads [--verify-sources]     # every shipped gap decided, none stale
node --import tsx scripts/readiness/cli.ts sync-tracking                      # issue/PR titles and states into tracking-state.json
```

Every citation records repository, 40-character revision, path, line and an
exact single-line quote. `--verify-sources` fails if any quote is no longer on
its recorded line.
