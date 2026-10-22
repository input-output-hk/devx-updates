# Dependency mapping and hardfork readiness

State of the repository on 2026-10-22, branch `hardfork-readiness`.

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
| Changes | `content/readiness/dijkstra/changes.json` | 19 changes and 2 checked-unchanged areas over 13 surfaces; 73 change citations, all re-verified |
| Boundary | `boundary.json` | 61 components, 202 evidence items; worst status 49 gap, 2 no-evidence, 1 tracked, 7 in-progress, 2 released |
| Classification | `classification.json` | 268 tools: 227 scanned, 41 without public source |
| Leads | `leads.json` | 527 entries, 1,241 decisions (505 confirmed, 711 not reached, 25 undetermined), none unreviewed; 112 tools with a confirmed gap |
| Unlocks | `unlocks.json` | 18 fixes unlock 81 tools; bump-ready: Marlowe, Marconi |
| Upgrades | `upgrades.json` | 11 readings (8 own-work, 1 prepared, 2 generic) |
| Devnet | `devnet.json` | 12 checks, 39 results, 20 failing |
| Dependency graph | `data/readiness/` | 268 tools accounted for, 227 with discovered source, 45 with a native profile (55 profiles, 7 complete), 1,321 evidence objects, 0 capability findings |

All registers pass `check-changes`, `check-boundary`, `check-leads` and
`check-upgrades` with `--verify-sources`, and `check-devnet`. All 148 readiness
tests pass, all 55 native profiles replay identically, and `validate` accepts
the snapshot.

## Target

