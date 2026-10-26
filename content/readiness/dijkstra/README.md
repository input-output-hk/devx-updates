# Dijkstra change, boundary, classification and lead registers, and the unlock report

`changes.json` lists what the Dijkstra hard fork (protocol version 12) changes,
which **surface** each change touches, when it takes effect, and the exact source
lines it rests on. It is the input for the boundary register (R2) and the
classification of catalog tools (R3) described in
[Dependency mapping and hardfork readiness](../../../docs/HARDFORK-READINESS.md).

## What it is pinned to

cardano-node 11.2 has no tag yet. Components are taken from the open integration
branch ([#6677](https://github.com/IntersectMBO/cardano-node/pull/6677),
`34ae34db`; [#6736](https://github.com/IntersectMBO/cardano-node/pull/6736)
stacks on it with identical pins). For each package the register records the
newest CHaP version available at the branch's index-state
(`cardano-haskell-packages 2026-10-09T14:30:01Z`) and the upstream commit CHaP
built it from. These versions satisfy the branch's bounds, but no build plan was
solved; re-check them when 11.2 is tagged.

| Component | Version | Source commit |
| --- | --- | --- |
| cardano-ledger-dijkstra / -conway | 0.4.0.0 / 1.24.0.0 | `54e24ba4` |
| ouroboros-consensus | 5.1.0.1 | `4ab9e250` |
| ouroboros-network | 1.3.0.0 | `2fb69829` |
| plutus-ledger-api | 1.71.0.0 | `261766ad` |
| cardano-api | 11.8.0.0 | `b0afab8b` |
| cardano-cli | 11.3.0.0 | `b8bbda76` |

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
   the header's `protocol_version`, but the node at the integration revision
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

The integration node (`34ae34db`, IOG's static Hydra build) runs a one-pool
devnet that forks to Dijkstra at epoch 2. The test trigger leaves the protocol
version at 10, so two governance hard forks raise it to 12 before the checks.
The recipe and probes are in `scripts/readiness/devnet` (see its README); it
was first run on 2026-10-20 and reproduced on another machine on 2026-10-22
with identical errors and decoder offsets. Each check records a pass or fail
per change, component or tool version, with the output it rests on:

| Check | Result |
| --- | --- |
| `fork-to-pv12` | Dijkstra at protocol version 12; 54 protocol parameters |
| `n2c-handshake` | Only V23 is accepted; gouroboros 0.208.5 is refused; v0.213.x, Ogmios v7.0.0, Kupo v2.12 and cardano-db-sync 13.7.2.1 connect |
| `cross-era-submission` | Conway payments, deposit registrations, required signers and metadata accepted; deposit-less registration rejected; the mempool returns every transaction in the three-element Dijkstra form |
| `block-shape` | Non-segregated body confirmed; the header is still the ten-field Praos header with `[12, 0]`, contradicting `header-version-info`; gouroboros v0.213.0–v0.213.9 stop at the first Dijkstra block |
| `service-decoding` | Ogmios v7.0.0 and Kupo v2.12 exit at the first Dijkstra block |
| `tx-era-detection` | gouroboros's `DetermineTransactionType` cannot place ordinary Dijkstra transactions, and `NextTx` drops the era id; txtop's mempool view and cardano-node-api's submission and mempool listing fail |
| `tool-upgrades` | txtop builds unchanged on v0.213.0 and connects; cardano-node-api builds on no v0.213.x without patching adder and its own code, and then reads Dijkstra UTxOs |
| `pallas-chain-sync` | No Pallas revision decodes a Dijkstra block: v1.4.0 and main have no Dijkstra era in traversal, and the `dijkstra` branch requires the CDDL's twelve-field header |
| `pallas-transactions` | `MultiEraTx::decode` does not detect the three-element form in any revision; `decode_for_era(Dijkstra)` on the `dijkstra` branch reads all captured transactions |
| `cml-decoding` | CML 6.2.0 decodes none of 1017 Dijkstra blocks and no three-element transaction |
| `js-sdk-transactions` | `@cardano-sdk/core` 0.47.1 decodes all fifteen transactions, re-encodes them byte for byte and reproduces their ids (plain payments, a deposit registration, a required signer and metadata) |
| `db-sync-and-blockfrost` | db-sync indexes every Conway block, then fails on the first Dijkstra block with `DeserialiseFailure 863` and keeps reconnecting; Blockfrost serves that frozen database as current (last Conway block, protocol version 10, no Dijkstra era) |
| `csl-decoding` | CSL 17.0.0 and 15.0.3 decode none of 119 Dijkstra blocks; plain three-element transactions decode with the node's ids, but `Transaction` re-encodes them as four-element arrays (2026-10-26) |
| `pycardano-transactions` | PyCardano 0.19.2 reads the third element as `is_valid`, so a Dijkstra transaction carrying metadata does not decode; the others round-trip exactly (2026-10-26) |

Consequences in the registers: gouroboros and Pallas are gaps on era identity
and block encoding. Node-to-client V23 support is `verified` for gouroboros,
Ogmios, Kupo and db-sync. Boundary evidence of kind `devnet` cites a check and
version: `verified` needs a pass, and a failing result cannot back `released`.
txtop and cardano-node-api are not bump-ready. Blockfrost's own Dijkstra gaps
(a protocol table ending at 11, Conway parameter columns) are not reached on
the devnet, because db-sync never records a Dijkstra epoch; its result is
recorded as inherited. Koios reads the same db-sync tables and is not run.

```sh
npm run readiness -- check-devnet   # subjects known, recipes present, boundary evidence consistent
```

## Not yet covered

- JSON representations in cardano-api/cli beyond the era commands.

## Boundary register (`boundary.json`)

`boundary.json` records the 61 catalog components that implement a changed
surface directly, observed at their default-branch heads on 2026-10-19 and
2026-10-20 (Pallas, CML, cardano-js-sdk and db-sync updated from the devnet on
2026-10-22; CSL's decoders re-read and CSL and PyCardano run on the devnet on
2026-10-26), with 217 evidence items and
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
| gap | 49: every ledger codec without Dijkstra work (CSL, CML, cardano-client-lib, PyCardano, cardano-c, cometa.js, cardano-data-lite, CardanoSharp, TyphonJS, elm-cardano, buildooor, plu-ts, Evolution SDK, Mesh, Lucid Evolution, Whisky, cquisitor-lib), Pallas and gouroboros (blocks and era identity), both hardware-wallet libraries, every script compiler (Aiken, OpShin, Helios, Plutarch, JuLC, uplc-turbo, Scalus), the indexers without Dijkstra decoding (Oura, Dolos, Mithril, Carp, Scrolls, cf-ledger-sync, Rosetta Java), the service layer (Ogmios, Kupo, db-sync, Koios, Blockfrost, Cardano GraphQL, Kuber), cardano-wallet, cardano-js-sdk, ouroboros-miniprotocols-ts, Adder, Hydra, Atlas and CTL |
| no-evidence | ouroboros-network-js (proposes one caller-chosen version), cncli (consensus participation) |
| tracked | Apollo |
| in-progress | Yaci, Amaru, Dingo, yaci-store, UTxO RPC, Blaze, Yaci DevKit |
| released | Plutus, plutigo |

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

What it shows:

1. **Node-to-client breaks are concrete and early.** cardano-wallet proposes
   only V16–V22, ouroboros-miniprotocols-ts defaults to V16–V19, and Adder pins
   gouroboros v0.209.0 (V21 at most). gouroboros added V23 only in v0.213.0
   (2026-10-14), so every Go consumer below it is exposed; Pallas has offered
   V23 since v0.35.1.
2. **"Supports Dijkstra" usually means an earlier Dijkstra.** cardano-ledger-dijkstra
   0.2.0.1 (Ogmios 7.0.0, Kupo 2.12, db-sync main) and 0.3.0.0 (cardano-wallet)
   still have the segregated block body and the old header; Pallas 1.4.0 and
   cardano-c main lack the newest parameter keys and the PlutusV4 witness key.
   Only gouroboros's vendored CDDL (v0.213.0 and later) matches the target.
3. **Most of the boundary has nothing yet.** CSL, CML, cardano-client-lib,
   PyCardano, Aiken and the other script compilers show no Dijkstra work, and
   the chain followers built on Pallas (Oura, Dolos, Mithril) wait for a Pallas
   release with Dijkstra traversal.

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

- `confirmed`: a shipped path uses the gapped capability, so the tool fails or
  misbehaves after the hardfork until the dependency moves (557 decisions).
- `not-reached`: shipped code uses the dependency only outside the gap
  (1,017 decisions).
- `undetermined`: reading cannot decide; R4 execution or the maintainer must
  (36 decisions).

The register holds 639 entries and 1,610 decisions, none unreviewed or stale.
**118 tools have a confirmed gap**. 113 inherit one, and six have one in
their own code (gastronomy has both). With the 20 boundary components whose
own gap is cited in `boundary.json`, 138 tools have a confirmed gap: 113 break,
6 are in progress (the fix is underway) and 19 are dismissed. The passes below added them in order;
each pass's figures are as of that pass.

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
| 1 | db-sync | 3 |
| 2 | Blockfrost | 16 |
| 3 | Ogmios | 26 |
| 4 | Koios | 36 |
| 5 | Kupo | 44 |
| 6 | Move off Maestro | 50 |
| 7 | Pallas | 55 |
| 8 | CSL | 59 |
| 9 | Aiken (`uplc`) | 62 |
| 10–15 | cardano-client-lib, Scalus, cardano-wallet, gouroboros, ledgerjs-hw-app-cardano, cardano-js-sdk | 74 |
| 16–21 | cquisitor-lib, whisky, Adder, cardano-hw-interop-lib, CML, ouroboros-miniprotocols-ts | 81 |

Tools that are boundary components with a gap of their own (Mesh, Lucid
Evolution, Evolution SDK, yaci-store, Adder, Hydra and others) are never
unlocked by upstream fixes alone.

**2 tools have a released upstream fix**, so the next move is theirs: Marlowe
and Marconi (cardano-api 11.8). txtop and cardano-node-api were bump-ready
until the devnet showed gouroboros v0.213.x cannot decode the node's Dijkstra
blocks or place ordinary Dijkstra transactions.
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
rewritten. A link that has not been synced yet shows without a state. A failed
lookup keeps the previous entry and exits non-zero.

## On the site

`/map/dijkstra` opens with the state of every tool touching a changed surface
(Breaks after HF, In progress, Ready for HF, Not verified, Dismissed), then the
critical path (`lib/readiness/fix-graph.ts`: each blocking component placed one column
right of the furthest component it waits on, implied links dropped, the longest
chains marked; selecting a fix shows the tools it adds, and the fix order is a
list toggle) with the tools unlocked after each fix, all tools ranked by how many
catalog tools reach them, what each fix unlocks on its own,
the tools whose upstream fix is released (upgrade distance and own era
handling), inherited gaps not read yet and links waiting on a component
verdict (both grouped by component), every confirmed gap with its quoted lines,
the devnet checks, and the cited changes with their devnet outcome. Each tool page under `/map/readiness/<id>` has a Dijkstra section with
its state, issue/PR links, exposure, devnet results, blockers, upgrade, what it waits on and lead decisions. A malformed register fails the build.

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
