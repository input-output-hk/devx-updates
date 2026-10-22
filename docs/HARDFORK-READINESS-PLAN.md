# Dependency mapping and hardfork readiness

Status: **revised 2026-10-19 — change-first assessment; R4 started 2026-10-20.** The dependency-graph pipeline (phases 1–5) is retained but no longer drives the work; see [Plan revision](#plan-revision-2026-10-19-change-first-assessment). `origin/hardfork-readiness` ends at `6614088`; every commit after it (from `d03d9e2` on) is local only. See [Current state and handoff](#current-state-and-handoff-2026-10-21) before resuming.

## Implementation progress

This checklist records delivered behavior and verification, not just code started.

- [x] Planning baseline and manually launched review task briefs.
- [x] Phase 1: validated catalog inventory, coverage records, release discovery, and ecosystem detection.
- [x] Phase 2: native-resolution import, evidence retention, context-aware graph, impact calculation, and pilot verification.
- [ ] Phase 3: catalog-wide discovery, explicit unresolved frontiers, manual packet export, and validated review import.
- [x] Phase 4: static coverage, tool detail, impact, filters, and exports, verified in a browser.
- [x] Phase 5: resumable refresh, snapshot comparisons, freshness reporting, and scheduled collection for registered profiles.
- [ ] Phase 6: target-specific compatibility testing. Gated on the selected hardfork environment and change analysis.
- [x] R1: Dijkstra change register and surface vocabulary — 19 changes and 2 checked-unchanged areas, 73 verified citations; `header-version-info` corrected by the devnet (the node still emits the ten-field header). JSON representations beyond the era commands remain a known limit.
- [ ] R2: boundary-component register with per-component Dijkstra status — 61 components, 200 evidence items, all assessed (worst status: 49 gap, 2 no-evidence, 1 tracked, 7 in-progress, 2 released); weekly re-observation and hosted API-provider entries remain.
- [ ] R3: surface classification of all 269 catalog tools — full scan (227 scanned, 42 without public source); every inherited gap decided from shipped code (515 lead entries, 1205 decisions, 110 tools with a confirmed gap, none unreviewed); unlock report, fix order and upgrade readings derived.
- [ ] R4: devnet/testnet verification of boundary components, then representative consumers — first run 2026-10-20, reproduced and extended to the codecs 2026-10-22 (`devnet.json`: 11 checks, 36 results, 18 failing); service layer with Postgres and the Haskell tools remain.
- [ ] R5: fix propagation through direct reverse dependencies and maintainer outreach.

## Plan revision (2026-10-19): change-first assessment

### Why the plan changed

The goal (section 1) is to find tools that may stop working after Dijkstra in
time for maintainers to ship fixes. An audit of the retained data at snapshot
`d19a7de8…` showed that the dependency-first approach answers a different
question — *what depends on what* — and cannot reach the goal on its own:

- **Breakage comes from the changed surface, not from having dependencies.** A
  tool is affected when it touches something Dijkstra changes: transaction/block
  CBOR, the era list, node-to-client protocol versions and local state queries,
  protocol parameters and cost models, the Plutus ledger API, CLI/API output,
  indexer schemas or provider responses. A package graph records none of that.
- **The ranking degenerated to popularity.** With zero capability findings, the
  investigation queue ranks by reach alone. Its top 74 entries are generic npm
  packages (`ws`, `bech32`, `@types/node`, `ms`, …); the first Cardano component,
  `@emurgo/cardano-serialization-lib-nodejs`, is at #76 and `@meshsdk/core` near
  #1,633.
- **Service coupling, the most common breakage channel, is unmodeled.** Calls to
  Blockfrost, Koios, Ogmios, Kupo, db-sync or a node socket exist only as
  `needs-review` lexical leads or documented gaps; no service edge is verified.
- **Collection order is inverted for this question.** Batches started with
  higher-level consumers. The layer that implements the changed formats —
  cardano-node/cli, ledger, Plutus, Ogmios, Kupo, db-sync, cardano-wallet, CSL,
  CML, Pallas, cquisitor, Aiken, Scalus, plu-ts, all API providers, L2s and
  oracles — has no assessed root. Of 47 Cabal tools only Atlas is collected.
- **Effort does not match the deadline.** After roughly 50 commits: 45/269 tools
  have a native profile (7 of 55 profiles complete), 0 capability findings, 0
  returned reviews, 0 hardfork assessments, ~327 MB of retained data. Recent
  milestones were dominated by storage, replay and build-resource work.

### What stays

Coverage records for all 269 tools, the evidence/replay discipline, reverse
reach, the static dashboard and the "unknown is never a pass" rule (section 1)
remain. Reverse reach becomes the **propagation** tool (R5): once a boundary
component ships Dijkstra support, it lists who must upgrade. For that step,
direct dependencies on boundary components matter far more than complete
transitive closures.

### What changes

1. **Change analysis first (R1).** Phase 6's change-to-capability mapping is no
   longer gated on catalog coverage or an immutable node tag. Read the Dijkstra
   era sources (ledger CDDL and rules, consensus/HFC and network protocol
   versions, Plutus ledger API, cardano-api/cli) at pinned released component
   versions. The cardano-node 11.2 tag is still required for test environments
   (R4) and for binding final assessments (section 3), not for identifying the
   changed surface.
2. **Boundary register (R2).** List the components that implement a changed
   surface directly — ledger/CDDL implementations in each language, chain-sync
   and query clients, indexers, API providers, script toolchains — and track
   each one's Dijkstra status with cited evidence (`no-evidence`, `in-progress`,
   `released`, `verified`).
3. **Cheap classification of every tool (R3).** For all 269 tools record which
   surfaces they touch via: direct dependencies on boundary components, service
   calls, and era/format markers (hard-coded era lists, era tags, raw CBOR or CLI
   output parsing). This extends the existing lexical scanner with surface rules;
   it does not require full native closures.
4. **Verification on a Dijkstra-enabled network (R4)** for boundary components
   first, then representative consumers per surface, following phase 6's
   acceptance rules.
5. **Propagation and outreach (R5)** through direct reverse dependencies, plus
   direct maintainer questions in parallel.

### Paused

Broad transitive native collection batches are paused. New collection is
admitted only when R2/R3 show it is needed to decide whether a specific tool
touches a changed surface. Storage, replay and dashboard work is limited to
what R1–R5 require. Existing collection queues, profiles and pending review
packets stay intact and replayable.

### Revised prioritization

Section 8's rollout priority (higher-level consumers first) is superseded:
rank by **which changed surfaces a tool touches**, then by downstream reach of
the boundary components involved, then by evidence gaps. Missing evidence still
counts as risk, never as a pass.

### R1 acceptance

- Every Dijkstra change entry cites an exact repository, immutable revision and
  file location, and names the surface it affects.
- Each entry states its basis: `source-verified` (read in pinned code/CDDL),
  `documented` (changelog/CIP at a pinned revision) or `provisional` (open
  branch/PR, not yet released).
- The surface vocabulary is closed and used by R2/R3 records.
- Versions are bound to what the provisional 11.2 integration branch selects,
  and differences from the latest released component versions are recorded.

### R1 checkpoint (2026-10-19)

`content/readiness/dijkstra/changes.json` records 17 changes across 12 surfaces,
all `source-verified`, with 58 citations (repository, 40-character revision,
path, line, exact quote). Its README summarizes them for readers. Components are
the newest CHaP versions at the 11.2 branch's index-state (ledger-dijkstra
0.4.0.0, consensus 5.1.0.1, network 1.3.0.0, plutus-ledger-api 1.71.0.0,
cardano-api 11.8.0.0, cardano-cli 11.3.0.0); no build plan was solved. PR #6736
stacks on #6677 with identical pins. Feature scope and v12/v13 activation follow
the HFWG scope issue #6634.

Findings that change priorities:

- **Node-to-client V23 only.** Consensus 5.1.x (also 5.1.0.2) offers only
  `NodeToClientV_23`; 11.1.x offered V16–V23. Clients that cannot negotiate V23
  break when nodes upgrade to 11.2, before the fork.
- **Every block decoder breaks at v12**: non-segregated body, per-transaction
  `is_valid`, header `header_version_info`, Leios/Peras fields.
- **Conway-built transactions can be rejected after the fork.** Consensus
  re-decodes older-era transactions as Dijkstra, and Dijkstra drops certificate
  types 0/1, array-encoded redeemers and empty multiasset maps. At the pinned
  commit `cardano-cli latest` still means Conway.
- PlutusV4, guards, nested transactions, account enhancements and 23 new
  protocol parameters extend closed enums (script/redeemer/native-script tags,
  body keys 23–27, parameter keys 34–56).

`check-changes` validates the closed vocabulary, pinned revisions and references;
`--verify-sources` re-read all 58 quotes via GitHub successfully. Three new
behavior tests pass with the existing suite (126 tests). TypeScript and lint pass.

R1 remaining: node-to-node (Leios mini-protocol) changes, local-state-query result
encodings and Dijkstra genesis configuration. The last two also gate R4's
devnet. Next: R2 boundary register, starting with the components the findings
above expose: serialization libraries (CSL, CML, Pallas, Gouroboros, cardano-js-sdk
core, cardano-client-lib, PyCardano, cometa, plu-ts/harmoniclabs), chain-sync and
query services (Ogmios, Kupo, db-sync, cardano-wallet, Oura, Dolos), evaluators
and script languages, and API providers.

### R1 completion (2026-10-20)

The remaining reads are in `changes.json`. Two changes were added:
`dijkstra-genesis-config` (a new `node-configuration` surface: the node reads
the Dijkstra genesis and fork epoch only with `ExperimentalHardForksEnabled`,
which also switches it to forging protocol version 12, and cardano-testnet's
default configuration leaves that flag off) and `query-pparams-encoding`
(local-state-query protocol parameters grow from 31 to 54 positional fields in
the Dijkstra era). Node-to-node versions and the query set were read and found
unchanged; the register now records such cited absences in `unchanged`. R3 got a
`genesis-config` marker for configuration and genesis generators.

### R2 checkpoint (2026-10-19)

`content/readiness/dijkstra/boundary.json` records 61 catalog components that
implement a changed surface directly (ledger codecs, node-to-client clients,
chain indexers and query services, nodes, script toolchains, transaction
builders, hardware signing, devnet tooling). Each was observed at its
default-branch head; status is recorded per surface group as `gap`,
`no-evidence`, `tracked`, `in-progress`, `released` or `verified`, with 45
pinned source citations and 40 issue/pull-request references. `check-boundary
--verify-sources` re-read all source citations successfully; three new tests
pass with the suite (129 tests).

Worst status per component: 8 gap, 37 no-evidence, 1 tracked, 12 in-progress,
3 released, 0 verified. Findings that change priorities:

- **Node-to-client gaps exist today.** cardano-wallet offers V16–V22 only,
  ouroboros-miniprotocols-ts defaults to V16–V19, and Adder pins gouroboros
  v0.209.0 (≤V21). gouroboros gained V23 in v0.213.0 (2026-10-14), so its
  consumers below that release that open node-to-client connections (for
  example cardano-node-api v0.202.7 and txtop v0.208.5) are R5 propagation
  targets. Haskell clients that
  take versions from ouroboros-consensus ≥3.0.1 and Pallas ≥0.35.1 offer V23.
- **Earlier Dijkstra definitions are the common case.** Ogmios 7.0.0, Kupo 2.12
  and db-sync use cardano-ledger-dijkstra 0.2.0.1 and cardano-wallet uses
  0.3.0.0; both differ from 0.4.0.0 in block body and header. Pallas 1.4.0
  vendors CDDL from ledger 1587f21a; cardano-js-sdk stops at parameter key 37
  and cardano-c at 48. Only gouroboros (v0.213.0 and later) matches the target CDDL.
- **Hydra stops at the fork**: its chain follower throws on a Dijkstra block.
- **37 components show no Dijkstra work**, including CSL, CML,
  cardano-client-lib, PyCardano, Aiken, OpShin, Helios, Plutarch, Mesh and the
  hardware-wallet libraries. These are the first maintainer questions for R5.

Limits: API providers whose code is not public (Blockfrost, Koios as a
service, Maestro and others) are not yet covered; a head observation says
nothing about unpublished work; statuses must be re-observed before use. Next:
R3 classifies all 269 tools by direct dependencies on these components,
service calls and era/format markers, using `dependsOn` and the component
versions where readiness was first released.

### R3 checkpoint (2026-10-19)

`content/readiness/dijkstra/classification.json` classifies all 269 catalog
tools. `classify-surfaces` fetches each repository's default-branch head
shallowly (files over 1 MiB omitted), applies closed surface rules, caches the
scan per revision and rule digest, and deletes the checkout. 227 tools were
scanned; 42 have no public repository. Rules are lexical leads with recorded
path, line and quote; prose never establishes exposure and markers never set
readiness.

Exposure: 65 implements (61 boundary components and the four 11.2 upstream
tools), 93 dependency, 42 service, 9 marker only, 18 none found, 42 unknown.
Readiness for tools outside the boundary: 35 gap, 20 in-progress, 13 upstream,
2 released, 58 no-evidence and 76 unassessed.

Findings that change priorities:

- **Gaps propagate further than R2 shows.** 35 non-boundary tools inherit a
  gap: Daedalus and cardano-wallet-js (cardano-wallet node-to-client), Gerolamo
  (ouroboros-miniprotocols-ts), six Go tools pinned below gouroboros v0.213.0,
  19 CSL consumers that cannot represent PlutusV4, and Lace, Daedalus, Nami and
  Hyperledger Identus through cardano-js-sdk protocol parameters.
- **Version constraints, not component status, decide many cases.** The
  classifier compares each manifest constraint with the release R2 records
  (exact Go pins, Cargo/Poetry caret, Cabal PVP majors, lower bounds ignored).
- **Service coupling is the widest channel**: Blockfrost 80 tools, node
  sockets 75, Ogmios 65, cardano-cli 52, Koios 38, db-sync 35, Kupo 32. Hosted
  provider readiness is not yet assessed, so these surfaces stay `no-evidence`
  or `unassessed`.

Limits: lexical rules cannot tell whether a dependency's changed feature is
used; tests and examples count as code; umbrella Pallas crates are attributed
the node-to-client surface whether or not the mini-protocols are used; the 42
tools without public source need documented-service or maintainer evidence.
Next: confirm the top-ranked leads from their quotes, add hosted API providers
to R2, then start R4 devnet checks for the components behind the most
inherited gaps (cardano-wallet, gouroboros consumers, CSL, cardano-js-sdk) and
R5 outreach for the 37 no-evidence boundary components.

### R3 lead confirmation (2026-10-20)

Every inherited gap outside the boundary was read in shipped code at the
classified revision and decided in `content/readiness/dijkstra/leads.json`
(`check-leads`): 114 tool/dependency/surface decisions, 46 confirmed,
50 not reached, 18 undetermined, every quote re-read on GitHub.

Reading first corrected the scanner (scanner version 8): tests, examples,
benchmarks, demos and workshops are auxiliary and never set readiness; the
plutus-ledger-api rule is limited to Haskell manifests; Haskell pins of the
upstream packages are compared with the R1 component-set versions (cardano-api
11.8.0.0 and so on); dependency hits keep every versioned manifest line; and
each repository's archive state and last push are recorded. The exposure counts
became 65 implements, 87 dependency, 44 service, 4 auxiliary, 9 marker,
18 none found, 42 unknown; 35 tools outside the boundary still inherit a gap
(Chrysalis, Catalyst Voices, Hyperledger Identus and Plutip's misattribution
dropped out; Midgard, CLB, offchain-metadata-tools and Plutip entered through
cardano-api pins).

Findings that change priorities:

- **21 tools have a confirmed gap.** Node-to-client: txtop, cardano-node-api,
  Gerolamo (its own responder offers V16–V19 only), Daedalus and
  cardano-wallet-js. Transaction decoding with CSL (no PlutusV4): Yoroi,
  cardano-dev-wallet, cardano-hw-cli, Hydra SDK, Masumi, cardano-rosetta-legacy
  and csl-mobile-bridge. cardano-js-sdk parameter keys: Lace and Nami.
  Pre-target ledger types: Bursa and the IBC incubator. Scalus evaluation:
  Yano. Old cardano-api: Marlowe, Marconi, sc-tools and Midgard.
- **Half of the CSL coupling is not reached.** PlutusV4 is additive, so tools
  that use CSL only for addresses, keys, metadata or their own PlutusV3
  transactions keep working; only decoders of foreign transactions break.
- **Archived repositories carry confirmed gaps** (cardano-node-api,
  cardano-rosetta-legacy, Nami). Outreach for those means users and forks, not
  maintainers.

Outreach (R5) is done by the project owner; this work only prepares the
evidence.