Dijkstra is the owner-selected target. cardano-node 11.2 has no tag, so the
registers are pinned to the open integration branch: PR
[#6677](https://github.com/IntersectMBO/cardano-node/pull/6677) at
`34ae34db891105d2d17ad9b2704cb56423103da6` (PR #6736 stacks on it with
identical pins). Component versions are the newest CHaP versions at the
branch's index-state (`2026-10-09T14:30:01Z`): cardano-ledger-dijkstra
0.4.0.0, ouroboros-consensus 5.1.0.1, ouroboros-network 1.3.0.0,
plutus-ledger-api 1.71.0.0, cardano-api 11.8.0.0 and cardano-cli 11.3.0.0.
These satisfy the branch's bounds; no build plan was solved for them. Feature
scope follows the Hard Fork Working Group's
[Dijkstra scope](https://github.com/IntersectMBO/cardano-node/issues/6634).

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

Exposure: 65 implements, 86 dependency, 45 service, 9 marker only, 4
auxiliary only, 18 none found, 41 without public source.

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

Confirmed tools by service: Blockfrost 41, Ogmios 37, Koios 22, Kupo 21,
db-sync 13, Maestro 10.

### Unlocks and upgrades

`unlocks` derives what a fix in one component unlocks, directly and through
the components it unblocks. Each confirmed gap is an `upstream-fix`, an
`own-bump` (a release exists; the tool only raises a pin) or an `own-gap`.
`fixOrder` adds, at each step, the fix that unlocks the most tools on top of
the earlier steps:

| Step | Fix | Tools unlocked (running total) |
| --- | --- | --- |
| 1 | Blockfrost | 13 |
| 2 | Ogmios | 23 |
| 3 | Koios | 32 |
| 4 | Kupo | 39 |
| 5 | db-sync | 46 |
| 6 | Move off Maestro | 53 |
| 7 | CSL | 58 |
| 8 | Pallas | 63 |
| 9 | gouroboros | 66 |
| 10–14 | ledgerjs-hw-app-cardano, cardano-js-sdk, cardano-wallet, cardano-client-lib, Scalus | 76 |
| 15–18 | cquisitor-lib, cardano-hw-interop-lib, CML, ouroboros-miniprotocols-ts | 81 |

Marlowe and Marconi have a released upstream fix (cardano-api 11.8).
`upgrades.json` records, from quoted shipped code, whether each bump-ready
tool's own code handles the new era, and the unlock report records how far
each pin moves (most cross a breaking release).

### Devnet verification (R4)

`scripts/readiness/devnet/` reproduces a local one-pool devnet on the
integration node (IOG Hydra build 15172667 for `34ae34db`) that forks to
Dijkstra and reaches protocol version 12, then runs the checks recorded in
`devnet.json`:

| Check | Result |
| --- | --- |
| `fork-to-pv12` | The node forks to Dijkstra at protocol version 12 with 54 parameters |
| `n2c-handshake` | Only V23 is accepted; gouroboros 0.208.5 is refused; v0.213.x, Ogmios v7.0.0, Kupo v2.12 and db-sync 13.7.2.1 connect |
| `cross-era-submission` | Which Conway-built transactions survive the fork; the mempool returns the three-element Dijkstra form |
| `block-shape` | Non-segregated body; the header is still the ten-field Praos header, contradicting the CDDL's |
| `service-decoding` | Ogmios v7.0.0 and Kupo v2.12 exit at the first Dijkstra block |
| `tx-era-detection` | gouroboros cannot place ordinary Dijkstra transactions |
| `tool-upgrades` | txtop and cardano-node-api before and after the gouroboros upgrade |
| `pallas-chain-sync` | No Pallas revision decodes the node's Dijkstra blocks |
| `pallas-transactions` | Only Pallas's `dijkstra` branch decodes mempool transactions, and only when told the era |
| `cml-decoding` | CML 6.2.0 decodes neither Dijkstra blocks nor transactions |
| `js-sdk-transactions` | cardano-js-sdk 0.47.1 decodes and re-encodes plain Dijkstra transactions byte for byte |
| `db-sync-and-blockfrost` | db-sync 13.7.2.1 stops at the first Dijkstra block; Blockfrost serves the pre-fork chain as current |

The recipe reproduced on a second machine with identical errors and decoder
offsets. The Marlowe and Marconi bumps were dependency-solved in
`scripts/readiness/bump-solve/`: Marlowe resolves on cardano-api 11.8.0.0 only
with four companion pins raised across majors; Marconi does not resolve.

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
- `/map/dijkstra`: fix order and unlocks, bump-ready tools with their upgrade
  distance and own era handling, unread gaps and links waiting on a verdict,
  every confirmed gap with its quoted lines, the devnet checks, and the cited
  changes.
- `/map/readiness/` and `/map/readiness/<id>`: per-tool coverage, dependency
  graph, reach, evidence and a Dijkstra section (exposure, devnet results,
  blockers, upgrade, lead decisions).

The site is a static export; a malformed register fails the build.

## Decisions

| Date | Decision |
| --- | --- |
| 2026-10-18 | Dijkstra is the target, bound to the 11.2 integration branch until 11.2 is tagged. |
| 2026-10-19 | Change-first assessment: readiness is driven by changed surfaces (R1–R4), not by dependency-graph completeness. Broad transitive collection is paused; existing profiles, queues and packets stay replayable. |
| 2026-10-20 | `in-progress` needs visible work toward the target; a release on superseded definitions is a `gap`. Pins are judged against `firstReleases`. |
| 2026-10-20 | Hosted Blockfrost and Koios consumers inherit the self-hosted verdicts. |
| 2026-10-22 | Blockfrost RYO is merged into the `blockfrost` catalog entry, with its source, collected graph, review gaps and readiness. |
| 2026-10-22 | Maestro is deprecated; its consumers carry a gap until they change provider. |
| standing | Maintainer outreach and issues are the project owner's. The tooling prepares evidence and never contacts maintainers. |

## Known limits

- The registers are pinned to an untagged integration branch. When 11.2 is
  tagged, its revision must be compared with `changes.json`'s target.
- R2 statuses were observed on 2026-10-19 and 2026-10-20 (Pallas, CML,
  cardano-js-sdk and db-sync updated from the devnet on 2026-10-22). A head
  observation says nothing about unpublished work.
- Classification is lexical. Lead decisions settle reachability by reading;
  only the devnet checks execute anything.
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
   representative consumers per surface; re-run everything on the 11.2 tag.
6. **Bump-ready with companion pins.** Decide whether a tool counts as
   bump-ready when raising one pin forces others across majors.
7. **R1 completion.** JSON representations beyond the era commands.
8. **Remediation tracking.** Record maintainer issues, released fixes,
   consumer upgrades and downstream re-tests as distinct milestones, and use
   reverse reach to list who must upgrade after each fix.
9. **Dependency-graph coverage.** Executed Cabal collection, collectors for the
   detected unsupported ecosystems, and returned manual reviews, admitted when
   the Dijkstra registers need them.
10. **Storage maintenance.** Prune superseded snapshot chunks while keeping
    every retained manifest readable.

## Verification

```sh
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
