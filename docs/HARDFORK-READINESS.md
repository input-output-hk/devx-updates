# Dependency mapping and hardfork readiness

State of the repository on 2026-11-23 (target node 11.2.1).

This repository finds the catalog tools that stop working after the Dijkstra
hard fork (protocol version 12, cardano-node 11.2), explains why from quoted
source, and orders the upstream fixes by how many tools each one unlocks. It
has two layers:

- **Dijkstra readiness** (`content/readiness/dijkstra/`): what the fork
  changes, which components implement each change, which catalog tools reach
  them, and what a local Dijkstra devnet confirms. This layer drives the work.
- **Dependency graph** (`data/readiness/`): an evidence-backed, replayable
  package and integration graph for catalog tools, with coverage records and
  reverse reach. It feeds propagation (who must upgrade once a component
  ships a fix).

The governing rule for both: **unknown is actionable work, never an implicit
pass.** A tool is never called safe because it is inactive, has no resolved
dependencies or does not connect to a node.

Operational commands are in [Readiness operations](./READINESS-OPERATIONS.md).
The register formats and findings are in
[the Dijkstra register README](../content/readiness/dijkstra/README.md).

## At a glance

| Area | File | State |
| --- | --- | --- |
| Changes | `changes.json` | 20 changes and 2 unchanged areas; 74 change citations, re-read at the 11.2.1 revisions |
| Boundary | `boundary.json` | 61 components, 281 evidence items; 44 gap, 3 no-evidence, 10 in-progress, 4 released |
| Classification | `classification.json` | 268 tools: 227 scanned, 41 without public source; 62 revisions changed |
| Transitive links | `transitive.json` | 27 lockfile-only component links in 26 tools |
| Leads | `leads.json` | 732 entries, 1,631 surface decisions (590 confirmed, 1,000 not reached, 41 undetermined); none unreviewed, stale or orphaned |
| Unlocks | `unlocks.json` | 19 fixes unlock 73 tools; Marlowe, Marconi, Midgard, Ogmios and Kupo are bump-ready by pin comparison |
| Upgrades | `upgrades.json` | 13 readings: 8 own-work, 3 prepared, 2 generic |
| Devnet | `devnet.json` | 22 checks, 57 results, 24 failing (node 11.2.1, 2026-11-23; Ogmios and Kupo forks rerun 2026-11-24) |
| Site | `/map/dijkstra` | 207 tools: 105 break, 10 in progress, 4 ready, 4 target components, 50 not verified, 34 dismissed |
| History | `/map/dijkstra/history` | Ten tool-state changes; of 30 same-version runtime results, 29 matched and one changed because new cases were added (@cardano-sdk/core 0.47.1 on balance intervals) |
| Dependency graph | `data/readiness/` | Existing 55 native profiles retained and replayed; broad native collection remains paused |

Prior complete assessments are checksummed under `content/readiness/dijkstra-history/`; the last 11.2.0 one is
`2026-11-11-node-11.2.0/`. New raw evidence is under `content/readiness/dijkstra-runs/2026-11-23/`. New versions and checks appear separately
in the runtime comparison; lower counts or changed classification alone do not establish a fix.

## Target