Pins are judged against verified first releases. R2's `releasedIn` names a
release confirmed to contain the support, not the first one; judging pins
against it flagged Dingo, yaci-devkit, Apollo and several plutigo pins that
already had the support, and produced one wrong lead (cardano-node-api does
evaluate PlutusV4). R2 now records `firstReleases` per release line (the
earliest tag containing every cited quote), and `classify-surfaces
--reclassify` recomputes without fetching so that lead revisions stay valid.

### Boundary propagation and unlocks (2026-10-20)

The 26 dependency gaps between boundary components were decided the same way
(`leads.json` now holds 170 decisions: 90 confirmed, 65 not reached,
15 undetermined). 16 boundary components have a confirmed gap through another
component: Evolution SDK, Lucid Evolution, Mesh and yaci-store through Scalus;
Blaze and Mesh through cardano-js-sdk; Whisky and Cquisitor through CSL; Adder,
Scrolls and cf-ledger-sync through node-to-client libraries without V23; and
Ogmios, Kupo, Kuber, Atlas, Hydra and cardano-wallet through Haskell pins below
the 11.2 component set.

Two more scanner corrections (scanner version 10): development-only manifest
declarations are auxiliary (a published npm library's devDependencies, Cargo
dev-dependencies, Cabal test suites, Gradle test configurations, Maven test
scope), while applications keep their bundled devDependencies; and tools
sharing one repository revision get separate checkouts.
`classify-surfaces --reclassify` rescans at the recorded revisions so lead
decisions stay valid.

`unlocks` (`content/readiness/dijkstra/unlocks.json`) derives the dependency
view the owner asked for: which tools a fix in one component unlocks, directly
and through components it unblocks, which still wait on something else, and
which tools are bump-ready. CSL unlocks nine tools, Scalus four (Mesh also needs
cardano-js-sdk), cardano-js-sdk three, cardano-wallet two and
ouroboros-miniprotocols-ts one; fourteen tools only have to raise a pin.

Next: add hosted API providers to R2, then start R4 devnet checks with the
upstream fixes that unlock the most tools (CSL, Scalus, cardano-js-sdk) and the
bump-ready node-to-client consumers.

### R2 re-observation of the service layer (2026-10-20)

Most undecided links went through components with no verdict (Blockfrost RYO,
Koios) or an `in-progress` one that hid a stalled release (Ogmios, Kupo,
db-sync, Kuber). `in-progress` now needs visible work toward the target
definitions; a release built only against superseded definitions, with no
branch or pull request toward 11.2, is a `gap`.

- **Blockfrost RYO** (v6.8.1): `/network/eras` looks protocol majors up in a
  table that ends at 11, so it throws once db-sync records protocol 12; the
  parameter endpoints select a fixed Conway column list.
- **Koios** (v1.4.2): the static `era_map` ends at protocol 11 and says it must
  be updated before a fork; `epoch_params` is Conway-only; submission and
  evaluation are proxied to an Ogmios v6 instance.
- **Ogmios, Kupo, db-sync, Kuber**: released against node 11.0.1 libraries;
  Ogmios and Kuber heads are still their release commits (June and May), and
  none has a branch or pull request toward 11.2. Adder keeps `in-progress`: a
  gouroboros 0.213.3 bump is an open pull request.

Worst status per component is now 14 gap, 35 no-evidence, 1 tracked, 8
in-progress, 3 released. The change leaves 221 tool/dependency/surface gap
links undecided (Blockfrost RYO 63, Ogmios 59, Koios 37, db-sync 31, Kupo 31).
Hosted Blockfrost consumers inherit the RYO verdict until hosted providers have
their own R2 entries.

Bump-ready no longer means "raise a pin". The unlock report derives each pin's
step and whether it crosses a breaking release (10 of 11 do), and
`upgrades.json` records each bump-ready tool's own era handling from quoted
shipped code: 7 own-work, 1 prepared (Bursa), 2 generic (txtop, Scrolls), 1
undetermined (cardano-node-api). The site groups undecided links by component:
inherited gaps not read yet (117 tools) and links waiting on a component
verdict.

All 221 links are now read (393 lead entries, 913 decisions, quotes
re-verified): 97 tools have a confirmed gap, 82 of them through a service.
Fixing the service layer (Blockfrost RYO, Ogmios, Kupo, Koios, db-sync)
unlocks 61 tools; adding CSL, Scalus, cardano-js-sdk, cardano-wallet and
ouroboros-miniprotocols-ts unlocks 81. Six tools have a released upstream fix.
The unlock report now records a greedy `fixOrder`.

### R2 completion for libraries and compilers (2026-10-20)

The 35 components without evidence were re-observed and judged by what their
code enumerates (body keys ending at 22, parameter keys at 33, Plutus languages
at V3, pool parameters without the BLS key, era tables ending at Conway, V3
script contexts, Pallas or Yaci versions without Dijkstra block decoding): 33
are gaps, cncli follows Pallas main (block encoding in progress) and
ouroboros-network-js stays without evidence. Worst status per component: 47
gap, 2 no-evidence, 1 tracked, 8 in-progress, 3 released.

The 85 links this added are decided (490 lead entries, 1157 decisions, all
quotes re-verified); 101 tools have a confirmed gap. The fix order now unlocks
71 tools across 15 upstream fixes, because more boundary components carry gaps
of their own. Four tools have a released upstream fix.

Next: R4 devnet checks for the service layer and the four tools with a released
fix, and hosted-provider entries in R2 to replace the RYO proxy.

### R4 checkpoint (2026-10-20): first devnet run

The integration node `34ae34db` ran a local one-pool devnet: Dijkstra at epoch
2, then protocol version 12 through two governance hard forks. Seven checks
(`content/readiness/dijkstra/devnet.json`, recipe in
`scripts/readiness/devnet`) record 28 results, 12 failing:

- Confirmed: the fork, 54 parameters, V23-only handshake, the non-segregated
  block body, three-element mempool transactions, which Conway transactions
  survive the fork, and the rejection of deposit-less registrations.
- Contradicted: `header-version-info`. The node still emits the ten-field Praos
  header; the CDDL's header is not what ships at the integration revision.
- Ogmios v7.0.0 and Kupo v2.12 connect (V23 verified) and exit at the first
  Dijkstra block.
- gouroboros v0.213.0–v0.213.9 handshake (verified), but require the CDDL
  header and cannot place ordinary Dijkstra transactions: a gap on block
  encoding and era identity. txtop and cardano-node-api are therefore no
  longer bump-ready. cardano-node-api additionally needs adder and its own
  code changed to build on v0.213.x, and gives PlutusV4 scripts the V3 context.
- Boundary evidence can now cite a devnet result; `verified` needs a pass.

Worst status per component: 48 gap, 2 no-evidence, 1 tracked, 8 in-progress,
2 released (the three verified components keep a gap elsewhere). The fix order
unlocks 74 tools across 16 upstream fixes; 2 tools are bump-ready.

Next: db-sync with Postgres, Blockfrost and Koios on a machine with more disk;
the Haskell bump-ready tools; and devnet runs of the codecs whose block support
follows the CDDL header (Pallas main, CML, cardano-js-sdk).

### R4 codec runs (2026-10-22)

Recipe step 9 (`scripts/readiness/devnet/README.md`) chain-syncs the devnet
through Pallas, dumps every raw block, and decodes the blocks and the step-5
transactions with each codec. Four new checks in `devnet.json`:

- `pallas-chain-sync`: no Pallas revision decodes a Dijkstra block. v1.4.0
  and main have no Dijkstra era in traversal; the Dijkstra decoder (PRs #800,
  #817) is on Pallas's `dijkstra` branch, not main as R2 recorded, behind the
  `unstable` feature. Its header requires the CDDL's twelve fields, and the
  node emits ten. That header has been in Pallas's Dijkstra primitives since
  #799, so R2's note that Pallas matched the node's header was wrong.
- `pallas-transactions`: `MultiEraTx::decode` does not detect the
  three-element mempool form in any revision; `decode_for_era(Dijkstra)` on
  the branch reads all seven captured transactions.
- `cml-decoding`: CML 6.2.0 decodes none of 1017 Dijkstra blocks and no
  three-element transaction; it has no Dijkstra branch or pull request.
- `js-sdk-transactions`: `@cardano-sdk/core` 0.47.1 decodes all fifteen
  transactions, re-encodes them byte for byte and reproduces their ids. Only
  plain payments, a deposit registration, a required signer and metadata were
  covered.

R2 now records Pallas era identity and block encoding as `gap`, with no work
toward the node's header; CML and cardano-js-sdk cite their checks without a
status change. Reclassification changed 24 tools that reach Pallas for those
surfaces. The 22 new leads were read at their classified revisions (method
line added to `leads.json`): 9 confirmed (mithril, cncli, dolos, oura,
scrolls, boros, cardaminal, lace-anatomy, mumak) and 13 not-reached (the
tools that name the era themselves or use Pallas for primitives, addresses
and hashing). Pallas enters the fix order at step 7: 17 upstream fixes now
unlock 79 tools; tools with a confirmed gap rise from 102 to 110.

### Current state and handoff (2026-10-21)

The session moves to a machine with more disk. Everything needed is in the
repository except what is listed under "Not carried over".

**Before resuming:** push `hardfork-readiness` from the old machine. Every
commit from `d03d9e2` on, including this handoff, sits on top of
`origin/hardfork-readiness` at `6614088` and exists only locally; without the
push the new machine starts from the pre-R1 state. `AGENTS.md` has an uncommitted change written by `next dev`
(its Next.js agent-rules block); keep or drop it.

**Where things stand**

| Register | File | State |
| --- | --- | --- |
| R1 changes | `content/readiness/dijkstra/changes.json` | 19 changes, 73 citations, all re-verified |
| R2 boundary | `boundary.json` | 61 components, 200 evidence items; gouroboros, Ogmios and Kupo `verified` for V23 only; Pallas now `gap` (2026-10-22) |
| R3 classification | `classification.json` | 269 tools, reclassified after the devnet |
| R3 leads | `leads.json` | 1205 decisions, 0 unreviewed, 0 stale |
| Unlocks | `unlocks.json` | fix order: 17 upstream fixes unlock 79 tools; bump-ready: Marlowe, Marconi |
| Upgrades | `upgrades.json` | 11 readings (8 own-work, 1 prepared, 2 generic) |
| R4 devnet | `devnet.json` | 11 checks, 36 results, 18 failing |

All of these pass `check-changes`, `check-boundary`, `check-leads` and
`check-upgrades` with `--verify-sources`, and `check-devnet`; 148 readiness
tests pass; `/map/dijkstra` and tool pages were checked in a browser.

**Next, in order**

1. Re-run the recipe on the new machine to confirm it reproduces
   (`scripts/readiness/devnet/README.md`, steps 1–8; ~2.5 GB). The node
   artifact is IOG Hydra build 15172667 for `34ae34db`; if 11.2 is tagged by
   then, compare its revision with `changes.json`'s `target` first.
   Done 2026-10-22: all eight steps reproduce on the new machine — the same 7
   checks, 28 results and 12 failures, with identical error messages and
   decoder offsets; only slots and hashes differ. 11.2 was still untagged.
2. Service layer (needs ~10 GB more): cardano-db-sync with Postgres against the
   devnet, then Blockfrost RYO and Koios on top of it. Ogmios v7.0.0 and Kupo
   v2.12 already fail at the first Dijkstra block; record each as a check in
   `devnet.json` and cite it from `boundary.json` (kind `devnet`).
3. Codecs that follow the CDDL header: Pallas main (and cncli, Oura, Dolos
   through it), CML, cardano-js-sdk. gouroboros shows that following the CDDL
   header breaks against the node, so each needs a decode run of the node's
   first Dijkstra block (`probe first-blocks` writes it as hex).
   Done 2026-10-22; see [R4 codec runs](#r4-codec-runs-2026-10-22).
4. The two bump-ready Haskell tools, Marlowe and Marconi, built against
   cardano-api 11.8.0.0.
5. Remaining R2 work: hosted API providers (owner), weekly re-observation.
6. R5 outreach is the owner's alone: prepare material, never contact
   maintainers or open issues.

**Not carried over**

- The devnet chain, downloaded binaries and Go caches (session temp
  directory); `start.sh` recreates a devnet from scratch.
- The scratch scripts that generated `leads.json` and the earlier R2 batches.
  The registers are the source of truth: edit them directly, then run
  `classify-surfaces --reclassify`, `unlocks` and the `check-*` commands
  (see `docs/READINESS-OPERATIONS.md`). Lead decision rules are recorded in
  `leads.json`'s `method`, boundary rules in `boundary.json`'s `method`.
- Readiness clones under `.readiness/` (649 MB, git-ignored): reclassification
  reuses its scan cache, so a fresh machine re-fetches each tool at its
  recorded revision on the first `classify-surfaces --reclassify`.

### Implementation log

- Planning baseline: documented features, assumptions, architecture, phased acceptance criteria, and manual review assignments. Existing invitation-script edits are outside this work.
- Inventory and graph foundation: all 269 catalog entries have coverage records; the first run discovered source revisions/manifests for 226 entries. Website/organization-only entries and failed lookups remain explicit gaps. Ecosystem detection covers nested workspaces, including unsupported build systems.
- Native pilot: imported pinned npm locks for Ouroboros Miniprotocols TS and Mesh, and executed locked, platform-filtered Cargo metadata for Oura and Dolos. Mesh exercises a monorepo root. Package artifacts are shared while occurrence edges retain consumer/profile context. npm lock coverage is deliberately partial because it does not establish an installed platform selection.
- Cabal plan import was initially fixture-tested; the real Atlas Haskell pilot is now recorded in the continuation below. Other ecosystems are detected and queued rather than treated as resolved.
- Evidence storage decision: retain content-addressed compressed JSON evidence in `data/readiness/evidence/`, alongside the normalized snapshot. Local resumable state and source checkouts live in ignored `.readiness/`. This initial implementation uses repository retention rather than an external artifact store.
- Foundation verification: 10 behavior tests cover closure/context separation, workspace links, missing dependencies, cycles, diamond paths, evidence replay, optional/build/test scope, and suggested reach. Type checking and scoped lint pass. CLI `replay` reconstructs native graph records from retained inputs.
- Review and refresh milestone: packet export, pinned source capture, checked JSON citations, transactional result import, decision history, and stale-input rejection are implemented. The Oura discovery packet is prepared locally. Manual review findings remain pending until returned; no review service is invoked.
- Discovery now normalizes GitHub URLs and records repository redirects as identity questions. A follow-up run discovers 227 tools; 42 retain unresolved source/discovery coverage. Original catalog references are preserved.
- Operations: a single-writer lock protects snapshot updates. The weekly read-only workflow refreshes discovery, validates/replays retained evidence, and uploads a review artifact with a comparison. Native-profile refresh is still explicitly invoked. `docs/READINESS-OPERATIONS.md` documents the commands and current adapter boundaries.
- Verification expanded to 15 passing behavior tests, including citation rejection, stale packets, suggestion promotion, idempotent review import, and writer exclusion. Catalog-wide native resolution, capability classification, and returned manual integration reviews remain open work within phase 3.
- Dashboard milestone: `/map/readiness/` and 269 statically generated tool pages expose coverage, next actions, release/configuration graphs, evidence references, scope-specific reach, version-grouped project reach, snapshot comparisons, and filtered/tool JSON exports. Unknown compatibility remains explicit throughout.
- Browser verification: Chromium desktop/mobile checks passed for filtering, empty results, profile selection, impact paths, version grouping, work queue navigation, dependency expansion, exports, base-path links, horizontal layout, and console errors. Light/dark screenshots were inspected. The static build passes both at root and with `/devx-updates` as the base path.
- Verification now includes 16 passing behavior tests. New/changed readiness code passes lint and type checking. Repository-wide lint reports 12 pre-existing errors and one warning in the map table, graph, site header, and Markdown renderer. Collection checkouts are excluded from project lint/type checking.
- Review corrections: incomplete Cargo resolution-node sets now produce partial coverage; feature-optional and renamed/library-target dependencies retain their conditions; required exposure suppresses optional exposure only within the same profile. Real native profiles were rebuilt from retained inputs and replayed after the corrections.
- Evidence and review hardening: native output/configuration roles and collection request keys are explicit, operational gaps have stable codes, and the website and review packets share one subgraph selector. Pending packets whose evidence context changes are marked for revalidation. Native rebuild refuses to overwrite manual graph decisions.
- Recurring native refresh now runs registered npm/Cargo requests after source discovery. Cargo cache keys include compiler versions and configuration/environment fingerprints; unchanged requests were verified to reuse all four pilot results. Failures retain evidence and are surfaced without stopping other profile attempts. Source discovery checkpoints its queue and writes the shared snapshot atomically at batch completion.
- Final local verification uses the repository's locked dependencies, including Next.js 16.3.4: 23 behavior tests pass, type checking and scoped lint pass, all four native profiles replay identically, and 471 retained evidence objects validate. The production static build exports 311 routes with the `/devx-updates` base path. Desktop/mobile browser flows and console checks pass on the locked version.

### Standards review

No documented-standard breaches were found. Three maintainability findings were addressed: explicit evidence roles/collection identity, stable operational gap codes, and shared tool-subgraph selection. Follow-up review confirmed all three refinements.

### Specification review

Three correctness findings were fixed and regression-tested: missing Cargo resolution nodes, feature-optional dependency classification, and cross-profile exposure precedence. Follow-up review found no new blocking correctness issues in those fixes. Broader coverage gaps remain tracked below.

### Active continuation: expanded native collection

- [x] Recover interrupted pnpm, Go, and uv work; validate retained snapshot and replay the five existing native profiles, including Gouroboros.
- [x] Finish adapter edge cases, evidence/cache handling, expanded collection candidates, and recurring toolchain setup.
- [x] Verify pnpm and uv against real pinned catalog sources and expand the registered native profiles.
- [x] Regenerate coverage/impact/comparison reports, review implementation, and commit verified milestones locally.

Recovery checkpoint: the six new adapter tests and TypeScript checks pass. The interrupted snapshot contains 269 tools, five profiles, and 476 valid retained evidence objects. Go 1.26.8 and uv 0.12.22 are available; Cabal is still unavailable. This continuation implements the offline collection and retained-data boundaries in ADR-1 and ADR-2.

Expanded collector milestone: pnpm v9, Go package/test graphs, and uv JSON trees now share evidence-checked collection registration and refresh. Candidate discovery includes nested workspaces. Nine focused tests cover peer contexts, aliases, nested source identity, replacements, test scope, extras, missing selections, and cache evidence. Type checking and readiness lint pass. Real OpShin and Lucid Evolution collections succeeded; all seven registered profiles reuse cached evidence and replay identically. Report regeneration and final review follow in the next checkpoint.

Review checkpoint: specification review identified cross-manager npm identity splits, nested local-package collisions, non-retryable Go loading failures, incomplete Go environment cache keys, corrupt evidence surviving recollection, and machine-local paths in collection identity. Standards review identified missing retained command diagnostics; maintainability feedback also covered checkout duplication and repeated request fields. Corrections and regression checks are in progress before evidence publication.

Review correction checkpoint: public npm registry tarballs now share identities across npm/pnpm; custom registries and nested local sources remain distinct. Go retries incomplete package graphs, fingerprints effective persisted configuration, and records execution diagnostics. Recollection rejects corrupt retained bytes explicitly. New Go/uv output normalizes checkout/toolchain/cache paths before retention, and failure diagnostics remain inspectable as evidence. Cargo now shares pinned checkout handling, and collection request fields share a type. All 12 focused tests, TypeScript, and readiness lint pass. Historical profiles retain their original evidence; collector upgrades create new versioned inputs.

Execution checkpoints: keep collection runs bounded to selected profiles, save each successful profile immediately, run validation separately from long report/build steps, and commit each verified milestone. Record any timeout as an unfinished check and retry that step alone rather than restarting the pipeline.

Recovery verification (2026-10-18): the interrupted run's retained data validates and all 10 historical native profiles replay identically. The snapshot accounts for 269 tools, seven tools with profiles, 516 evidence objects, 7,392 occurrences, and 32,328 edges. Pinned Lucid Evolution/pnpm and OpShin/uv collections are retained alongside the upgraded Go inputs; historical profiles remain available. Coverage, impact, project reach, and comparison reports were regenerated. All tools remain hardfork-unassessed; 262 tools still need native profiles.

### Active continuation: bounded execution and verification

- [x] Recover, validate, replay, and save the expanded native-data checkpoint.
- [x] Add selected-tool/limited native refresh with visible per-request progress and bounded toolchain probes.
- [x] Remove repeated graph work from reporting/replay; verify on the expanded snapshot.
- [x] Run focused checks, the full readiness suite, static build, and standards/spec review; record results and commit locally.

Execution note: the sandbox blocks the `tsx` CLI's IPC socket. Use `node --import tsx scripts/readiness/cli.ts ...` for local checks; on this Node 24 environment, `node --import tsx --test --test-isolation=none lib/readiness/*.test.ts` reports the individual behavior tests without subprocess isolation. Run each expensive check separately under a timeout with a kill grace period; this avoids restarting completed collection work after a stalled check.

Bounded execution checkpoint (ADR-1/ADR-2): native refresh now accepts `--tools` and `--limit`, validates selection before collecting, deduplicates historical requests, and logs each request before it starts. Toolchain probes have 30-second limits; timed-out external commands are force-killed. Reporting reuses one impact calculation, and replay indexes retained records instead of repeatedly scanning the graph. All 36 behavior tests, TypeScript, and readiness lint pass. A selected Mesh refresh reused exactly one cached request; all 10 historical profiles replay identically. Regenerated coverage/impact/project reports are byte-for-byte unchanged. The comparison baseline is the last pre-recovery commit (`167603f`). The production build passes and exports 311 routes with `/devx-updates` as the base path; generated Lucid Evolution, OpShin, and Gouroboros pages retain base-path links and unassessed status.

Review completion: independent standards review found no actionable issues; specification review found no blocking issues and reran the focused collection tests. One nonblocking validation limitation remains: the new tests exercise bounded selection and failure continuation, but do not simulate a native command being force-killed at its timeout. Local milestone commits: `bc2258d` retains the expanded native evidence; `fab2e0f` implements bounded refresh and streamlined verification. Nothing was pushed. The continuation checklist is complete; catalog rollout and target-specific testing remain open below.

### Remaining rollout work

- Complete phase 3 coverage: expand beyond the npm/Cargo pilot, run a real Cabal plan, add adapters for the detected unsupported ecosystems, and return manual integration/capability reviews. These are visible coverage gaps, not passing assessments.
- Extend registered profiles as supported release/platform/feature policies are verified. Registered npm, pnpm, Cargo, Go, and uv requests refresh automatically; custom imported profiles require their ecosystem collector or explicit reimport. Start subsequent collection work with `candidates --tools ...`, select pinned manifests and configurations, and commit validated batches. Publication remains a separate reviewed change.
- Phase 6 remains gated on hardfork-specific change analysis and the target test environment.

### Active continuation: catalog collection batches

- [x] Add a persisted native work queue for explicitly selected, revision-pinned requests, including retryable failures and interrupted jobs (section 6.4; ADR-1/ADR-2).
- [x] Verify production roots and configurations for a small catalog batch, collect supported sources, and retain explicit gaps for unsupported inputs.
- [x] Validate/replay retained evidence, regenerate reports and comparison, run tests/build and implementation review, and commit milestones locally.

Initial candidate inspection: Helios, Minswap SDK, Cardano Peer Connect, Weld, and Dingo have supported manifest candidates. Package names, lock formats, and release scope must be checked before requests are admitted. Helios currently has default-branch evidence only; Weld's discovered release belongs to a monorepo plugin, so neither may be presented as a verified stable package release. Cabal/GHC are still unavailable; a real Cabal pilot remains open.

Batch implementation checkpoint: `collect-batch` persists pending/running/succeeded/failed/deferred jobs in `data/readiness/collection-queue.json`. Requests include immutable revisions; changed discovery defers them for renewed source review. Successful jobs require retained profile evidence before reuse, interrupted work resumes, and pending work precedes retries so repeated failures cannot starve a limited batch. Eight focused batch/cache tests, TypeScript, and readiness lint pass. The five requests in `content/readiness/catalog-batch.json` now have checked pinned package identities and supported lock formats; source/release/configuration caveats are documented alongside them. Real collection and final review follow.

Collection/review checkpoint: Cardano Peer Connect, Helios, Minswap SDK, and Weld were captured in two bounded batches; each saved its profile before the next request. Dingo runs separately. Specification review found that outstanding selected failures could be hidden by a later limited invocation; summary counts now reflect all selected failed jobs and keep pending jobs separate. The regression test covers that exact sequence. Standards review's shared-cache-policy refinement is implemented: native cache hits and batch resumption use the same evidence-retention and Go completeness checks. Eight focused tests and TypeScript pass after these corrections.

Expanded catalog checkpoint: all five selected requests succeeded, including Dingo with Go 1.26.8. The snapshot now has 12 tools with profiles (up from seven), 15 historical profiles, 539 verified evidence objects, 12,404 occurrences, and 70,029 edges. All 15 profiles replay identically; rerunning the completed batch attempts zero requests. All 39 behavior tests, TypeScript, and readiness lint pass. Coverage, impact, project, and comparison reports are regenerated against `933f819`. Follow-up standards/specification reviews confirm both findings resolved. The production build passes and exports 311 routes at `/devx-updates`; pinned roots and queue/profile references were independently checked for all five tools. All 269 tools remain hardfork-unassessed and 257 still have no native profile. Implementation checkpoints `b78c42f` and `859f769` remain local; the verified data is committed separately.

Next rollout priority: the normalized snapshot is now approximately 79.9 MiB for 12 covered tools. Before another large collection batch, compact or partition normalized storage while preserving reviewability, semantic identity, evidence replay, and static-site access. Keep this separate from the successfully verified collector work; do not silently prune historical profiles or dependencies to reduce size. Cabal collection, unsupported ecosystems, and returned integration/capability reviews remain open.

### Active continuation: partitioned snapshot storage

- [x] Measure storage and select a representation that preserves the canonical graph.
- [x] Implement readable, checksum-verified graph chunks with shared evidence lists, atomic manifest publication, and legacy snapshot loading.
- [x] Support self-contained snapshot export, comparisons against legacy/partitioned files and Git revisions, and CI baselines.
- [x] Migrate the retained snapshot, prove identical semantic digest/reports/review inputs, validate/replay/build, review, and commit locally.

Storage measurement: compact JSON alone is 67.9 MiB; repeated evidence lists account for approximately 36.5 MiB across edges and occurrences, with only 15 distinct lists. The chosen ADR-1/ADR-2 implementation keeps ordinary JSON, moves artifacts/occurrences/edges into content-addressed chunks, and interns evidence lists within each chunk. Profile-local graph partitioning avoids rewriting unrelated historical profiles. The existing in-memory schema and semantic digest remain unchanged. Immutable chunks are written before the atomic manifest replacement; no automatic pruning of old chunks or evidence is included.

Storage implementation checkpoint: new saves emit an atomic `snapshot.json` manifest and JSON chunks capped at 2 MiB. Legacy files remain readable; exports reconstruct self-contained graphs; Git comparisons pin one commit before reading the manifest and chunks. CI now exports its comparison baseline rather than copying only the manifest. Four focused storage tests pass, covering graph/report/review identity, manual decisions, non-aliased evidence lists, deterministic bounded chunks, unchanged unrelated profile chunks, checksum/path/count/index rejection, missing files, and prior-manifest recovery after failed writes. TypeScript and readiness lint pass. Migration and real-data equivalence checks follow.

Migration checkpoint: retained snapshot storage shrank from 79.9 MiB to 32.2 MiB (59.7% less), including a 1.13 MiB manifest and 55 chunks; the largest chunk is 1.76 MiB. No records or historical profiles were removed. The semantic digest and full exported graph, including timestamps, are unchanged; review packet IDs match for all 12 profiled tools. All 539 evidence objects validate, all 15 profiles replay identically, and all 43 behavior tests pass. Coverage/impact/project/comparison reports and review/batch queues are byte-for-byte unchanged. Git comparisons against both the prior monolithic checkpoint and the committed partitioned form show zero changes; a second compaction produces no file changes. Independent standards/specification reviews found no actionable issues. The production static build passes and exports all 311 routes with `/devx-updates` as the base path. Implementation `5fab9f5` and migration `546c09d` are committed locally; nothing was pushed.

Next: resume phase-3 coverage in small, explicitly selected catalog batches using the new storage. Keep failed native requests retryable and record source/release caveats. A real Cabal pilot still requires a suitable Cabal/GHC environment; unsupported ecosystems and manually returned integration/capability findings remain the other open coverage tracks. Compatibility testing remains gated on a selected hardfork target and environment.

### Active continuation: higher-level workflow coverage

Priority agreed with the owner: start subsequent batches with higher-level SDKs,
transaction builders, wallets, wallet integrations, and applications. Select roots
by user-facing workflow relevance, gaps in existing workflow coverage, and
evidence of downstream exposure. Collector support is a feasibility check or
tie-breaker, not the primary ranking. Do not substitute documentation, examples,
or test manifests for a tool's production root just because they are supported.

Collect each consumer's selected dependency closure so shared lower-level
components and actual selected versions emerge from consumer evidence. Use
verified reach to prioritize subsequent upstream investigation; retain separately
built services, hosted providers, native bundles, and unsupported production
ecosystems as explicit integration or resolution gaps. Catalog usage hints alone
do not establish adoption or verified reach. Aiken and Amaru remain useful roots,
but their available collectors do not put them ahead of missing user workflows.

- [x] Verify a small batch of higher-level production roots and pinned configurations; document workflow rationale and release caveats.
- [x] Collect the selected requests in bounded runs, preserving retryable failures and evidence for unresolved boundaries.
- [x] Validate/replay retained inputs, regenerate reports/comparison, run checks and review, and commit the verified milestone locally (ADR-1/ADR-2).

Selected batch: Lace mobile, GovTool frontend, Evolution SDK, Hydra SDK's core/
transaction/bridge packages, and Dexter. `content/readiness/workflow-batch.json`
pins the requests; its companion README records workflow rationale, exact package
versions, and release/configuration caveats. Large Lace/GovTool locks required
immutable GitHub blob retrieval. Lace also exposed unnamed npm workspaces: new,
versioned captures resolve unique package-link names while historical inputs keep
their original replay behavior. Missing/ambiguous identities remain gaps. Focused
checks pass; retained-data validation and review follow collection.

Collection checkpoint: all five selected tools succeeded in bounded batches. The
snapshot now contains 17 tools with profiles, 20 historical profiles, 594 verified
evidence objects, 26,612 occurrences, and 107,684 edges. All 20 profiles replay
identically. A completed-batch rerun attempts zero requests; all five registered
native refreshes reuse their retained captures. Thirteen additional pinned source
files support explicit release and workflow-boundary notes. Every new profile is
partial and source-reconstructed; all 269 tools remain hardfork-unassessed and
252 tools still have no native profile.

Verification checkpoint: all 47 behavior tests, TypeScript, and readiness lint
pass. Reports and comparison are regenerated against pre-batch commit `0cd5670`:
five profiles, 8,847 artifacts and 37,655 edges added, with no historical graph
records removed or changed. Independent standards review found no actionable
issues; specification review checked both implementation and retained source/root
identities and found no blocking issues. Implementation checkpoint `0d7274b` is
local. Active snapshot storage is 52.9 MiB; never-committed intermediate chunks
were moved into ignored local recovery state while all manifest-referenced and
previously committed chunks were retained.

Static export checkpoint: `NEXT_PUBLIC_BASE_PATH=/devx-updates npm run build --
--webpack` passes and exports 311 routes. Generated pages for all five new tools
contain their selected roots, explicit scope gaps, current snapshot digest,
unassessed status, and base-path links; dashboard totals/comparison match the
retained snapshot. Default Turbopack builds failed because the execution environment
denied the compiler worker's local port, including after an elevated retry. The
documented Webpack option verified the static export; no build/deployment
configuration was changed. This is an environment-specific default-build
validation limitation, not a successful Turbopack check. No new browser interaction
check was run for this data/collector-only change. Verified milestone is committed
locally; nothing was pushed.

Next: continue selecting higher-level workflow gaps, including unsupported
production ecosystems, and prepare evidence for owner-launched integration and
capability reviews of the collected consumers. Use their observed shared upstream
dependencies to prioritize investigation. Cabal/GHC collection and the selected
hardfork target/environment remain separate open prerequisites.

### Active continuation: Yarn-based wallet and SDK workflows

The next coverage boundary is Yarn production inputs: AdaLite (web wallet),
Daedalus (full-node desktop wallet), TyphonJS (wallet transaction SDK), Cometa
(SDK with native/WASM bindings), and Cardano Web3 (provider-backed SDK). Source
inspection found Classic v1 locks and modern metadata versions 8/10. This batch
implements offline collection and retained evidence under ADR-1/ADR-2; it does
not install consumer dependencies or execute project build scripts.

- [x] Add evidence-backed Classic/modern Yarn capture, normalization, candidates, and recurring registration with explicit unsupported inputs.
- [x] Verify and attempt the five pinned production requests in bounded batches; retain failures and source/release/native/service boundary gaps.
- [x] Validate/replay evidence, regenerate reports/comparison, check static export, review, and commit locally.

Lock records will be treated as declared dependency selections. Peer bindings,
hoisting, installed-platform pruning, patches and shipped artifact correspondence
remain unresolved unless separately evidenced. Modern Yarn cache checksums are
not npm tarball integrity hashes. Unknown lock versions and ambiguous selections
must fail or remain explicit gaps rather than becoming guessed verified edges.

Source checkpoint: official Yarn parsers are pinned for Classic and modern input.
AdaLite's configuration requires the modern parser's own YAML semantics; after
parsing, its lock is rejected because `js-tokens@npm:4.0.0` declares version
`0.0.0-use.local`. This is a retained, retryable source-data failure, not a
successful profile. Corrected source and renewed revision review are required.
Other selected consumers continue independently.

Collection/review checkpoint: Daedalus, TyphonJS, Cometa and Cardano Web3 now
have partial source profiles; AdaLite remains failed and retryable. Four registered
refreshes reuse retained evidence; rerunning those four completed requests attempts
zero collections. Fourteen additional pinned source files and authored scope
records document the lock conflict, release mappings and native/service boundaries.
The first TyphonJS capture remains historical alongside its official-parser capture.
Specification review found a stale workspace manifest could disagree with its
locked selection; conflicting or absent workspace selections now produce gaps
without inferred edges, with a regression test. Neither real TyphonJS capture had
this mismatch. Standards review's optional parser-provenance refinement is also
implemented: cache context and toolchain labels share the exact package pins.

Verification checkpoint: all 55 behavior tests, TypeScript and readiness lint pass.
All 25 native profiles replay identically and 644 retained evidence objects validate.
Coverage grows from 17 to 21 tools with profiles; 248 tools still have no profile.
The snapshot contains 33,747 occurrences and 122,672 edges. Reports/comparison
are regenerated against `214c7fc`: five historical profiles, 3,636 artifacts and
14,988 edges added, with no historical graph records removed or changed. All 269
tools remain hardfork-unassessed. Follow-up standards and specification reviews
confirm the fixes and retained source/root identities, with no remaining findings.
Implementation commits `6c72716` and `ad6f5ce` are local. Active snapshot storage
is 61.4 MiB; never-committed intermediate chunks and unreferenced failed-import
blobs were moved into ignored recovery state. All manifest-referenced evidence,
graph chunks and previously committed files remain retained.

Static export checkpoint: `NEXT_PUBLIC_BASE_PATH=/devx-updates npm run build --
--webpack` passes with 311 routes. The five affected tool pages contain the current
digest, unassessed status, explicit scope gaps, production roots or AdaLite's
failure, and base-path links. Dashboard snapshot/comparison identifiers match.
This uses the documented Webpack fallback for the execution environment's
previously observed Turbopack port restriction; it is not a new successful
Turbopack or browser-interaction check. Verified data and plan are committed
locally; nothing was pushed.

Next: continue prioritizing higher-level workflow gaps and prepare collected
consumer evidence for owner-launched integration/capability reviews. Daedalus's
Nix/native binaries and Cometa's bundled WASM are visible follow-up boundaries.
AdaLite needs corrected source and renewed pin review before another meaningful
collection attempt. Target-specific compatibility testing remains separately gated.

### Active continuation: capability review workflow

The next milestone closes the gap between package coverage and the higher-level
behaviors needed for later hardfork analysis (sections 6.3, 7 and 8). Implement
structured capability findings across manual import, evidence/decision history,
reports, filters and tool details. This follows ADR-1/ADR-2: collection and review
remain offline, with the site reading retained data at build time.

- [x] Add profile-scoped capability findings, checked source citations, explicit verification decisions, history, stale-source handling and replayable storage.
- [x] Expose capability findings and filters in static reports, tool pages, snapshot comparisons and JSON exports.
- [x] Prepare pinned source packets for Lace mobile, GovTool frontend, TyphonJS and Cometa; retain pending owner-launched reviews without inventing findings.
- [x] Validate behavior, review implementation, check static export/browser flows, and commit the milestone locally.

Capability vocabulary covers transaction construction, serialization, script
compilation/evaluation, synchronization/decoding, query, submission, signing,
wallet integration and governance. Findings default to suggested; exact citations
do not establish semantic truth. Only explicit evidence decisions verify claims.
Coverage stays partial, historical profiles retain their source identity, and
readiness stays unassessed. Target-specific compatibility remains out of scope.

Implementation checkpoint: structured capability findings require a native profile
and checked source citation at that profile's revision. Scope and conditions form
part of their identity; suggested/verified/disputed/rejected states retain explicit
decision history. Changed source is labeled historical rather than carrying claims
forward. Import remains transactional and idempotent; retained submissions replay
from their original packet state. Native rebuild refuses to discard capability
decisions. Existing snapshots without capability fields retain their digest.

Handoff checkpoint: four version-2 packets for Lace mobile, GovTool frontend,
TyphonJS and Cometa are pending. Thirteen additional source files are retained at
their exact revisions. `content/readiness/capability-reviews.json` records packet,
profile and evidence IDs; its companion Markdown provides scope questions and
offline regeneration commands. No manual discovery/challenge review was launched
and no capability claims were imported. Version-1 packets require re-export;
their old context is retained for history.

Verification checkpoint: all 59 readiness tests pass; TypeScript and scoped lint
pass. All 25 native profiles replay identically, and 657 evidence objects validate.
The new retained-submission replay test verifies capability import independently
from native graph replay. Reports and comparison against `e736e14` contain zero
artifact/edge/profile/capability changes: this milestone adds the review workflow
and its source evidence, not compatibility conclusions. Coverage remains 21 tools
with profiles, 248 without profiles, and all 269 hardfork-unassessed. Standards
review's named-index clarification and specification review's rejection of string
`"null"` conditions are fixed and confirmed. Implementation commits `a423d44` and
`5ef5e06` remain local.

Static/browser checkpoint: the `/devx-updates` production export passes with 311
routes using the documented Webpack fallback. Chromium checks pass against the
real static pages and isolated populated capability fixtures: desktop/mobile
filters, verification/source/scope distinctions, filtered downloads, decision
history, evidence anchors, pending-review empty states, base-path navigation,
document overflow and console errors. Screenshots were inspected. Fixture claims
were never inserted into retained catalog data. The real four consumer pages show
unassessed status, current snapshot identity and no returned capability findings.
Verified evidence, packet index, reports and handoff are committed locally; nothing
was pushed. Default Turbopack remains subject to the previously recorded local
port restriction and was not revalidated in this milestone.

Next: the owner can launch the prepared discovery/challenge reviews using
`content/readiness/capability-reviews.md`. Checked returned results can now enter
the pipeline as structured behavior findings and integration edges. Catalog-wide
collection, Cabal/native-artifact boundaries and the hardfork target/environment
remain separate open work; phase 3 is not complete merely because this workflow is.

### Additional wallet and contract workflow coverage

Continue the agreed higher-level priority with Nami, Yoroi mobile, Veridian
Wallet, Marlowe TS SDK and Cardano Connect with Wallet. The pinned requests in
`content/readiness/wallet-batch.json` select application and SDK production roots;
source/release caveats are in the adjacent README. This implements ADR-1's offline
collection boundary and ADR-2's retained, auditable data.

- [x] Inspect pinned manifests and lockfiles; preserve release/version differences.
- [x] Add explicit npm workspace paths to distinguish same-named package roots,
  including retained requests, cache identity, refresh and replay inputs.
- [x] Write `docs/RUN-PREPARED-REVIEWS.md` with copy-paste discovery/challenge
  prompts, exact packet/output paths and checked-import instructions for the owner.
- [x] Collect the five bounded requests and retain source-backed scope gaps.
- [x] Validate, replay, regenerate reports, review and verify the static export.

Selection tests cover duplicated names, excluded orchestration roots, complete
lock retention, invalid/partial selectors, and cache/refresh preservation. Old
captures without explicit paths retain their existing interpretation and identity.
The four prepared capability reviews remain pending for the owner to launch.

Collection checkpoint: all five requests succeeded. Coverage rises from 21 to 26
tools, with 30 historical profiles, 710 validated evidence objects, 41,988
occurrences and 140,823 edges. The selected roots match their explicit paths;
Cardano Connect with Wallet excludes the same-named orchestration root. Retained
source captures and scope notes preserve Nami/Yoroi/connector manifest-lock
version differences, Marlowe prerelease identity, and native/service boundaries.
All 269 tools remain hardfork-unassessed; 243 still have no native profile.

Verification checkpoint: all 62 behavior tests, TypeScript and readiness lint
pass. All 30 historical profiles replay identically. Rerunning the completed
batch attempts zero requests; selected native refresh reuses exactly five cached
profiles with their explicit paths. The four prepared capability packet IDs are
unchanged and pending. Implementation standards/specification reviews found no
actionable issues, including in the requested LLM review guide. Coverage, impact,
project and comparison reports are regenerated against baseline `ba025aa`.

Final data review confirms all earlier graph records and collection jobs remain
unchanged. The comparison adds five profiles and 18,151 edges without removing
historical profiles or edges. Both review axes found no actionable issues. The
33 new source captures and five scope notes match their pinned revisions; unused,
never-committed intermediate chunks were moved to ignored recovery storage.

Static export checkpoint: the `/devx-updates` production build with `--webpack`
passes and exports 311 routes. The sandboxed attempt failed while Next.js parsed
its TypeScript subprocess output; the same build succeeded outside the sandbox.
Generated pages for all five consumers show exactly the selected roots and locked
versions, current snapshot digest, source-backed gaps, base-path navigation and
unassessed readiness. No browser interaction changes were made or re-tested.
Default Turbopack was not revalidated. Implementation `f874f90` and the verified
data milestone remain local; nothing was pushed.

Next: use [Run the prepared reviews](./RUN-PREPARED-REVIEWS.md) to assign discovery
and independent challenge for Lace, GovTool, TyphonJS and Cometa. Import checked
results through the existing evidence-decision workflow. Continue higher-level
coverage batches alongside the remaining native-artifact/Cabal gaps; compatibility
testing still requires a selected hardfork target and environment.

### Cardano JS SDK and application integration coverage

The next batch centers on Cardano JS SDK's wallet, transaction-construction,
dApp-connector and governance workspaces. Its pinned Yarn 3.2.1 lock uses metadata
v6, so extend the existing native parser boundary to that format. Blockfrost JS,
GeniusYield Lucid SDK, Epora and NEWM's wallet connector add complementary
provider, DEX and application workflows. Exact roots/revisions live in
`content/readiness/sdk-batch.json`; the adjacent README records selection rationale
and release/configuration limits. This continues ADR-1/ADR-2's offline, retained
evidence model. Consumer builds, plugins and manual review tasks are not executed.

- [x] Inspect pinned production roots and add Yarn metadata-v6 support with
  regression coverage for bare ranges, workspace aliases, scope, conditions,
  unknown peers, checksums and stale declarations.
- [x] Collect all five selected consumers in bounded batches and retain source
  evidence for release, native-artifact, service and deployment gaps.
- [x] Validate/replay, verify cache reuse, regenerate reports, review the changes
  and check the production static export.

The selected Cardano SDK package versions differ from the hardware-ledger tag;
NEWM's manifest and lock root also differ. Keep those identities distinct. Yarn
v6 support does not resolve installed peer bindings or prove a published artifact.
The four prepared capability reviews remain pending. Higher-level unsupported
Blaze/Bun and PyCardano/Poetry roots remain priority work after this batch.

Collection checkpoint: all five requests succeeded, adding 6,411 occurrences and
13,398 edges. Coverage rises from 26 to 31 tools, with 35 historical profiles and
790 retained evidence records; 238 tools still have no native profile. Cardano JS
SDK selects four production roots while retaining all 22 workspaces. NEWM retains
lock version 1.5.4 alongside manifest 1.5.5. Source-backed scope notes cover all
five consumers; no capability findings or hardfork assessments were imported.

Execution recovery: the first Cardano JS SDK attempt exhausted local disk space
before its source checkout and evidence writes completed. Reproducible production
build output/cache and clean pinned source caches were cleared; interrupted,
unreferenced writes and checkout files were preserved in ignored recovery storage.
The original request succeeded on its second attempt. Retained diagnostic evidence
and the queue record preserve this interruption; no canonical evidence or Git
history was removed. Source caches were cleared after verification to leave room
for the final build.

Verification checkpoint: all 63 behavior tests, TypeScript and readiness lint
pass. All 35 profiles replay identically and all 790 evidence records validate.
The completed batch attempts zero requests on rerun; native refresh reuses exactly
five profiles. Both implementation and retained-data review axes found no
actionable issues. Historical records are unchanged, and the four prepared review
packet IDs remain unchanged and pending. Coverage, impact, project and comparison
reports are regenerated against `321abcd`; the comparison adds five profiles,
3,474 artifacts and 13,398 edges without changing or removing earlier graph records.

Static export checkpoint: `NEXT_PUBLIC_BASE_PATH=/devx-updates npm run build --
--webpack` passes outside the sandbox and exports all 311 routes. Generated pages
for all five consumers show their exact selected roots/versions, source-backed
scope gaps, current snapshot identity, base-path navigation and unassessed status.
No UI interaction changes were made or re-tested; default Turbopack was not
revalidated. The verified `out/` export is retained; disposable production build
intermediates were cleared afterward to restore disk headroom. Implementation
`2746cf1`, evidence, reports and the completed plan remain local; nothing was pushed.

Next: prioritize unsupported higher-level production roots such as Blaze/Bun and
PyCardano/Poetry, including their complete package-manager inputs. Do not substitute
their nested native/test/example projects for whole-tool coverage. The prepared
discovery/challenge reviews remain available to the owner through
[Run the prepared reviews](./RUN-PREPARED-REVIEWS.md); target-specific compatibility
testing still awaits a selected hardfork target and environment.

### Blaze/Bun and PyCardano/Poetry production SDK coverage

This milestone implements the next higher-level priority under ADR-1/ADR-2.
Read complete committed package-manager inputs and select Blaze SDK, tx, wallet
and query workspaces plus PyCardano's root library. Retain all lock entries;
separate development/example projects from production roots. Never infer
installed artifacts or hardfork compatibility from dependency collection.

- [x] Inspect pinned sources and implement Bun text-v1 and Poetry lock-2.1
  collection, including native Poetry freshness/source/constraint checks.
- [x] Collect the two pinned requests in `content/readiness/lock-sdk-batch.json`,
  recording release, platform, native-artifact and integration scope gaps.
- [x] Validate/replay, verify cache reuse, regenerate reports, review and build.

The Bun reader checks workspace declarations and follows nested package keys.
The Poetry reader runs isolated pinned tooling without invoking consumer code;
legacy manifests and registry packages are its initial supported boundary.
Unsupported formats/sources fail explicitly. Prepared capability reviews remain
owner-launched; this milestone does not import review findings.

Collection checkpoint: both requests succeeded. Blaze selects SDK 0.3.3, tx
0.15.4, wallet 0.6.3 and query 0.6.4 while retaining all 21 locked workspaces:
613 occurrences and 1,126 edges. Its original retained repository tree was
reclassified to recognize `bun.lock`, without changing the pinned revision.
PyCardano 0.19.2 retains all 95 locked package records across main/dev/docs groups:
129 occurrences including the root and 165 edges. Source-backed scope notes
preserve the blueprint-tag/SDK release distinction, separate Rust/WASM artifacts,
chain backend configuration and PyCardano's CBOR environment selection.

Review correction checkpoint: specification review found development selections
could leak into production reach through Poetry groups or Bun duplicate dependency
declarations. Poetry now uses separate occurrences per locked group and rejects
cross-group edges, including transitive relationships. Bun follows native
`dev → optional → prod → peer` precedence and records shadowed declarations as
gaps. Regression tests cover both cases. Follow-up review confirms both resolved;
standards review found no actionable issues. Implementation checkpoints `7ff8e26`
and `c130ebe` remain local.

Verification checkpoint: all 70 behavior tests pass, including the installed
native Poetry reader (zero skipped tests). TypeScript and scoped lint pass.
All 37 profiles replay identically and all 832 evidence records validate. The
completed batch attempts zero requests; refresh reuses both profiles. The readiness
workflow provisions the isolated Poetry reader before its tests and recurring
refresh; no consumer dependency installation/build or plugin execution is added.
Coverage rises from 31 to 33 tools, leaving 236 without native profiles; the
snapshot contains 49,141 occurrences and 155,512 edges. All 269 tools remain
hardfork-unassessed. Four prepared capability review packets remain unchanged
and pending. Reports are regenerated against `97814ed`: 264 artifacts, 1,291 edges
and two profiles added, with no prior graph records changed or removed.

Static export checkpoint: `NEXT_PUBLIC_BASE_PATH=/devx-updates npm run build --
--webpack` passes outside the sandbox and exports all 311 routes. Both generated
SDK pages show exact production roots/versions, source-backed scope notes, the
current snapshot digest, base-path links and unassessed status. Final specification
and standards reviews found no remaining issues. No UI interactions were changed
or re-tested; default Turbopack was not revalidated. The verified `out/` export is
retained; disposable production server/cache intermediates were cleared afterward
for disk headroom, preserving `.next/dev` and all canonical data/history.
Sixteen never-committed intermediate chunks were moved into ignored recovery
storage. Code, evidence and reports are committed locally; nothing was pushed.

Next: inspect SundaeSwap's pinned production inputs for reuse of Bun support,
and advance Lucid Evolution's existing production profile into review. Owner
priority correction: original Lucid (`spacebudz/lucid`) is excluded from active
readiness work; prioritize Lucid Evolution (`Anastasia-Labs/lucid-evolution`).
Retain the existing catalog/history, but do not build a Lucid/Deno collector. Keep production
package selection distinct from nested native/test/example projects. The owner
can assign the four prepared capability reviews using
[Run the prepared reviews](./RUN-PREPARED-REVIEWS.md). Target-specific compatibility
testing still needs a selected hardfork target and environment.


### SundaeSwap collection and Lucid Evolution review preparation

Continue ADR-1/ADR-2's offline retained-evidence pipeline for maintained
higher-level consumers. SundaeSwap's text-v1 Bun lock uses config-version 0.
Lucid Evolution already has a native pnpm production profile; prepare source
and an owner-run review packet rather than duplicating its package collection.

- [x] Support Bun config-version 0 and attempt the pinned SundaeSwap production
  SDK collection. Retain its inputs and retryable failure when manifests differ.
- [x] Retain production entry points and native/provider boundaries for
  SundaeSwap and Lucid Evolution; prepare Lucid Evolution's pending review packet
  and update the LLM review handoff. SundaeSwap needs aligned native inputs first. Do not launch these consumer review tasks.
- [x] Validate/replay, verify cache reuse and packet reproduction, regenerate
  reports, review the milestone and verify the static export.

Original Lucid is not part of this milestone or the active collection priority.
No capability claims or hardfork compatibility assessments are imported.

Collection boundary checkpoint: config-version 0 is supported without changing
previous Bun profile identities or relaxing stale-input checks. SundaeSwap's
pinned core 3.2.0 release fails native collection: core's math range is `^0.5.0`
in the lock versus `^0.5.1` in the manifest, and gummiworm's core range is `^3.0.0`
versus `^3.2.0`, each in runtime and development declarations. Eleven source files
include all eight workspace manifests, lock, configuration and README. The four
mismatches and failed/retryable request are retained after one attempt. No
SundaeSwap profile was created. An aligned upstream revision and a new pinned
request are needed; do not rewrite its source lock to manufacture coverage.

Lucid Evolution handoff checkpoint: retained 118 production source files spanning
transaction building, signing/submission, providers, wallets and local support
packages, plus release/native scope notes. The new task-brief-v2 packet selects
existing profile `82ef3bc2a8877a35a7fe4310` for new findings and keeps both native
profiles as history. Its source is Lucid Evolution 0.8.3 at the core-types 0.5.2
repository tag; published provenance, configured services and conditional CML/UPLC
WASM variants remain unverified. Five packets are now prepared; the four earlier
packet IDs are unchanged and pending. The handoff and LLM review guide include
Lucid Evolution paths and questions. No consumer review tasks were launched.

Verification checkpoint: all 71 behavior tests pass with zero skips; TypeScript
and scoped lint pass. All 37 profiles replay identically, all 958 retained evidence
records validate, and the complete new review packet reproduces byte-for-byte
across 145 files offline. Existing Blaze and Lucid Evolution requests reuse their
cached profiles. Coverage remains 33 tools with 37 profiles; this milestone does
not inflate native coverage for the rejected SundaeSwap lock.

Report and review checkpoint: comparison against `6c7a442` shows no added,
removed or changed artifacts, edges, profiles or capability findings. Only Lucid
Evolution and SundaeSwap coverage records changed. Independent specification and
standards reviews found no actionable issues; all prior evidence records and
the four earlier packet entries remain unchanged. Two unreferenced intermediate
files from the rejected collection are preserved in ignored recovery storage.

Static export checkpoint: the production webpack build passes for all 311 routes
with `/devx-updates` as the base path. Generated Lucid Evolution and SundaeSwap
pages show the current snapshot digest, expected profile state and explicit
source/integration gaps; both remain hardfork-unassessed with no capability
findings. No UI behavior changed, so browser interactions were not re-tested;
default Turbopack was not revalidated. The verified `out/` export is retained.
Reproducible inactive source checkouts and production build caches were cleared
for disk headroom; canonical history, active review sources and `.next/dev` are
preserved. Bun support is committed locally as `9e191de`; this evidence and
handoff milestone is also committed locally. Nothing was pushed.

Next priority: the owner can assign Lucid Evolution alongside the other four
prepared reviews using [Run the prepared reviews](./RUN-PREPARED-REVIEWS.md), then
validate and import the returned findings and decisions. SundaeSwap collection
needs an upstream revision with aligned manifests and lock input. Continue
prioritizing maintained higher-level consumers; original Lucid and a Lucid/Deno
collector remain excluded. Hardfork compatibility still needs a selected target
and test environment.


### Active continuation: payment service and application coverage

Under ADR-1/ADR-2, inspect Masumi's payment service and Sokosumi's application
as the next higher-level workflow batch. Select production roots from their
pinned source, keeping contract builds, external services and deployment identity
explicit. Original Lucid remains excluded. Existing owner-run review packets
remain pending; this collection work does not launch their reviews.

- [x] Inspect pinned manifests, lock inputs and production wiring; record root
  selection and release caveats in a bounded collection request.
- [x] Collect the selected profiles and retain supporting source and explicit
  unresolved integration boundaries.
- [x] Validate/replay, verify cache reuse, regenerate reports and comparison,
  review and verify the static export, then commit locally.

Collection checkpoint: both requests in `content/readiness/payment-app-batch.json`
succeeded. Masumi selects backend and admin frontend manifests 0.1.0 on pinned
default-branch source; Sokosumi selects web 0.1.0 and an unversioned Core API at
the `macos-v1.1.1` repository tag. Neither source establishes a deployed release.
Coverage is now 35 tools with 39 historical profiles and 1,023 evidence objects.
The two graphs add 3,620 occurrences and 8,835 edges. Scope evidence retains 26
Masumi and 20 Sokosumi source/configuration files, with explicit contract,
container, native/WASM, generated-client and deployed-service boundaries.

Collector checkpoint: pnpm's optional environment document is retained separately
from the project graph; its configuration/package-manager closure remains an
explicit toolchain frontier. Hash-only patch records resolve their files through
workspace configuration. Unknown layouts fail rather than producing an empty
application graph. Single-document identities remain unchanged. Masumi's actual
`lucid-cardano` dependency remains evidence, while original Lucid is excluded
from standalone work. No verified Sokosumi-to-Masumi service edge is inferred.

Verification checkpoint: all 75 tests pass with zero skips, TypeScript and scoped
lint pass, 1,023 evidence objects validate, and all 39 profiles replay identically.
Masumi, Sokosumi and Lucid Evolution reuse cached native profiles. The existing
five owner-run capability packets remain pending; this milestone imports no
capability claims or hardfork assessments.

Review and comparison checkpoint: independent standards and specification reviews
found no actionable issues. All 46 scope files match their pinned source bytes,
all three patch files are retained, and Sokosumi's 15 environment snapshots stay
outside its application graph. Comparison against `d56e202` adds 1,310 artifacts,
8,835 edges and two profiles, with zero removed or changed historical graph
records and no capability changes. Only the two selected coverage records change.
All five prepared packet IDs remain current and pending. Sixteen untracked
intermediate chunk files are preserved in ignored recovery storage.

Storage checkpoint: the first static build compiled and generated all 311 pages
but exhausted disk space while copying the export. The incomplete export was
removed; clean reproducible source checkouts were cleared, and 284 ignored
recovery files were losslessly gzip-compressed after byte-for-byte verification.
The recovery archive index records original paths and SHA-256 hashes. Canonical
evidence/history, prepared packets and `.next/dev` remain intact. Only the static
build needed retrying; passed tests, replay and reviews remained valid.

Completion checkpoint: the production webpack build retry passes for all 311
routes at `/devx-updates`. Generated Masumi and Sokosumi pages show the current
snapshot digest, exact selected roots (including unknown Core version), scope
gaps and unassessed status. The completed compiler cache was cleared before
export to leave disk headroom; afterward disposable production output was
cleared while preserving the verified `out/` and `.next/dev`. No UI behavior
changed, so browser interactions were not re-tested; default Turbopack was not
revalidated. The verified implementation and evidence are committed locally;
nothing was pushed.

Next: prepare workflow-specific source packets for the collected payment
application roots, preserving the distinction between Sokosumi's configured
clients and an identified Masumi deployment. The owner can run the existing five
reviews independently using [Run the prepared reviews](./RUN-PREPARED-REVIEWS.md).
SundaeSwap still needs aligned upstream lock inputs. Original Lucid remains
excluded from standalone work, and target-specific compatibility needs a selected
hardfork environment.

### Active continuation: payment workflow review packets and inventory retention

Continue sections 6.3, 7 and 8 under ADR-1/ADR-2 by preparing Masumi and
Sokosumi's collected production roots for owner-launched review. Preserve existing
review decisions through recurring inventory before accepting returned findings.

- [x] Reproduce and fix inventory refresh dropping capability findings and their
  decision history; verify unchanged and changed catalogs through the CLI.
- [x] Retain pinned workflow sources and export Masumi/Sokosumi packets with
  explicit production, configuration, native-artifact and deployment boundaries.
- [x] Extend the review index, scope questions and copy-paste owner instructions;
  keep all five earlier packet IDs unchanged and all seven reviews pending.
- [x] Validate/replay evidence, reproduce complete packets, regenerate comparison,
  review the milestone, verify static output and commit locally.

Implementation checkpoint: the inventory regression failed before the fix and
passes after it. All 76 readiness tests pass with zero skips; TypeScript and
scoped lint pass. Thirty-seven additional pinned source files cover Masumi's
backend/admin wiring, V1/V2 purchase signing/submission, provider/cost-model
helpers and L2 boundary, plus Sokosumi's web/Core job and payment-client paths.
The packets index 54 Masumi and 40 Sokosumi source/configuration files including
previously retained inputs. Source preparation does not identify a deployed
Masumi endpoint or import capability claims.

Evidence checkpoint: all 1,062 retained evidence objects validate and all 39
native profiles replay identically. Both new packets reproduce byte-for-byte
across 116 files; all 94 indexed source files match the immutable Git blob IDs
in their pinned repository trees. Earlier evidence, graph chunks, profiles,
collection requests and decisions are unchanged. All 39 new evidence blobs are
referenced. Comparison against `3e54e36` changes only Masumi/Sokosumi coverage
records, with no added, removed or changed artifacts, edges, profiles or
capabilities. Coverage remains 35 tools with profiles, 234 without profiles and
all 269 hardfork-unassessed. Standards and specification reviews independently
found no actionable issues. Inventory retention is committed locally as `0d80bb9`.

Static verification checkpoint: the webpack build first failed in Google Fonts
URL parsing; a retry compiled, type-checked and generated all 311 pages, then
exhausted disk while copying the export. After clearing incomplete/redundant
generated output, the pinned Next.js export stage completed with the build's
App Router-only configuration. An initial export-stage recovery attempt omitted
that flag and failed on the absent Pages Router `_document`; the corrected
attempt succeeded. All 310 exported prerender routes and their RSC payloads match
the completed production files byte-for-byte (Next omits `_global-error`), with
404 and `.nojekyll` verified. Both payment pages show the expected roots, current
digest, scope gaps, base-path links and unassessed status. This is a recovered
static export, not a fresh uninterrupted build. No UI interactions changed or
were re-tested; Turbopack was not revalidated. The verified `out/` and `.next/dev`
are retained; disposable production server/cache output was cleared for space.

Next: the owner has selected **Dijkstra** and the tagged, not-yet-released
**cardano-node 11.2** source as the hardfork authority. Verify and pin the exact
tag/commit before change-to-capability analysis. Baseline, transition and
post-fork environment configuration remain unspecified. All seven prepared
consumer reviews remain owner-launched and pending. Continue catalog/native
artifact coverage alongside target analysis; original Lucid remains excluded
from standalone work. This verified milestone remains local; nothing was pushed.


### Active continuation: replay of admitted review findings

Close the section 7 / phase 5 reproducibility gap under ADR-1/ADR-2. The existing
replay command checked native records only, and accepted submissions lacked their
original packet context. That was insufficient to reconstruct admitted manual
relationships, capability findings, decision history or review-created gaps.

- [x] Archive checked packet context with explicit submission/evidence references
  and preserve those references through inventory and snapshot storage.
- [x] Reconstruct native and manual graph records offline, order review decisions
  by their prior inputs, and reject missing, altered or unexplained graph records.
- [x] Check review-created gaps, coverage changes and tool evidence links; surface
  legacy submissions without archived context as an explicit replay limitation.
- [x] Verify focused/full tests, retained catalog replay and unchanged prepared
  packets; review and commit the implementation locally.

Focused checks cover chained and independent reviews, empty/gap-only results,
historical findings across a later native release, altered graph/decision/coverage
records, missing archives, and unproven records inserted into an archived context.
The CLI regression proves altered manual verification now fails replay, even when
native records still match. No consumer review was launched or imported into the
catalog; Dijkstra source-pin clarification remains pending independently.

Verification checkpoint: all 82 readiness tests pass, including CLI subprocess
and native Poetry checks; TypeScript and readiness lint pass. The retained catalog
replays all 39 native profiles and validates all 1,062 evidence objects. No real
manual submissions have returned. All seven pending packet identities and the
catalog semantic digest remain unchanged. No framework or canonical data changed,
so this checkpoint retains the previously verified static export without claiming
a new build or browser run.

Standards review: the contribution fields now share one per-tool record; no
remaining findings. Specification review caught overlapping packet scopes where
findings affect different tools. Replay now reconstructs each review from its
validated causal predecessors and merges only changed records, preventing later
independent work from contaminating or being overwritten by older contexts. A
regression covers both receipt orders; follow-up review found no remaining issue.
This milestone implements section 7 / phase 5 under ADR-1/ADR-2. Catalog coverage,
owner-launched consumer reviews and target-specific testing remain open.

### Active continuation: investigation queue and work ownership

Implement sections 4.4 and 8 and the phase-4/5 work-item requirements under
ADR-1/ADR-2. Existing coverage and reach views did not provide prioritized
component investigations or explicit ownership of unresolved work.

- [x] Derive component tasks with visible capability/reach/uncertainty factors,
  exact-root attribution, version-specific consumer paths and next actions.
- [x] Add validated optional owner/issue assignments for coverage and component
  tasks, retaining unmatched assignments for reconciliation.
- [x] Export queues through `report` and expose filters, paths and assignments in
  the static readiness explorer, without modifying readiness evidence.
- [x] Verify behavior tests, real report generation, static build and desktop/
  mobile browser flows; complete standards/specification review and commit.

The initial assignment file is empty: no owner or maintainer agreement has been
invented. No consumer review is launched by queue generation, and source fixes,
compatibility findings, issue creation and outreach remain separate work.

Verification checkpoint: all 87 readiness tests pass; TypeScript and readiness
lint pass. Real report generation retains 1,803 coverage gaps and produces 14,295
component investigations, including 217 collected-root groups that previously
had no project entry. All 14,078 existing project reach/path records are unchanged.
Every stored task/path reference resolves; the queue references `projects.json`
instead of duplicating its full paths. The work report is approximately 20.9 MB.
Canonical evidence, native profiles, capability findings and all seven pending
review packet IDs remain unchanged.

The production static build exports all 311 routes with `/devx-updates`. An
earlier worker was killed during concurrent verification; rerunning the build
alone succeeded. Chromium checks pass on the real export and a clearly isolated
populated fixture: search, ownership/capability filters, issue links, consumer
paths, retained unmatched assignments, downloads, empty results, pagination,
base-path links, desktop/mobile layout and browser-console checks. Fixture setup
errors were corrected before those passes; no synthetic results entered catalog
data.

Standards review's ranking-order duplication was resolved with a shared typed
factor order. Specification review found that components with no downstream
consumers were absent; collected roots now retain their tasks, exact profile
evidence and uncertainty at zero reach. Both follow-up reviews have zero remaining
findings. Broader catalog collection, owner-launched consumer reviews and Dijkstra
target-specific assessment remain unfinished.

### Active continuation: real Haskell dependency pilot

Atlas v0.14.1 (`62e37abda859cdd7e8814e7d07f963c29e4f2833`) now has a native
Cabal source reconstruction for its `atlas-cardano` library on x86_64 Linux.
A disposable worker supplied the Atlas-pinned GHC 9.6.6 and BLST 0.3.13, with
Cabal 3.12.1.0 and Debian system libraries. The first solve failed for missing
libsodium development metadata; installing real system libraries allowed the
unchanged project constraints to resolve. No fake package metadata or constraint
relaxation was used. This closes the fixture-only Haskell pilot gap, not full
Haskell catalog coverage or release-build correspondence.

The native plan contains 631 units. The versioned importer expands package-level
components into 635 occurrences and 5,930 edges, selecting only the Atlas library
as a root. Test/example siblings stay separate; executable and custom setup
requirements remain build-scoped. Immutable source overrides, per-component flags,
compiler/platform identity, source hashes and Cabal metadata revisions survive
normalization. Missing/ambiguous targets remain visible gaps; malformed dependency
lists fail import. Historical bare plans preserve their original replay behavior.

Retained evidence includes the untouched plan, exact project/package/Nix inputs,
three override commits and manifests, command and worker recipe, compiler/package
and system-library versions, signed repository metadata/cache hashes, successful
resolver log and prior failure. The project retains its Hackage
`2025-04-15T19:49:23Z` and CHaP `2025-04-11T16:42:25Z` index states. Repository
index archives themselves are not vendored. Graph replay is offline; a fresh solve
still needs repositories and the toolchain. No Atlas compilation, linking, runtime
or Dijkstra compatibility test has run. The Debian reconstruction is not the full
Nix release environment; foreign/native and shipped-artifact boundaries remain
partial. This implements the offline evidence/reporting boundaries of ADR-1 and
ADR-2.

Validation: 93 readiness tests, TypeScript and scoped lint pass. All 40 native
profiles replay identically; 1,064 retained evidence objects validate. Reports now
cover 36 of 269 tools with native profiles; Atlas adds 526 distinct artifacts and
one profile with no removed or changed prior graph records. The seven pending
consumer review packets remain unchanged. Standards and specification reviews
found no actionable findings.

The production static export passed all 311 routes with `/devx-updates` as the
base path. Chromium checks passed for the Atlas library root, dependency expansion,
scope filtering, graph download, base-path navigation, mobile layout and console
errors. Cabal remains a documented import-only workflow; executable collection registration and broader Haskell profiles remain
follow-up work. Owner-launched consumer reviews and the Dijkstra immutable target
and environment decisions remain independent open tracks.

### Active continuation: explain snapshot changes

An audit of section 4.5 found that the original comparison exposed ID/count deltas
but did not explain version or downstream-reach changes. Comparison schema 2 adds
before/after tool coverage and source observations, profile context changes,
recorded version sets and exact-artifact reach changes for every exposure scope.
Equal counts with different consumers remain visible. Each added/removed consumer
has a witness from the appropriate snapshot: release/profile, labeled occurrences,
actual edge sequence and retained evidence references. Parallel edges are selected
using the same exposure rules as reach calculation, so suggested evidence cannot
explain a verified count.

Version inventories include selected roots and reachable dependencies across all
retained profiles, excluding unrelated native-plan entries. Source namespaces and
fork distinctions match existing impact grouping. Observations describe recorded
changes without assuming deployment or upgrade: an additional version may coexist
with historical selections, and an input digest alone cannot distinguish an
adapter update from changed inputs or evidence correction.

The static comparison view provides search, exposure/relationship-type filtering,
pagination and full/filtered exports. Relationship records preserve before/after
endpoints, types, conditions and citations even when reach is unchanged. Removed-side evidence travels with the comparison rather
than relying on current graph records. Older comparison formats must be regenerated;
stale comparisons remain hidden. ADR-1 and ADR-2 continue to apply: all analysis is
performed from retained snapshots and the website needs no runtime service.

Validation: all 101 readiness tests, TypeScript and scoped lint pass. The full
current impact projection remains identical after sharing exposure rules. The
retained Atlas comparison has one changed tool, 488 changed recorded-version
groups, 487 artifacts with changed reach (514 exposure rows), and 5,930 added
relationship records. The canonical snapshot digest remains unchanged.

Standards review found no issues. Specification review found two issues, both
fixed and regression-tested: unchanged reach previously hid integration record
details, and newly cataloged unresolved tools could falsely report a source change.
Follow-up review found no remaining actionable issues. The static export passed
all 311 routes with `/devx-updates` as the base path. Chromium passed controlled
fixtures and the real snapshot for all four views, search/type/scope filters,
pagination, corrected and removed-side evidence, full/filtered exports, base-path
links, mobile layout and console errors. Light/dark/mobile screenshots were checked.

The detailed comparison is about 13 MB uncompressed, and the complete dashboard
HTML is about 112 MiB because it embeds the existing graph reports plus comparison
data. A subsequent performance slice should load committed report data on demand
without losing coverage, evidence, paths or offline static hosting. Broader native
coverage, owner-launched consumer reviews and Dijkstra assessment remain open.

### Active continuation: load website reports on demand

The dashboard now keeps tool coverage and the complete catalog denominator in its
initial HTML, while loading other reports only when their tabs open. Comparison
loads when expanded. Impact and project indexes share 32 static path files;
expanding a component fetches its file, and filtered exports hydrate every selected
path before downloading. Queue, investigation and capability records retain their
existing filters, ranking, ownership and exports. No evidence or collection state
has changed.

Static GET routes enumerate content-addressed report files at build time, using
only committed inputs (ADR-1/ADR-2). Filenames reflect report contents, including
assignment and comparison changes independent of the graph digest. Browser requests
respect the deployment base path (ADR-11), share in-flight/successful results,
check response identity, and allow retries after HTTP, parse or identity failures.
Missing files remain visible errors rather than empty successful reports. Export
requests use at most four concurrent path fetches and fail without a partial
download. Deploy report files with the matching HTML; older pages may need reloading
after deployment.

Measured initial HTML fell from 117,422,087 to 1,006,206 bytes (99.1% smaller).
The largest path file is 2,568,930 bytes. Investigation and comparison still load
whole report files on selection (about 16.3 MB and 10.0 MB uncompressed respectively);
their pagination limits rendering, not transfer. Further partitioning can target
those views if needed without changing retained graph semantics.

Validation: all 106 readiness tests, TypeScript and scoped lint pass. Static
export passed all 349 routes with `/devx-updates`. Chromium verified initial
coverage without report requests; all report views, filters and pagination;
on-demand consumer paths; full-path filtered exports; unavailable/mismatched file
recovery; failed-export atomicity and retry; base-path links; mobile layout and
light/dark presentation. No page errors occurred. Exported JSON reconstructs all
21,490 impact rows and 14,783 project rows, including every path, identically to
the retained reports. Work and comparison payloads also match exactly. Standards
and specification reviews found no actionable findings.

The canonical snapshot digest remains
`413d3e3de47bdffc067d91fdec95be12776ab967fd8b9f67fc019959ea338cb6`.
Broader native collection, owner-launched consumer reviews and the Dijkstra source
pin/test environments remain open; this performance work is not a compatibility
assessment.

### Active continuation: deterministic integration leads

Phase 3 now includes an offline lexical scan of source captures attached to tools
and native profiles. `scan-integrations` accepts selected tools or the full catalog;
the regular `report` command refreshes `data/readiness/integration-scan.json`.
Versioned rules flag service calls/URLs, protocol and wallet markers, bundled or
vendored references, generators, downloads and container build inputs. Each lead
has an exact retained quote and file/line/column citation and remains `needs-review`.
No relationship, capability, runtime scope or compatibility claim is admitted.

The scan binds eligible files to the tool's current repository/revision and lists
historical, foreign/unbound, native-lock, binary and limit-excluded captures.
Per-tool and per-file bounds are explicit; uncaptured source is always an unresolved
frontier. All tool scans remain partial, including tools without source or matches.
Source bytes and inspection are reused across roots sharing exact evidence within
a run. Ordering and identifiers are deterministic, and corrupt or missing attached
evidence fails the command. This extends source inspection under ADR-1/ADR-2 without
network access or project execution.

New packet exports include a derived `integration-scan.json` navigation aid over
the packet's existing inputs. Original source remains the citation authority.
Creating this aid changes neither packet identity nor pending/accepted review
state, and does not launch either owner-controlled review pass.

The retained catalog report accounts for all 269 tools: 414 eligible source files
for 32 tools produced 896 lexical leads (698 service, 148 protocol, 33 build,
10 download, five generator and two bundled references). Another 33 source captures
are native locks and four lack a current repository binding; 237 tools have no
eligible captured source in this scan. Documentation and comments occur among the
leads, intentionally without promotion to production behavior. Representative
source leads include Lucid Evolution's metadata fetch and Masumi's service client.

Validation: 110 readiness tests pass, including exact citations, current/historical
source binding, explicit limits, shared input reuse, corrupt evidence and unchanged
packet identity. TypeScript and scoped lint pass. All 896 real quotes and locations
validate; a repeated scan reproduces the report. Existing graph records, coverage,
impact, work reports and all ten manual packet contexts are unchanged. Standards
and specification reviews found no actionable findings. Broader source capture,
native coverage, owner-run review decisions and Dijkstra assessment remain open.

### Active continuation: enterprise and API application coverage

The next phase-3 batch selects ODATANO's core service, Cardano MCP and Blockfrost
RYO from immutable source revisions in `content/readiness/application-batch.json`.
Their npm/Yarn source reconstructions add 3,014 occurrences and 5,674 edges:
965/1,782 for ODATANO, 1,245/2,485 for Cardano MCP and 804/1,407 for RYO.
Native coverage is now 39 of 269 tools across 43 profiles, with 56,410 occurrences,
175,951 edges and 1,126 retained evidence objects. All three profiles remain partial;
no consumer installation, build, deployment or compatibility test ran.

ODATANO's source tag/manifest is 1.9.0 while the selected npm lock root remains
1.7.10. Dependency declarations agree; the discrepancy is retained, not corrected.
Its separate wallet/router applications, generated SAP models, native HSM bindings
and configured chain services remain boundaries. Cardano MCP's 0.1.0 default-branch
source retains external provider/indexer and invoked Aiken/WASM boundaries. RYO
6.8.0 does not identify the hosted Blockfrost deployment; node/db-sync, database
extensions, optional Mithril and built container inventories remain unresolved.

The same inspection retains source for x402-cardano but creates no native profile.
The inspected default branch contains upstream x402 documentation and an EVM/Solana
core manifest. An explicit artifact gap requests the Cardano production branch,
release and entry points; this is not an absence claim about the whole repository.
Four pinned trees, 40 source files and four authored scope records preserve these
choices under ADR-1/ADR-2. The refreshed lexical scan has 456 eligible files across
36 tools and 1,075 leads; none becomes a verified integration or capability.

Validation passes for all 43 profiles and 1,126 evidence objects. Offline replay
reproduces every profile, and rerunning the batch attempts zero completed jobs.
All 110 readiness tests pass. Existing manual review state is unchanged; no
owner-controlled consumer review was launched. A temporary scope-retention helper
hit its execution bound before saving; after its terminal result, the helper was
made linear and resumed successfully without repeating native collection. Only
unreferenced, untracked intermediate chunks were archived in ignored recovery
storage; committed historical evidence remains intact.

All 1,075 lexical quotes and UTF-16 locations match retained current-source bytes.
Standards and specification reviews found no actionable findings. Production
export passes all 349 routes with `/devx-updates` basePath, including TypeScript.
Browser checks pass for all three profiles' exact roots, versions and graph export
counts, their scope gaps, unresolved x402 coverage, navigation, mobile width and
console errors. The build passed when run alone after a worker was killed during
a concurrent optional whole-snapshot scan check; that optional check hit its time
bound and was replaced with a lightweight exact-source citation check. Broader
native coverage, manual review decisions and the exact Dijkstra target/environment
remain open.

### Active continuation: native Gradle SDK graph

The next unsupported higher-level workflow is Bloxbean Cardano Client Lib's Java
SDK, whose production Gradle build must not be replaced with its documentation
Yarn lock. A new `gradle-resolution` import adapter and pinned Gradle 7.5.1 init
script capture native selected-variant dependency graphs. Separate configuration
graphs retain runtime/build/development scopes, shared dependency paths, selected
versions and original requests. Native constraints remain evidence without
creating dependency exposure; unresolved selections remain gaps. Malformed
captures, missing referenced nodes and unbound included-build identities fail
closed. This extends ADR-1/ADR-2's retained-input model without runtime resolution.

The real pilot uses source tag v0.7.3 at
`f1130177b02761ea15b93a92e385ae0739d27096`, selecting `runtimeClasspath` for the
aggregate library, governance and Blockfrost backend. Native capture produced
97 variant occurrences and 247 dependency edges, excluding nine constraint
records from exposure. QuickTx is reached through the aggregate project graph.
Source project group/name identities remain distinct from Maven publication IDs.
External coordinates lack per-module repository provenance and binary checksums,
so identities remain capture-local and coverage remains partial.

The disposable worker used the pinned Gradle 7.5.1/JDK 17.0.5 image, two CPUs,
2 GiB memory, 256-process limit, no capabilities and no publishing credentials or
host home/socket mounts. The source checkout was copied from a read-only mount;
project evaluation ran only the capture task. Its 48-second successful log, image
digest, command, selection, init script and 43 pinned source files are retained.
No SDK compilation, tests or Dijkstra assessment ran. Additional provider/supplier
roots, build/plugin/annotation-processor classpaths, native artifacts, published
JAR provenance and deployed services remain unresolved. The profile is explicitly
import-only; isolated automatic recapture/refresh remains rollout work.

The snapshot now covers 40 of 269 tools across 44 profiles, with 56,507 occurrences,
176,198 edges and 1,171 evidence objects. A real native fixture covers diamonds,
version mediation, platform constraints, main versus test-fixture variants and
separate build/test configurations. The initial 115-test suite, focused lint and
TypeScript pass. Evidence validation and replay pass for all 44 profiles and 1,171
evidence objects. Standards review found no actionable issues. Specification review
identified missing Gradle ecosystem filtering; a shared ecosystem list now connects
discovery, reports and the dashboard. Existing retained Gradle manifests reclassify
15 tools, without claiming new native coverage for the other 14. Cached discovery
results also use current classification. Groovy and Kotlin build/settings files,
version catalogs and wrapper properties are recognized; resolver version support
remains explicitly limited. Follow-up specification review confirms the filter
finding resolved; there are no remaining actionable implementation-review findings.

Final verification: all 116 readiness tests pass, and the production export passes
349 routes with `/devx-updates` basePath. Browser checks verify the SDK's three
roots, exact graph counts, partial/unassessed status, scope gaps and graph export;
Gradle-filtered coverage, impact and investigations, complete exports and paths;
base-path navigation, mobile width and console errors. The browser helper was
corrected to distinguish the three collected roots (zero downstream consumers,
retained root-scope evidence) from components with downstream paths. No product
change was needed for that distinction. All 1,172 lexical citations validate.
Old profiles, evidence, graph chunks and all ten manual-review states are unchanged.
The comparison adds one profile and 247 edges with no changed/removed existing
profiles or capability findings. The temporary task-owned Gradle image was removed
after both workers exited; retained captures, source and worker provenance remain.
Broader coverage, isolated automatic Gradle refresh, owner-run review decisions
and Dijkstra target/environment work remain open.

### Active continuation: managed Gradle collection and refresh

The Java SDK's selected configurations now run through `collect`, pinned
`collect-batch` and registered `refresh-native`. Explicit project/configuration/
scope selections survive registration, deduplication and cache reuse. The CLI
accepts a selection JSON file; candidate discovery identifies build roots rather
than ordinary subprojects. Nested builds require their own settings, and the
native capture checks Gradle's actual root directory before assigning source paths.

The collector uses the retained Gradle 7.5.1/JDK 17.0.5 image digest in a disposable
non-root Docker container: read-only root/source/capture, no host home/socket or
forwarded credentials, dropped capabilities, two CPUs, 2 GiB memory, 256 PIDs,
bounded tmpfs and a six-minute execution limit. Unique containers are removed on
success, failure and client timeout; cleanup errors retain original status and
logs. Invocation evidence records the image, scripts, selection and limits before
execution, and failed-run diagnostics link to it. Successful evidence includes
native environment and source inputs. Cached evidence is verified before checkout
or Docker; changed source, selection or worker context invalidates reuse, including
completed batch jobs. Native resolution failures remain retryable.

`content/readiness/gradle-batch.json` registers the same Cardano Client Lib v0.7.3
roots as the manual pilot. Two managed captures (before and after the reviewed
native root check) each reproduce its 97 occurrences and 247 edges. All three
retained graphs agree; historical profiles are preserved. The obsolete tool-level
manual-refresh gap is removed, while artifact provenance, unselected configurations
and integration boundaries remain open. No SDK build/test or hardfork assessment
has run. The existing scheduled workflow picks up the registered selection.

Coverage stays **40/269 tools**, now **46 profiles**, **1,176 evidence objects**,
**56,701 occurrences** and **176,692 edges**. Snapshot digest:
`b8a2a267a8b3741c81091af76da394ec9b0d6f4d528ce8927cc7330ba0e653df`.
Validation passes and offline replay reproduces all 46 profiles. Batch resume
attempts zero jobs; selected refresh reuses the final capture without Docker.
All previous profiles, capability findings and manual review states are unchanged.
Reports and the comparison against `5194041` are regenerated.

All 118 readiness tests, typechecking and lint pass. Real Docker probes verify
read-only mounts, absent forwarded credentials, native failure, client timeout,
exact-container removal, rejected root relocation and retained failure provenance.
The static export passes 349 routes with `/devx-updates`; browser checks pass for
three profiles, exact graph counts/exports, Gradle coverage/impact/investigation
filters, base-path navigation, mobile width and console errors. Standards review
found no documented violations and one optional duplicated-validator refactor;
spec review's root-identity and failure-provenance findings were fixed and confirmed.
Only the task-downloaded image was removed after all workers terminated. ADR-1 and
ADR-2 remain the persistence/publication model. Broader collection, owner-launched
consumer reviews and the exact Dijkstra source/environment remain open.

### Active continuation: signing consumers and bounded static builds

`content/readiness/signing-batch.json` registers six immutable requests across
three consumers: Cardano HW CLI v1.19.1 (Classic Yarn), Cardano Dev Wallet's
default-branch extension (npm), and Bursa v0.19.0's separate root/UI Go modules,
wallet frontend and connector (npm). The two Go captures use Go 1.26.8,
Linux/amd64, cgo disabled, workspace off and default build tags; complete metadata
does not establish a successful build, signing operation or hardfork result.
The four JavaScript profiles remain partial source reconstructions.

Both Bursa Go graphs preserve native package/test records without loader errors.
The root module selects Gouroboros v0.210.0; the UI separately selects Gouroboros
v0.205.5, Bursa v0.18.1-0.20260926142054-83d794689ded and Dingo v0.70.14. Current
standalone releases do not substitute for these consumer-selected versions.
Dev Wallet and the Bursa connector retain their development-only declarations;
source imports do not silently promote them to verified runtime inventory.

Forty-nine retained source files and artifact/integration gaps describe remaining
boundaries: HW CLI's differing embedded commit field, Trezor postinstall patch,
USB/HID/WASM/firmware and cardano-cli interoperability; Dev Wallet's unverified
browser-store release mapping, generated bundle and external backends; Bursa's
pre-build embedded HTML placeholder, excluded webview/cgo/nftmedia/integration
configurations, hardware/cloud signers and deployed node/database services.
No application installation, signing or compatibility test ran. Original Lucid
remains excluded as a standalone root; existing owner-run reviews are unchanged.

Coverage is now **43/269 tools**, **52 profiles**, **1,251 evidence objects**,
**63,108 occurrences** and **221,065 edges**. Snapshot digest:
`a984bb825fcb94eee1cda6162c87a8d5e30f55351c0e649204361720990bbb20`.
Validation passes, all 52 native profiles replay identically, and resuming the
six-request batch attempts zero jobs. Comparison against `ea7e310` records six
added profiles, no changed/removed profiles and no capability changes. All tools
remain hardfork-unassessed.

The larger snapshot exposed build-host memory pressure: three static workers
ended in SIGKILL at 87/349 pages. A one-worker build completed all 349 routes;
process measurements also found substantial unrelated memory use, so worker
duplication is a mitigated pressure source, not a proven exclusive cause. The
pinned Next.js `experimental.cpus: 1` setting bounds duplicated graph loads
without pruning routes or disabling TypeScript checks (ADR-1/ADR-2). Full export
is the resource regression check; a shallow unit test cannot reproduce OS memory
pressure. Future larger snapshots still require measurement.

The full comparison grew to 117,646,028 bytes. Lossless `changes.json.gz` storage
reduces it to 17,705,494 bytes; decompressed bytes equal the original, and CLI
regeneration produces identical compressed bytes. JSON helpers retain atomic
replacement and plain-file support. The website accepts legacy `changes.json`,
rejects ambiguous dual files and checks the target digest. Scheduled collection
writes compressed output. No relationships, paths, citations or exports are
removed. A regression checks detailed comparison/static-report identity,
deterministic gzip, stale reports, corrupt input and legacy/ambiguous filenames.

All 119 readiness tests and scoped lint pass. Standards and specification reviews
found no actionable issues in either the signing data or implementation changes.
The one-worker export and desktop/mobile browser checks pass for all six signing
profiles, exact graph exports, development scopes, gaps, Go filtering, base-path
links and console errors. The final compressed-input build also exports all 349
routes, and its browser comparison download equals retained JSON byte for byte
(apart from the file's trailing newline).
Broader catalog coverage, owner-launched reviews and the exact Dijkstra target
and baseline/transition/post-fork environment remain open.

### Active continuation: query services and Classic Yarn workspaces

`content/readiness/query-service-batch.json` adds AdaStat's separately locked
backend and frontend at immutable default-branch source, and Cardano GraphQL
9.1.0's production server and API/background workspaces. All three profiles
remain partial source reconstructions. Forty-four additional retained source
files describe unverified build/deployment, database, external-service and
native/WASM boundaries; no service or capability finding is promoted.

The Classic Yarn collector now captures native workspace membership and local
range selections using pinned Yarn 1.22.22, offline, without lifecycle scripts,
project/user rc files or delegated Yarn binaries. Captured manifests establish
names, versions and dependency scope. Mismatched workspace ranges use external
lock selections; ambiguous selections and potentially applicable resolution
overrides remain explicit gaps. An unnamed orchestration root is retained as
source without inventing a package identity. Every requested root must match.
Collector context v2 invalidates obsolete batch cache entries while historical
captures retain their original replay behavior (ADR-1/ADR-2).

Coverage is now **45/269 tools**, **55 profiles**, **1,319 evidence objects**,
**65,779 occurrences** and **226,077 edges**. Snapshot digest:
`d19a7de8cf3452647caedc1b4a444545815f3979f9979f7a257ac432f3bc19ad`.
Seven profiles have complete native resolution within their declared scope;
48 are partial. All tools remain hardfork-unassessed. Comparison against
`5902019` adds three profiles, 991 artifacts and 5,012 edges, with no historical
records removed or changed and no capability changes.

All 123 readiness tests, TypeScript and scoped lint pass. Validation checks all
retained evidence, and all 55 native profiles replay identically. A completed
batch rerun attempts zero jobs; registered GraphQL refresh reuses its capture.
Native-data checks verify production roots, six GraphQL child workspaces and
five local dependency edges with manifest scopes. Standards review found no
actionable issues; specification review identified the unnamed-root case, which
was corrected and regression-tested, with no remaining findings. Static export
passes for all 349 routes with the `/devx-updates` base path. Chromium checks
pass for all three profiles, production roots, exact graph downloads, gaps,
npm filtering, mobile layout, base-path navigation and console errors. The full
comparison download equals retained JSON byte for byte apart from its trailing
newline. Untracked intermediate graph chunks were compressed into ignored local
recovery storage; all current references and historical committed data remain.

The owner requested a pause at this commit. Further consumer inspection is only
ignored local preparation: Masumi Registry Service, Buildooor and Cardano Wallet
Interface source manifests have been inspected, but no requests or data for that
next batch have been admitted. Owner-run reviews and Phase 6 remain open.

## 1. Objective

Identify tools that may stop working after the next Cardano hardfork early enough to help their maintainers ship fixes. Explain each finding, identify the upstream components involved, and prioritize work that benefits the greatest number of affected tools.

The first deliverable is an evidence-backed, release-aware dependency and integration graph for every tool in this repository's catalog. Investigation of node 11.2 changes and compatibility testing follows later.

The governing rule is: **unknown is actionable work, never an implicit pass.**

Success means:

- Every cataloged tool has a coverage record, including tools that cannot be resolved.
- Dependency traversal is reproducible for a declared release and configuration.
- Shared artifacts are inspected once where their identity and context permit reuse.
- Every relationship has evidence, a scope, and a verification status.
- Maintainers can see which downstream tools depend on their components.
- Later readiness findings explain the affected capability, dependency path, and available remedy.

## 2. Starting point and scope

`data/cardano-graph.json` is the seed inventory. Its current metadata reports 269 tools and 248 relationships. These figures are a starting snapshot, not a permanent denominator. Each run records the exact catalog revision and computes its own counts.

The catalog includes repository, package, release, team, and relationship information. Treat these as discovery hints until verified. Existing relationships include `depends`, `backend`, `connects`, `compiles`, and `successor`; they do not all represent dependencies. In particular, succession must not contribute to dependency reach.

The existing `/map/table` and `/map/analysis` pages are natural entry points for future coverage and impact views.

### Initial scope

- Account for every cataloged tool, including archived, experimental, and source-unavailable tools.
- Discover its distribution artifacts, source revisions, package ecosystems, and maintainers.
- Resolve package dependencies and investigate service, protocol, build, and bundled dependencies.
- Record chain-facing capabilities without yet judging their compatibility with node 11.2.
- Produce coverage reports, dependency paths, reverse-dependency counts, and investigation queues.
- Provide written tasks and evidence packets for manually launched LLM discovery and review where deterministic extraction is insufficient.

### Later scope

- Map the target hardfork's changes to capabilities and components.
- Test a baseline, the upgrade transition, and post-fork operation.
- Track confirmed incompatibilities, fixes, released upgrades, and downstream retesting.

### Boundaries

- The initial catalog is the set of tools being assessed, not a claim to cover the entire ecosystem.
- Newly discovered dependencies enter the graph even if they are absent from the catalog. Promoting them to cataloged tools is a separate curation decision.
- A complete package resolution is not proof of complete integration discovery or hardfork compatibility.
- The project does not need a runtime graph database or live website backend for its first implementation.

## 3. Assumptions and decisions to confirm

| Topic | Proposed default | Consequence or open question |
|---|---|---|
| Release scope | Assess the latest stable release at snapshot time | Add older supported or widely deployed versions explicitly; confirm which ones matter with maintainers |
| Prospective fixes | Track development revisions and release candidates separately | A source fix does not mean users have an installable fix |
| Source of truth | Published artifacts and release build evidence, when available | A repository checkout or newly generated lockfile may differ from what shipped |
| Configuration scope | Start with documented production defaults and supported configurations | Platform, feature, and provider coverage must be explicit; no claim to explore every possible combination |
| Hosted services | Record endpoint/API contract and deployed version when discoverable | Unknown implementation or deployment versions remain coverage gaps |
| Access | Public evidence initially | Unavailable source or private deployment details require a documented gap or maintainer-supplied evidence |
| Tool identity | Preserve catalog IDs; verify repository and package aliases | Repository moves and monorepos must not create duplicate tools or collapse distinct artifacts |
| Refresh | Manual runs first, then scheduled and release-triggered refreshes | Agree on cadence after measuring cost and runtime |
| Maintainer contact | Use verified catalog contact information and corrections | Contact availability and response times are not guaranteed |
| LLM review | The project owner manually launches discovery and challenge passes using written task briefs | The pipeline exports evidence packets and imports results; no LLM API integration or launch orchestration is required |
| Hardfork target | Owner-selected Dijkstra, using cardano-node 11.2 source; bind assessments to an immutable source/build, network configuration and activation conditions | Exact tag/commit confirmation and baseline/transition/post-fork environment are still required; a node version alone does not define the full compatibility target |

Owner selection (2026-10-18): Dijkstra is the target, and the owner identified
the tagged, not-yet-released cardano-node 11.2 source as the authority. Pin
verification remains unresolved: both GitHub's complete tag-reference query and
`git ls-remote --tags https://github.com/IntersectMBO/cardano-node.git '*11.2*' '*dijkstra*'`
returned no matching tag. The official [11.2 release tracker](https://github.com/IntersectMBO/cardano-node/issues/6672)
points to [integration PR #6677](https://github.com/IntersectMBO/cardano-node/pull/6677),
which was open with branch `koslambrou/prepare-11.2` at commit
`34ae34db891105d2d17ad9b2704cb56423103da6` when checked. That commit is a
provisional investigation reference, not a verified release tag or a substituted
assessment target. The exact tag URL/commit has been requested from the owner.
Retain the distinction between owner-selected version, verified immutable input,
and test environment; no compatibility findings are authorized by this selection
alone. Catalog collection and review preparation can continue independently.

Update (2026-10-19): still no 11.2 tag. PR #6736 (`fmaste/prepare-11.2`,
`c2468b05`) targets the #6677 branch and changes only benchmarking/workbench
files; both select CHaP `0f444414` at index-state `2026-10-09T14:30:01Z`. The
HFWG scope for Dijkstra is tracked in issue #6634. R1 binds its change register
to the branch's component versions, not to a node tag.

Do not describe a tool as safe merely because it is inactive, has no resolved package dependencies, or does not connect directly to a node.

## 4. What the product looks like

### 4.1 Coverage dashboard

A table with one row per cataloged tool and drill-down by release/configuration:

- Tool, maintainer, assessed release, and artifact/source identity.
- Package-resolution coverage and integration-review coverage shown separately.
- Supported and assessed configurations, with exclusions and gaps.
- Chain-facing capabilities and providers.
- Direct dependencies and distinct downstream tools.
- Evidence freshness, last successful run, and latest attempted run.
- Next action, owner when assigned, and linked maintainer issue when available.

Filters include ecosystem, maintainer, capability, coverage gap, stale evidence, and impact. The denominator remains the full snapshot inventory, even when a filter hides entries.

### 4.2 Tool detail

Show a dependency-tree view backed by the shared graph. Users can expand package dependencies, switch configurations, inspect integration edges, and open the exact evidence for each relationship.

Display required, optional, build-time, and development dependencies distinctly. Show unresolved frontiers where traversal stopped and explain why. A tool with no dependencies needs supporting evidence, not an empty result from a failed collector.

### 4.3 Upstream impact view

For a component or release, show:

- Distinct cataloged tools that depend on it directly and transitively.
- Required exposure separately from optional or configuration-dependent exposure.
- A dependency path explaining each affected tool's inclusion.
- Version-specific reach and a deduplicated project-level summary.
- Whether the path is verified or contains a suggested relationship.

Provide tables and exports as well as a graph visualization. A large graph alone is not an actionable report.

### 4.4 Work queues

- **Coverage queue:** missing artifacts, unsupported ecosystems, resolution failures, unreviewed integrations, and stale evidence.
- **Investigation queue:** chain-facing components with high reach or material uncertainty.
- **Remediation queue, later:** confirmed failures, affected tools, maintainer issues, available fixes, released versions, and retest requirements.

An upstream finding can be grouped into one maintainer work item with many affected consumers. Preserve consumer-specific upgrade and retest tasks.

### 4.5 Snapshot comparison

Show new or removed dependencies, changed versions, new integration evidence, newly unresolved tools, and reach changes between snapshots. Explain whether a change came from a new release, configuration, collector version, or evidence correction.

## 5. Data model

Keep these concepts separate:

| Entity | Meaning |
|---|---|
| Tool | A user-facing catalog entry with a stable ID |
| Tool release | A particular published release or explicitly selected source revision |
| Artifact | A package, binary, container, source tree, or other identifiable distribution unit |
| Resolution profile | A declared platform, toolchain, feature, workspace, and configuration context |
| Dependency occurrence | An artifact as selected in a particular resolution context |
| Service/interface | A runtime service or protocol contract, potentially with an unknown implementation version |
| Relationship | A directed, typed edge from consumer to dependency or interface |
| Capability | Behavior such as transaction construction, chain decoding, or submission |
| Evidence | A source artifact, file location, command result, documentation excerpt, or maintainer statement |
| Gap | A known unanswered question, failed operation, or unsupported part of the scope |
| Snapshot | An immutable normalized result with catalog revision and collection provenance |
| Assessment, later | A compatibility finding for a release, profile, capability, and target environment |

A tool can have several artifacts; a repository can contain several tools. Package-to-repository and artifact-to-tool mappings are explicit, evidenced associations rather than name matching.

### Identity and reuse

An artifact identity includes ecosystem, canonical package name, version, source, and integrity hash or immutable revision where available. Unknown identity fields must not be replaced with invented precision.

A resolution cache key also includes the relevant root inputs, manifest/lock hashes, workspace configuration, registry/index state, resolver and collector versions, platform, toolchain, feature flags, patches, overrides, and peer bindings.

- Reuse fetching and static artifact inspection by exact artifact identity.
- Reuse resolved outgoing edges only when their relevant resolution inputs match.
- Keep all consumer edges when sharing work.
- Keep different versions, forks, and configurations distinguishable.
- Detect cycles and use strongly connected components where needed for ordering and reach calculations.

### Relationship fields

Record consumer, target, relationship type, dependency scope, condition/profile, declared constraint, resolved selection, and evidence references.

Useful types include package dependency, build/code-generation dependency, service/backend dependency, protocol interaction, and bundled/vendored dependency. Optionality is a separate condition, not a reason to discard an edge. Development/test scope is retained but excluded from production-runtime counts by default.

Relationship verification states:

- `verified`: supported by a native resolution result or checked, applicable source/documentation/maintainer evidence.
- `suggested`: plausible, cited relationship awaiting verification.
- `disputed`: conflicting evidence remains unresolved.
- `rejected`: reviewed and not applicable; retained in the decision history.

Also retain evidence origin and verification method. A numerical confidence score must not substitute for verification.

## 6. Collection and traversal pipeline

```text
Catalog snapshot
  -> release and artifact discovery
  -> manifest, workspace, and configuration discovery
  -> native package resolution
  -> normalized artifact/occurrence graph
  -> integration and capability discovery
  -> optional manually launched two-pass review
  -> evidence verification and gap reconciliation
  -> coverage, impact, and snapshot validation
  -> reviewed published snapshot
```

### 6.1 Discover the assessment roots

Resolve repository redirects and aliases. Identify published releases, artifact digests, source revisions, workspaces, and supported production entry points. Preserve uncertainties between a published release and its presumed source.

Assess each cataloged tool independently as a root. Shared repositories and artifacts can reuse discovery work without losing separate tool coverage records.

### 6.2 Resolve in the consumer's context

Use each ecosystem's native resolver or build plan. A dependency's own repository lockfile describes its development environment, not necessarily the dependencies selected by its consumer.

Extract the root's complete selected package closure. Follow newly discovered integration or separately built artifact boundaries as additional scoped work items. Do not replace a consumer's dependency selection with an independent resolution from an upstream checkout.

| Ecosystem | Expected evidence and important context |
|---|---|
| npm, pnpm, Yarn | Native lock/resolution data, workspace links, peer bindings, optional/platform selection, and package-manager version |
| Rust | `Cargo.lock`, Cargo metadata, selected features/targets, patches, and workspace configuration |
| Haskell | Cabal build plan, compiler/flags, package index state, CHaP or other repositories, source overrides; Stack configuration where applicable |
| Go | Selected module graph, replacements, build tags, and toolchain; `go.sum` alone is not a lockfile |
| Python | Locked resolution or installation report, interpreter/platform, extras, markers, and indexes |
| Nix and containers | Pinned inputs, derivation/build evidence, image digests, and available package inventories; input locks alone do not enumerate every shipped package |
| Other ecosystems | Detect immediately, register a coverage gap, and add collectors according to actual catalog needs |

Distinguish observed release-build resolution from reconstructed source resolution. For missing locks, capture the generated resolution and registry inputs, but do not claim it represents a previously shipped artifact.

Prefer metadata-only operations. When resolution requires running project build logic, use disposable workers without publishing credentials. Capture commands, environment identifiers, exit status, and diagnostics as evidence.

### 6.3 Find non-package dependencies and capabilities

Inspect build scripts, container definitions, CI configuration, source imports and calls, generated bindings, downloaded binaries, documentation, and maintainer evidence.

Look for node interfaces, hosted providers, indexers, wallet integrations, embedded WASM, vendored code, and code generators. Distinguish supported integrations from integrations enabled in a particular deployment.

Record direct implementations of chain-sensitive behavior too. Initial capability vocabulary includes transaction construction, serialization/deserialization, script compilation/evaluation, chain synchronization/decoding, query, submission, wallet signing/integration, and governance operations. Extend this vocabulary as evidence requires.

### 6.4 Traverse to a documented stopping point

Use a persistent work queue with pending, running, succeeded, failed, and deferred states. Failed work remains retryable; it is not treated as successfully visited. Coalesce concurrent work with identical cache keys.

Each discovered dependency is either resolved, a justified leaf, an explicit opaque boundary, or an unresolved frontier. Unsupported resolvers, unavailable source, inaccessible artifacts, and time/resource limits must produce gaps.

Complete native package closures regardless of whether packages appear Cardano-related. Apply risk-based prioritization to deeper integration review without silently pruning low-priority dependencies from coverage.

### 6.5 Normalize and preserve evidence

Produce stable IDs, canonical ordering, schema versions, and a semantic snapshot digest. Keep run timestamps and operational metadata separate from the semantic digest so unchanged captured inputs yield the same normalized graph.

Store compact normalized snapshots and evidence indexes in the repository. Store bulky locks, logs, archives, and build plans in content-addressed artifact storage with a retention policy and checksums. Decide the storage location before the first full run; expiring CI logs alone are insufficient for replay.

## 7. Manually launched two-pass review

LLMs supplement deterministic collectors by examining evidence that is difficult to normalize, especially runtime integrations, vendored code, release mappings, and undocumented configuration. They do not replace package resolution or establish compatibility by inference alone.

The project owner decides when to run each pass and launches it using [the review task briefs](./DEPENDENCY-REVIEW-TASKS.md). Implementation scope is limited to producing review packets, validating/importing submitted results, and recording evidence decisions. There is no LLM API client, provider integration, automatic launch, or paid-review scheduler to build.

### Pass one: discover missing relationships

Input: a pinned source/evidence bundle, the current normalized subgraph, known gaps, and a structured extraction schema.

Output:

- Candidate relationships with exact file/line or document references.
- Candidate artifact aliases, capability tags, and integration conditions.
- Contradictions and questions for maintainers.
- Explicit statements of insufficient evidence.

### Pass two: challenge the proposed graph

Use a fresh review context over the original evidence, existing graph, and first-pass proposals. Check for missed dependencies, incorrect aliases, optional integrations labeled as mandatory, example/test code mistaken for runtime behavior, unsupported version claims, and missed bundled artifacts.

Agreement between two passes is not verification. Both passes may make the same mistake.

### Admission and reproducibility

- Require structured output validated against the schema.
- Check that cited evidence exists at the pinned revision and supports the claimed scope.
- Promote suggestions only through a deterministic check or explicit evidence review; ambiguous cases remain suggested or disputed.
- Show verified reach separately from potential reach through suggested edges. Surface high-impact suggestions promptly in the investigation queue.
- Treat repository prose as source material, not as instructions for the review process.
- Record task-brief/schema version, packet ID, input hashes, submitted output, and review decisions as provenance.
- Reuse accepted review results for unchanged evidence and scope; flag changed inputs for the project owner to consider rerunning.
- Use one discovery pass and one challenge pass by default. Further investigation is a separately scoped task, not an automatic loop.
- Incomplete or unreturned tasks remain pending and visible in the coverage queue.

LLM generation itself is not guaranteed to be deterministic. Reproducibility means replaying submitted outputs and accepted decisions into the same graph. The collection pipeline remains usable when no manual review has been launched or returned.

The published graph is a versioned evidence snapshot, not a permanently final graph. New releases and corrections produce new snapshots.

## 8. Coverage, impact, and prioritization

### Coverage is multidimensional

For each release/profile, record artifact identification, package resolution, integration review, and capability review separately using `complete`, `partial`, `unresolved`, or `not-applicable`, with a reason and evidence.

`complete` means complete against the declared scope and checklist. It does not claim knowledge of all private deployments or every possible runtime configuration. `not-applicable` requires justification. Unknown supported configurations remain visible as gaps rather than disappearing outside the denominator.

Readiness is a separate, initially unassessed field. Later states can include `unassessed`, `potentially-affected`, `confirmed-blocked`, and `verified-compatible`, scoped to the tested capability/profile/target. Aggregate tool summaries must expose mixed or incomplete results.

### Impact calculation

For a component, reverse-traverse eligible dependency edges and count distinct cataloged tool IDs. Exclude the component's own catalog identity from its downstream-tool count. Deduplicate multiple paths, multiple artifacts of the same tool, and cycles.

Compute required production, optional/configuration-dependent, build-time, and development/test reach separately. A required path takes precedence over an optional path for the same tool within a profile. Project-level reach is the union of tools across component versions, not the sum of version counts.

Store at least one explanatory path per included tool and preserve the graph for further path inspection. Reach is measured only against the declared catalog and graph coverage; it is not ecosystem market share.

### Prioritization

> Superseded by the [2026-10-19 plan revision](#plan-revision-2026-10-19-change-first-assessment): rank by changed surfaces touched first.

For catalog rollout, prioritize higher-level consumers that add coverage of
transaction construction, wallet signing/integration, submission, query, and
application workflows. Their selected closures expose shared upstream components
in consumer context. Use supported collectors as a feasibility check or tie-breaker;
unsupported high-priority tools remain visible work rather than silently falling
behind easy-to-collect lower-level roots. Keep the selection rationale explicit.

Initially rank investigation using chain-facing capability, verified downstream reach, potential reach, and evidence gaps. Show these factors rather than hiding them in an unexplained score. High reach is not a failure finding, and missing evidence is not low risk.

Later add confirmed severity, affected workflows, available release fixes, deployment/adoption evidence, maintainer lead time, and proximity to activation. An upstream failure marks consumers potentially affected until its applicability to their required behavior is established.

## 9. Architecture and repository integration

Use a collection pipeline separate from the website build. The website reads committed, validated snapshots without contacting package registries or running resolvers.

This follows existing decisions in `docs/ARCHITECTURE.md`:

- **ADR-1:** keep the site fully static; collection runs offline or in CI.
- **ADR-2:** keep normalized product data and reviewable changes in the repository.
- **ADR-3:** evidence supports authored deliverable status; readiness evidence does not overwrite initiative progress.
- **ADR-4:** retain a curated root catalog. Transitive discovery expands the dependency graph, not the activity gatherer's repository list. Document this scoped extension before implementation.
- **ADR-8 and ADR-9:** publish snapshot changes through reviewed changes and the existing deployment flow. Scheduled discovery must not depend on weekly editorial timing.
- **ADR-10:** public evidence remains the default. Manually launched reviews require no new LLM credentials or service integration in the collection pipeline.

Proposed module boundaries:

| Module | Responsibility |
|---|---|
| Catalog/release discovery | Identify roots, aliases, releases, and artifacts |
| Resolver adapters | Produce native resolution evidence and normalized occurrences |
| Evidence store | Retain immutable inputs and collection provenance |
| Graph engine | Merge identities, preserve contexts, traverse, calculate reach, and compare snapshots |
| Integration review | Extract non-package relationships, export manual task packets, and import suggestions/decisions |
| Reporting | Produce coverage tables, investigation queues, and static-site projections |
| Compatibility harness, later | Run scoped scenarios and attach test evidence |

Proposed paths, subject to implementation review:

```text
docs/HARDFORK-READINESS-PLAN.md
scripts/readiness/                 collection entry points and orchestration
lib/readiness/                     schemas, graph operations, adapters, reporting
data/readiness/                    normalized snapshots, indexes, and decisions
content/readiness/                 curated profiles, overrides, and assessments
```

Initially keep the existing tooling map intact and link records by catalog ID. Avoid replacing its descriptive relationships with resolved package edges until the new graph has validated coverage and consumers are migrated deliberately.

## 10. Development plan

Deliver vertical slices with acceptance gates. Do not wait for all ecosystem collectors to exist before exposing missing coverage or high-impact findings.

### Phase 1: inventory and contracts

Deliver:

- Schema and terminology for roots, artifacts, profiles, edges, evidence, gaps, and snapshots.
- Inventory/discovery command that accounts for every catalog entry and detects ecosystems/workspaces.
- Release-selection policy, initial configuration profiles, and verified identity overrides.
- Baseline coverage report and collector backlog based on discovered ecosystems.

Acceptance:

- Every catalog ID is accounted for exactly once at tool level.
- Missing repositories, ambiguous releases, and unsupported ecosystems appear as explicit gaps.
- Original catalog entries remain traceable and count totals reconcile.
- Confirm initial supported-version policy, artifact storage, and operational ownership.

### Phase 2: end-to-end native-resolution pilot

Choose a small, representative set based on phase-one discovery: shared dependencies, multiple versions, a monorepo, and more than one ecosystem. Prefer coverage of JavaScript/TypeScript, Rust, and Haskell if the inventory confirms their relevance.

Deliver:

- Initial native adapters, immutable evidence capture, persistent queue, and cache.
- Complete package closure for declared pilot profiles.
- Normalized snapshot, per-tool dependency paths, and reverse-reach report.

Acceptance:

- Cross-check each pilot graph against native resolver/build output.
- Replay captured inputs to obtain the same semantic graph digest.
- Shared artifact work is reused while distinct profiles and versions retain correct edges.
- An interrupted run resumes; failed tasks remain visible and retryable.

### Phase 3: catalog-wide coverage and integration discovery

Deliver:

- Adapters prioritized by catalog coverage and chain-facing relevance.
- Scanning for service, protocol, build, vendored, and downloaded-artifact dependencies.
- Capability inventory, maintainer mappings, documented opaque boundaries, and coverage queue.
- Written discovery and challenge tasks, evidence-packet export, result import/validation, and decision history for manually launched reviews.

Acceptance:

- Every catalog entry has a current coverage result, even when unresolved.
- Every discovered target is resolved, a justified leaf/boundary, or an explicit frontier.
- Suggested or disputed edges cannot silently enter verified impact counts.
- The pipeline and reports work before any manual review has been returned.
- Native output and representative integration findings receive evidence-based spot checks.

### Phase 4: impact reporting and site views

Deliver:

- Coverage dashboard, tool detail, upstream impact, and investigation queues.
- Filters, evidence links, exports, and snapshot comparisons.
- Maintainer work-item summaries with version-specific paths and suggested next actions.

Acceptance:

- Required, optional, build-time, and suggested exposure are distinguishable.
- Reach counts distinct tools correctly across diamond paths, multiple versions, and cycles.
- Every displayed inclusion can be explained with a path and evidence.
- The static build uses only committed inputs, and new views are checked in a real browser.

### Phase 5: recurring operations

Deliver:

- Scheduled collection, explicit refresh/retry commands, and release-change detection.
- Reviewable snapshot diffs, freshness reporting, cache invalidation, and artifact retention.
- Collector runtime/storage measurements, pending manual review packets, and ownership of unresolved work.

Acceptance:

- An unchanged evidence bundle reuses artifact inspection and accepted manual findings rather than creating duplicate review work.
- A changed release or relevant resolver input invalidates the appropriate work.
- A failed refresh exposes the failure and age of the last successful result.
- Published snapshots can be reconstructed from retained evidence and decisions.

### Phase 6: hardfork assessment and remediation

> Revised 2026-10-19: change-to-capability mapping starts now as R1 and is no longer gated on catalog coverage; the test environment (R4) still needs the pinned 11.2 source. See the [plan revision](#plan-revision-2026-10-19-change-first-assessment).

Begin detailed design when the target changes and test environment are ready. Coverage gaps should continue to be closed in parallel with compatibility assessment.

Deliver:

- Change-to-capability mapping for the selected hardfork target.
- Baseline, transition, and post-fork scenarios per relevant release/profile.
- Evidence distinguishing pre-existing failures from target-specific failures.
- Confirmed and potential impact paths, maintainer issue references, released-fix tracking, and downstream retests.

Acceptance:

- Compatibility claims identify exact artifacts, profiles, workflows, target configuration, and test evidence.
- A successful build or node startup alone cannot establish readiness.
- Unrelated or unknown capabilities are not marked compatible by association.
- A source fix, published fix, consumer upgrade, and verified downstream result remain distinct milestones.

Phase order: 1 -> 2 -> 3 -> 4 -> 5, with phase 6 enabled by useful graph coverage and an available target. Initial impact reports arrive in phase 2; actionable findings do not wait for the final dashboard. Set calendar estimates after the pilot measures resolver complexity and catalog coverage.

## 11. Verification strategy

Use representative fixtures and recorded native outputs to verify behavior, rather than tests that simply mirror the implementation.

Required cases include:

- Two tools sharing one exact artifact and a third selecting another version.
- The same version resolving differently under features, peer bindings, patches, or platform conditions.
- A consumer's selected closure differing from an upstream development lockfile.
- Monorepo workspaces, source dependencies, aliases, and registry replacements.
- Diamond paths and cycles without double-counted downstream tools.
- Optional, build-only, and test-only paths remaining distinguishable.
- Missing source, failed resolution, unsupported ecosystem, and truncated work producing gaps.
- Suggested edges with invalid citations or conflicting evidence remaining unverified.
- Changed inputs invalidating cached work; unchanged captured inputs replaying identically.
- Later, baseline failures and target-specific failures receiving different findings.

Track progress with coverage and evidence metrics: tools accounted for, releases identified, package closures resolved, integrations reviewed, unresolved frontiers, stale assessments, and high-impact work items with an owner. Avoid presenting dependency counts or collector success rates as readiness percentages.

## 12. First implementation milestone

The first useful deliverable is a reproducible command that reads the current catalog, emits a coverage record for every tool, resolves a representative cross-ecosystem pilot, and reports which upstream components have the most distinct downstream cataloged tools.

That milestone establishes the schema, evidence discipline, deduplication behavior, and real collector effort. It provides an actionable investigation queue before investing in the full dashboard or hardfork-specific test harness.