The current target is the official [cardano-node 11.2.1 tag](https://github.com/IntersectMBO/cardano-node/releases/tag/11.2.1),
revision `90bc1cd9380a78a63091ff673f8c5693152c8f60`, published 2026-11-10 and marked **prerelease** by GitHub.
Versions and source revisions come from its release dependency table, retained with the run evidence.
11.2.1 is a maintenance release on 11.2.0 with no ledger-rule change and the same Dijkstra CDDL; it fixes a pool-relay
IPv4 byte-order regression of 11.2.0, and its CLI can build guards and balance intervals. Previous assessments are
preserved byte for byte, with SHA256 checksums, in `content/readiness/dijkstra-history/`.

The site identifies cardano-node, cardano-cli, cardano-submit-api and cardano-testnet
as **Target component · 11.2.1**: they belong to the reference node release.
The version in this label is the node release, not each executable's version.
This is separate from **Ready for HF** and from capability test outcomes.
Component-specific devnet results remain visible; where none are recorded, the
tool page says so and links to the target devnet checks. This presentation is
derived from committed evidence at build time (ADR-1/2); archived untagged
assessments keep **In progress** and their original results.

| Component | Version | Source commit |
| --- | --- | --- |
| cardano-ledger-dijkstra | 0.5.0.0 | `95b36905` |
| cardano-ledger-conway | 1.24.0.1 | `95b36905` |
| ouroboros-consensus | 5.4.0.0 | `808e4005` |
| ouroboros-network | 2.0.0.0 | `4646039f` |
| plutus-ledger-api | 1.71.0.0 | `261766ad` |
| cardano-api | 11.12.0.0 | `c727cd63` |
| cardano-cli | 11.7.0.0 | `24c05829` |

## How the readiness assessment works

### Changes (R1)

`changes.json` lists each Dijkstra change, the closed-vocabulary surface it
touches (node-to-client protocol, era identity, block and transaction
encoding, transaction rules, Plutus language and script context, protocol
parameters, pool registration, cardano-cli, cardano-api, consensus
participation, node configuration), when it takes effect, and the exact lines
it rests on. Every citation names a repository, a 40-character revision, a
path, a line and a single-line quote; `--verify-sources` re-reads each one.
Areas read and found unchanged (node-to-node versions, the query set) are
recorded under `unchanged`.

The changes that matter most: 11.2 offers only node-to-client V23, so older
clients disconnect as soon as a node upgrades, before the fork; every block
decoder breaks at the fork (non-segregated body); Conway-built transactions
using removed encodings are rejected after it; and PlutusV4, guards, nested
transactions and 23 new protocol parameters extend closed enumerations.

### Boundary components (R2)

`boundary.json` holds the 61 catalog components that implement a changed
surface directly: ledger codecs, node-to-client clients, chain indexers and
query services, nodes, script toolchains, transaction builders, hardware
signing and devnet tooling. Each is observed at its default-branch head and
gets a status per surface group:

| Status | Meaning |
| --- | --- |
| `gap` | Cited code cannot work against the target |
| `no-evidence` | Nothing found; never a pass |
| `tracked` | An issue exists, no code yet |
| `in-progress` | Visible work toward the target definitions (branch, open pull request, unreleased code) |
| `released` | A release contains the support |
| `verified` | A devnet check passed |

A release built only against superseded Dijkstra definitions, with no work
toward the target, is a `gap`. `firstReleases` records, per release line, the
earliest tag containing every cited quote; pin comparisons use it. Boundary
evidence may cite a devnet check: `verified` needs a pass, and a failing
result cannot back `released`.

Hosted providers are modelled as follows:

- **Blockfrost** is one component and one catalog tool, `blockfrost`, whose
  source is the run-your-own backend (`blockfrost/blockfrost-backend-ryo`).
  The hosted API runs that backend, so hosted consumers inherit its verdict.
- **Koios** is assessed from its public source (`koios-artifacts`).
- **Maestro** is deprecated (owner decision, 2026-10-22). It will not gain
  Dijkstra support, so any shipped call to it is a gap on era identity,
  transactions and protocol parameters until the tool moves to another
  provider. It is a service rule, not a boundary component; its fix is
  migration, shown on the site as "move off maestro".

### Classification (R3)

`classify-surfaces` scans every catalog tool's repository at a pinned revision
with closed, lexical rules and records, per surface, the channel it is reached
through:

- **implements**: the tool is a boundary component or part of the 11.2
  component set;
- **dependency**: a manifest depends on a boundary component or on the Haskell
  ledger, consensus, API or Plutus packages; a constraint that cannot reach the
  first release with the support is a `gap`;
- **service**: code calls Blockfrost, Koios, Maestro, Ogmios, Kupo, db-sync,
  UTxO RPC, the cardano-wallet API, a node socket, cardano-cli commands or the
  submit API;
- **marker**: era lists, enums, raw CBOR, cost models and similar; markers show
  a surface is touched but never set readiness.

Prose never establishes exposure. Tests, examples, benchmarks, demos and
development-only manifest declarations are auxiliary and never set readiness.
Each scan records path, line and quote, and whether the repository is
archived. `--reclassify` recomputes at the recorded revisions so lead
decisions stay valid.

Exposure: 65 implements, 92 dependency, 39 service, 9 marker only, 4
auxiliary only, 18 none found, 41 without public source.

### Transitive dependencies

Manifests only show direct declarations, so a tool reaching a component
through a library outside the catalog looked unexposed. `transitive` reads
the lockfiles committed at each classified revision: package-lock,
npm-shrinkwrap, pnpm-lock, yarn.lock (Classic and Berry), bun.lock,
Cargo.lock, go.sum, poetry.lock, uv.lock, gradle.lockfile and
packages.lock.json. Test, example and vendored paths are skipped. It walks
each component package's dependents up to the project and links the tool to
the **nearest catalog component** on the path. A component reached only
through another component the tool declares is left to that component's own
classification and leads. For example, a Mesh consumer is not linked to
cardano-js-sdk separately.

`classify-surfaces --reclassify` merges each link as a shipped dependency
hit of rule `transitive:<component>`, with the lockfile line as its example.
These rules stay out of the scan rule digest, so cached scans remain valid.
Lockfile rules also cover components that have no manifest rule (Oura, Adder,
Aiken's `uplc` crate, Dolos, yaci-store, julc, OpShin, cquisitor). The 30
links include Blockfrost, Lace, Daedalus and Minswap reaching CSL through
blockfrost-js or coin-selection, carp reaching Oura, and whisky, cquisitor,
sutra, gastronomy and both de-uplc tools evaluating with Aiken's `uplc`.

### Lead decisions

A dependency proves coupling, not use of the changed feature, so every
inherited gap in shipped code is read and decided in `leads.json` per tool,
dependency and surface: `confirmed` (a shipped path uses the gapped
capability), `not-reached`, or `undetermined` (needs execution or the
maintainer). Every decision quotes the lines it rests on. The decision rules
are in the register's `method`; services are decided per capability used
(Ogmios chain-sync, submission, evaluation, parameter queries; Blockfrost
`/network/eras` and the epoch parameter endpoints; and so on), except Maestro,
where any shipped call is reached.

A surface whose component has no verdict yet (`no-evidence`, `tracked`,
`in-progress`) may also be decided. `not-reached` clears the consumer's
wait whatever the component later turns out to be. A tool that does reach
the capability keeps waiting on the component. This is what removed most
"waits on a verdict" states: such decisions used to cover only the
component's `gap` surfaces, so a tool read as using CSL only for keys still
waited on CSL's other surfaces.

Confirmed tools by service: Blockfrost 41, Ogmios 37, Koios 22, Kupo 21,
db-sync 13, Maestro 10.

### Own code

Markers never set readiness, and a non-boundary tool's own code used to go
unread. A codec, era list or certificate encoder in a tool that is not a
boundary component therefore showed as "not checked". Lead decisions with
`via: "own"` now cover every shipped marker surface of such tools (130
decisions, 48 tools). They are:

- **confirmed** when the tool decodes Dijkstra data it does not control
  (chain blocks, external transactions, reference scripts, parameter sets)
  with a closed Conway-or-earlier view, or emits encodings Dijkstra rejects;
- **not reached** when the lines serve the tool's own V1-V3 scripts,
  unchanged encodings (addresses, values, datums, CIP-30 answers), emulators
  or local clusters, or are not code.

A confirmed own decision is an own gap: only the tool's maintainers can
clear it. `check-leads` lists own surfaces still undecided (`ownUnreviewed`)
for tools without a confirmed gap. Confirmed so far:

| Tool | Surface | What breaks |
| --- | --- | --- |
| AdaLite | transaction encoding | Stake (de)registration is built as certificate types 0/1, which Dijkstra refuses (devnet `cross-era-submission`) |
| libcardano | transaction encoding | The builder's stake registration is the deposit-less type 0 |
| cardano-wallet-sdk-dart | transaction encoding | Stake registration is encoded as type 0; Conway certificates are not modelled |
| stakepool-operator-scripts | era identity, protocol parameters | `dijkstra` matches no era case in the min-UTxO calculation; votes on the new parameters exit with an error |
| gastronomy | transaction encoding, Plutus language | Chain transactions are decoded with Pallas's Conway `MintedTx`; no PlutusV4 reference scripts |
| catalyst-voices | block encoding, Plutus language | The gateway indexes blocks through Pallas (via cardano-chain-follower, no lockfile committed); a PlutusV4 reference script throws in the app |

### Unlocks and upgrades

`unlocks` derives what a fix in one component unlocks, directly and through
the components it unblocks. Each confirmed gap is an `upstream-fix`, an
`own-bump` (a release exists; the tool only raises a pin) or an `own-gap`.
A fixed component that itself waits on another one only becomes usable once
that one is fixed too. Blockfrost and Koios read db-sync, so fixing them
alone unlocks nothing (until 2026-10-26 the order wrongly counted them as
usable on their own). `fixOrder` adds, at each step, the fix that unlocks the
most tools on top of the earlier steps. A fix that cannot take effect yet is
scored together with the fixes it waits on, per component, and that group is
listed prerequisites first:

| Step | Fix | Tools unlocked (running total) |
| --- | --- | --- |
| 1 | cardano-db-sync | 4 |
| 2 | blockfrost | 24 |
| 3 | koios | 36 |
| 4 | Move off Maestro | 42 |
| 5 | pallas | 47 |
| 6 | cardano-serialization-lib-csl | 51 |
| 7 | gouroboros | 55 |
| 8 | aiken | 58 |
| 9 | ledgerjs-hw-app-cardano | 60 |
| 10 | bloxbean-cardano-client-library | 62 |
| 11 | cardano-wallet | 64 |
| 12 | cquisitor-lib | 65 |
| 13 | whisky | 66 |
| 14 | cardano-js-sdk | 67 |
| 15 | buildooor | 68 |
| 16 | cardano-hw-interop-lib | 69 |
| 17 | cardano-multiplatform-lib-cml | 71 |
| 18 | scalus | 72 |
| 19 | julc | 73 |

Marlowe, Marconi and Midgard (cardano-api; the current target API is 11.12.0.0) and Ogmios and Kupo (ouroboros-consensus 5.4.0.0) have a released upstream fix by the pin comparison. This is not a new dependency solve.
`upgrades.json` records, from quoted shipped code, whether each bump-ready
tool's own code handles the new era, and the unlock report records how far
each pin moves (most cross a breaking release).

### Devnet verification (R4)

Node 11.2.1 runs a one-pool devnet that enters Dijkstra at epoch 2. Two governance hard forks raise the
protocol version from 10 to 12 before the transaction matrix. The 2026-11-23 run uses CLI 11.7.0.0.
Full logs, 32 transaction encodings (including direct deposits, a sub-transaction, guards, balance intervals and
PlutusV4), 336 Dijkstra blocks, a Conway positive control and resolved build inputs are retained under
`content/readiness/dijkstra-runs/2026-11-23/`; the recipe is in `scripts/readiness/devnet/`. Results are specific to the
named version and capability; the 11.2.0 runs are in the archived assessments.

| Check | Result |
| --- | --- |
| `fork-to-pv12` | Dijkstra PV12; 54 protocol parameters. |
| `n2c-handshake` | Only V23 accepted; gouroboros v0.221.0, Ogmios v7.0.0, Kupo v2.12 and db-sync 13.8.0.0 connect. |
| `cross-era-submission` | Unchanged: Conway payment, deposit registration, key-hash signer and metadata accepted; deposit-less registration rejected. Dijkstra payment, deposit registration and metadata accepted. |
| `advanced-transactions` | A direct deposit, a sub-transaction, a PlutusV4 reference script, a native guard, a PlutusV4 guard (its script ran) and a balance interval are accepted; an unmet interval is rejected. |
| `block-shape` | Ten-field header (protocol version 12.0) and non-segregated body; gouroboros v0.221.0 decodes all 205 Dijkstra blocks it synced. |
| `service-decoding` | Ogmios 7.0.0 and Kupo 2.12 still exit on the first Dijkstra block. |
| `tx-era-detection` | gouroboros v0.221.0 still reports ordinary Dijkstra transactions as Conway. |
| `tool-upgrades` | txtop v0.17.0 connects, as released and with gouroboros v0.221.0; its transaction list was not observed. |
| `pallas-chain-sync` | v1.5.0-rc.3 and main 0b17c8f6 decode Conway, but no Dijkstra block. |
| `pallas-transactions` | Both decode all 32 encodings with an explicit era and unstable; era detection still fails. |
| `cml-decoding` | CML 6.2.0 decodes the Conway control; no Dijkstra block or three-element transaction. |
| `js-sdk-transactions` | Fails: @cardano-sdk/core 0.47.1 round-trips 29 of 32 encodings, guards included, but cannot decode balance intervals (keyed by credential instead of reward account). |
| `db-sync-and-blockfrost` | db-sync 13.8.0.0 indexes Dijkstra blocks, then exits on the first PlutusV4 script; Blockfrost RYO v7.0.1 serves the indexed data, but /network/eras answers HTTP 500. |
| `csl-decoding` | CSL 17.0.0, 15.0.3 and 18.0.0-beta.1 decode no Dijkstra block or new body; re-encoding adds the legacy fourth element. |
| `pycardano-transactions` | PyCardano 0.19.2 fails on Dijkstra metadata and on every new body. |
| `jvm-codecs` | Yaci 0.5.0-pre17 now decodes all 336 Dijkstra blocks. cardano-client-lib 0.8.0-pre8 reads every new field; with Era.Dijkstra 31 of 32 ids match (not the PlutusV4 guard); without an era it re-encodes the Conway shape. 0.7.3 fails on guards and Dijkstra metadata. |
| `fork-chain-sync` | The IntersectMBO Ogmios fork syncs every block and returns full Dijkstra transactions (54bb8c1c, and 20c383a2 on 2026-11-24). The Kupo fork stopped at the first sub-transaction at ee51691d; at e9ef0be3 (2026-11-24) it indexes the whole chain. |
| `fork-ogmios-api` | The Ogmios fork evaluates a PlutusV4 guard, submits, follows the mempool and answers a rejected submission. Dijkstra protocol parameters were unavailable at 54bb8c1c; at 20c383a2 (2026-11-24) they match the node's. |
| `blockfrost-dijkstra-data` | With `plutusV4` added to db-sync's enum by hand, db-sync 13.8.0.0 skips sub-transactions and exits on the first spend of a sub-transaction output. Blockfrost v7.0.1 lists spent outputs as unspent, misses direct deposits, returns `plutusV4` and redeemer purpose `guard` (with an empty script hash) outside its API schema, serves no new parameters, and `/network/eras` answers HTTP 500. |
| `blockfrost-platform-submit` | blockfrost-platform 1.0.0 cannot connect to node 11.2.1 (no V23); main (d5a48256) connects but its `/tx/submit` rejects all 27 three-element encodings with HTTP 400 and passes the 5 Conway ones. |
| `ccl-quicktx` | cardano-client-lib 0.8.0-pre8 and 0.7.3: QuickTx stake registration and deregistration are still rejected (deposit-less certificates); 0.7.3 also writes a duplicate vkey witness and a wrong script integrity hash for shared datum hashes. |
| `ccl-dijkstra-transactions` | cardano-client-lib 0.8.0-pre8 (released): every Dijkstra feature it models is accepted, also when signed through the Transaction object; a missing guard witness and an unmet interval are rejected. |

Koios and required top-level guards were not run. A newly published release is not an end-to-end devnet pass, and
neither is work in a fork or a prerelease.

Historical Marlowe/Marconi dependency solves under `scripts/readiness/bump-solve/` targeted cardano-api 11.8.0.0.
They were not rerun as part of this source-and-devnet refresh and do not prove resolution against 11.11.0.0.

## How the dependency graph works

The graph is collected offline and committed; the site only reads it
(ADR-1, ADR-2). Each catalog tool is an assessment root with its own coverage
record, including tools that cannot be resolved.

```text
catalog (data/cardano-graph.json)
  -> inventory: one coverage record per catalog tool
  -> discover: pinned source revisions, manifests, workspaces, ecosystems
  -> collect: native resolution in the consumer's context
  -> normalized artifact/occurrence graph with retained evidence
  -> integration leads, review packets, imported review decisions
  -> report: coverage, reverse reach, work queues
  -> validate and replay
```

- **Data model.** Tools, artifacts (ecosystem, name, version, source), resolution
  profiles (platform, toolchain, features, configuration), occurrences (an
  artifact as selected in one profile), typed edges with scope, condition,
  constraint and verification state (`verified`, `suggested`, `disputed`,
  `rejected`), evidence, gaps and snapshots. Development and test scope is kept
  but excluded from production reach.
- **Collectors.** `npm-lock`, `pnpm-lock`, `yarn-lock` (Berry and Classic),
  `bun-lock`, `poetry-lock`, `uv-tree`, `cargo-metadata`, `go-packages`,
  `gradle-resolution` and `cabal-plan` (imported). Profiles are partial unless
  the collector establishes an installed selection.
- **Evidence.** Content-addressed, compressed inputs in
  `data/readiness/evidence/`; the snapshot is stored as verified JSON chunks.
  `replay` reconstructs every native graph from retained inputs.
- **Coverage.** Artifact, resolution, integration and capability coverage are
  recorded separately as `complete`, `partial`, `unresolved` or
  `not-applicable`. Hardfork readiness in the snapshot stays `unassessed`; the
  Dijkstra registers carry it.
- **Reach.** Reverse traversal counts distinct catalog tools, with required,
  optional, build and development reach separate and one explanatory path per
  tool.
- **Reviews.** `export-review` writes evidence packets for manually launched
  discovery and challenge reviews ([task briefs](./DEPENDENCY-REVIEW-TASKS.md),
  [how to run them](./RUN-PREPARED-REVIEWS.md)); `import-review` admits
  structured results as suggestions with checked citations.
- **Operations.** `.github/workflows/readiness.yml` refreshes discovery and
  registered profiles weekly, validates and replays, and uploads a comparison
  for review. It has read-only permissions and never commits.

Coverage today: 268 tools, 227 with discovered source, 45 with a native
profile, 55 profiles (7 complete within their declared scope), 65,779
occurrences and 226,077 edges. Broad transitive collection is paused (see
Decisions); new collection is admitted when the Dijkstra registers need it.

## On the site

- `/map`, `/map/table`, `/map/analysis`: the catalog, with maintenance status
  (Maintained, Maintenance-only, Deprecated, Abandoned, Archived,
  Experimental, Research).
- `/map/dijkstra`: the overview (state of every tool touching a changed
  surface), the critical path (the blocking components as a dependency graph,
  ending in a column of the tools DApps build on: more than 10% usage in the
  State of the Developer Ecosystem 2025 survey and a confirmed gap; longest
  chains to them in bold; selecting a fix shows the tools it unlocks, and the
  fix order is a list toggle under it) with the cumulative unlock curve, and all
  tools with their state. Details are on three sub-pages:
  `/map/dijkstra/devnet` (the devnet checks), `/map/dijkstra/changes` (the cited
  changes and what was checked unchanged) and `/map/dijkstra/evidence`
  (upgrades ready, the review queues, and every lead decision with its quotes
  collapsed per tool). What a single fix unlocks is on the component's own page.
- `/map/readiness/` and `/map/readiness/<id>`: per-tool coverage, dependency
  graph, reach, evidence and a Dijkstra section (exposure, devnet results,
  blockers, upgrade, lead decisions).

The site is a static export; a malformed register fails the build.

## Decisions

| Date | Decision |
| --- | --- |
| 2026-10-18 | Dijkstra is the target, initially bound to the 11.2 integration branch. |
| 2026-11-01 | Refresh against tagged node 11.2.0; preserve the prior complete assessment with checksums and expose a version-aware history comparison (ADR-1/2). |
| 2026-10-19 | Change-first assessment: readiness is driven by changed surfaces (R1–R4), not by dependency-graph completeness. Broad transitive collection is paused; existing profiles, queues and packets stay replayable. |
| 2026-10-20 | `in-progress` needs visible work toward the target; a release on superseded definitions is a `gap`. Pins are judged against `firstReleases`. |
| 2026-10-20 | Hosted Blockfrost and Koios consumers inherit the self-hosted verdicts. |
| 2026-10-22 | Blockfrost RYO is merged into the `blockfrost` catalog entry, with its source, collected graph, review gaps and readiness. |
| 2026-10-22 | Maestro is deprecated; its consumers carry a gap until they change provider. |
| 2026-10-26 | The fix order respects dependencies between components: a fix that waits on another counts only once both are in, and is scored with its prerequisites. |
| 2026-10-26 | A non-boundary tool's own code is read like an inherited gap (`via: "own"`); a confirmed read is an own gap. |
| 2026-10-26 | Lockfiles are a classification input; a lockfile link goes to the nearest catalog component, never around a component the tool declares. |
| 2026-10-26 | Surfaces waiting on a component's verdict may be decided; `not-reached` clears the wait, a reached surface keeps waiting. |
| 2026-11-23 | Target moves to tagged node 11.2.1; the 11.2.0 assessment is archived and every devnet check is rerun. |
| 2026-11-23 | Support shipped only in a prerelease stays `in-progress`: pin comparison cannot order prerelease tags or read variable pins, so a `released` status would count consumers on older pins as fixed. |
| 2026-11-23 | Blockfrost transaction encoding is reached by reading UTxOs, transactions, accounts or scripts or by submitting; Blockfrost-compatible servers are not reached. |
| standing | Maintainer outreach and issues are the project owner's. The tooling prepares evidence and never contacts maintainers. |

## Known limits

- The target is the tagged 11.2.1 prerelease. Component revisions and releases were re-observed on 2026-11-23; unpublished work is unknown.
- Newly recorded library releases are supported by source evidence, not by a full runtime matrix. Prerelease support must not be assumed present in an older stable consumer pin.
- Classification is lexical. Lead decisions settle reachability by reading;
  only the devnet checks execute anything.
- Transitive links need a committed lockfile. Haskell and PureScript projects
  (cabal freeze files, spago) are not parsed, and repositories without a
  lockfile (catalyst-voices' gateway) are read by hand. yarn, pnpm, bun and
  Cargo lockfiles do not mark development-only packages, so lead decisions
  settle those links.
- Blockfrost's transaction encoding is a gap (devnet, 2026-11-11); its 58
  consumers were read on 2026-11-23. Koios's is still `no-evidence`: it serves
  db-sync's tables, which stop at the first PlutusV4 script.
- cardano-cli 11.7 builds direct deposits, sub-transactions, guards and balance
  intervals, so the devnet exercises every Dijkstra-only body key except
  required top-level guards.
- Pin comparison reads a version only where the manifest line names it (not
  Gradle or Maven variables, version catalogs referenced by name, or sbt
  values), and ignores prerelease suffixes (0.8.0-pre4 compares equal to
  0.8.0-pre8). Support shipped only in a prerelease is therefore kept
  `in-progress` (cardano-client-lib, Yaci), so consumers on older pins are not
  counted as fixed.
- 41 tools have no public source and are unclassified.
- R1 does not cover JSON representations in cardano-api/cli beyond the era
  commands.
- Blockfrost's and Koios's own Dijkstra handling cannot be exercised until
  db-sync indexes Dijkstra blocks.
- The bump-ready list compares pins with the first fixed release and does not
  model companion pins (Marlowe needs four more).
- The dependency graph covers 45 tools; Cabal and several detected ecosystems
  have no executed collector; no manual review has been returned, so there are
  no capability findings.

## Next evolutions

1. **Outreach material (R5).** One local packet per boundary component with a
   confirmed devnet failure (Ogmios, Kupo, db-sync, Pallas, CML, gouroboros),
   then the rest of the fix order: what fails, how to reproduce it, the change
   it rests on and the tools blocked behind it. The owner sends them.
2. **Weekly R2 re-observation.** Re-read every component head, starting with
   the fix order, and record status changes with evidence; add it to the
   scheduled workflow.
3. **Maestro migration notes.** For each of the ten confirmed Maestro
   consumers, the provider options it already ships and their Dijkstra status.
4. **Remaining hosted providers.** Anvil, NOWNodes, Tangocrypto, GetBlock,
   NFTCDN, Demeter, TapTools, DexHunter and Cardano on BigQuery have no public
   source; assess them from documented APIs or owner-supplied evidence.
5. **Devnet coverage.** Koios on the devnet; Blockfrost and Koios again once
   db-sync decodes Dijkstra; compile Marlowe and Marconi on a larger machine;
   representative consumers per surface; extend the completed 11.2.0 matrix to advanced Dijkstra transactions.
   Next codecs by tools blocked on reading alone: cardano-client-lib,
   ledgerjs-hw-app-cardano (on Speculos), Scalus, Aiken's `uplc` and the
   cardano-js-sdk parameter-update path. Settle the 43 undetermined decisions
   by execution where possible (bursa's Keystone signing, argus-cardano-sync
   through Chrysalis, hydra-pay's bundled configs).
   Hand-built transactions with body keys 23-27 would exercise the codec gaps
   that now rest on source.
6. **Bump-ready with companion pins.** Decide whether a tool counts as
   bump-ready when raising one pin forces others across majors.
7. **R1 completion.** JSON representations beyond the era commands.
8. **Pass-through services.** Record Blockfrost's and Koios's transaction
   encoding as following db-sync and decide it per consumer (transaction
   history and CBOR reads are reached; submission is not).
9. **Manifest rules for Oura, Adder and Aiken's `uplc`.** They are matched
   only in lockfiles today. Adding them to the scan rules changes the rule
   digest and rescans every repository, about 230 shallow clones.
10. **Remediation tracking.** Record maintainer issues, released fixes,
    consumer upgrades and downstream re-tests as distinct milestones, and use
    reverse reach to list who must upgrade after each fix.
11. **Dependency-graph coverage.** Executed Cabal collection, collectors for the
    detected unsupported ecosystems, and returned manual reviews, admitted when
    the Dijkstra registers need them.
12. **Storage maintenance.** Prune superseded snapshot chunks while keeping
    every retained manifest readable.

## Verification

```sh
npm run readiness -- transitive                      # lockfile links (network); then:
npm run readiness -- classify-surfaces --reclassify  # merges them, cached scans only
npm run readiness -- unlocks
npm run readiness -- check-changes --verify-sources
npm run readiness -- check-boundary --verify-sources
npm run readiness -- check-leads --verify-sources
npm run readiness -- check-upgrades --verify-sources
npm run readiness -- check-devnet
npm run readiness -- validate
npm run readiness -- replay
npm run test:readiness
NEXT_PUBLIC_BASE_PATH=/devx-updates npm run build
```

Tests use recorded native outputs and fixtures for shared artifacts, diamond
paths and cycles, workspace links, optional and build scopes, missing source,
failed resolution, invalid citations, stale packets and replay; and they load
every committed Dijkstra register through the site view.
