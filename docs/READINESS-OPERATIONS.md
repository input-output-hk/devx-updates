# Readiness collection operations

The collection pipeline writes local snapshots. The website reads committed data. All tools remain hardfork-unassessed until target-specific tests are implemented.

## Quick start

```sh
npm run readiness -- help
npm run readiness -- inventory
npm run readiness -- discover
npm run readiness -- report
npm run readiness -- validate
```

`discover` uses authenticated `gh` access to public repositories. Successful jobs are reused from `.readiness/discovery.json`; failed or interrupted jobs are retried. `--refresh` checks releases again. `--tools id,id` and `--limit N` bound a run. The limit counts distinct repository references, not tools.

For a fresh checkout, existing snapshots and evidence remain usable without network access. Discovery cache state is local. A refreshed discovery identifies source releases, not proven published-package or deployed-service identity. GitHub's latest release can belong to a different package in a monorepo; that mapping remains a coverage gap.

```sh
npm run readiness -- show --tool oura
npm run readiness -- candidates
```

`candidates` lists npm, pnpm, Yarn, Cargo, Go, and uv collection starting points, including nested workspaces. Use `--tools id,id` to narrow the output. Each candidate lists configuration requirements; package hints still need verification against pinned manifests. Unsupported ecosystems remain in the coverage backlog.

## Collect a native profile

The checked pilot commands are:

```sh
npm run readiness -- collect --tool ouroboros-miniprotocols-ts --adapter npm-lock --roots @harmoniclabs/ouroboros-miniprotocols-ts --platform all-lockfile-targets
npm run readiness -- collect --tool meshjs-mesh-sdk --adapter npm-lock --roots @meshsdk/core --platform all-lockfile-targets
npm run readiness -- collect --tool oura --adapter cargo-metadata --roots oura --platform x86_64-unknown-linux-gnu
npm run readiness -- collect --tool dolos --adapter cargo-metadata --roots dolos --platform x86_64-unknown-linux-gnu
npm run readiness -- collect --tool gouroboros --adapter go-packages --roots github.com/blinklabs-io/gouroboros --platform linux/amd64
npm run readiness -- collect --tool lucid-evolution --adapter pnpm-lock --roots @lucid-evolution/lucid --platform all-lockfile-targets
npm run readiness -- collect --tool opshin --adapter uv-tree --roots opshin --platform x86_64-unknown-linux-gnu --python-version 3.13
```

npm collection reads a committed v2/v3 lockfile, including workspace links and hoisted dependencies. It does not run install scripts or assert which optional dependencies ship on a platform. Missing selections and platform applicability are explicit gaps.

Use optional `--root-paths core,react` to distinguish same-named npm packages.
Paths are relative to the selected lockfile; `.` selects its root. Every path and
every `--roots` name must match the selected packages. Batch requests use the
equivalent `rootPaths` array. Selection is retained in profile/cache identity and
native refresh; unselected lock records remain auditable. Paths apply only to npm.
Omitting them preserves the historical name-based selection.

Large GitHub files are fetched through the immutable blob ID returned for the
pinned source path; a missing or mismatched blob fails collection. New npm captures
use a versioned envelope and identify unnamed workspace packages through unique
lockfile links. Missing or ambiguous workspace names remain gaps. Historical bare
lock captures replay with their original identities; native refresh uses a new
cache context for the upgraded capture format. The same source retrieval supports
`capture-source` evidence for files over GitHub's inline-content limit.

Cargo collection checks out the pinned revision in `.readiness/sources/`, then runs `cargo metadata --locked --format-version 1 --filter-platform <target>`. It retains the command, toolchain, metadata, lockfile, and root manifest. Cargo must be installed. A missing/outdated lock or failed resolver produces a retryable resolution gap. Default features are used; custom feature profiles can be imported separately.

Results are reused for unchanged requests. Cargo cache keys include the toolchain and configuration/environment fingerprints; changed resolver inputs invalidate reuse. Use `--refresh` to deliberately rerun a collector. Source checkouts and job caches are disposable; retained evidence is not.

pnpm collection reads committed v9 lock snapshots and importer manifests without installing dependencies. Workspace links, aliases, and peer-specific selections retain their resolution contexts. Patched/local packages and installed-platform pruning remain explicit gaps. Nested locks use `--path path/to/pnpm-lock.yaml`.

Both single-document and environment-plus-project pnpm locks are supported.
Following [pnpm's lockfile documentation](https://github.com/pnpm/pnpm.io/blob/main/docs/lockfile.md),
the last document supplies the project graph. An optional first document is
retained in native evidence as `environmentLock`, with an explicit unresolved
build/toolchain boundary for its configuration and package-manager dependencies.
Those packages are not counted as application exposure. Unexpected document
counts, ordering or versions fail collection. Existing single-document captures
retain their original cache identity and replay behavior; two-document captures
use `committed-lockfile:pnpm-environment-v1`. No config plugin or install script
is executed.

Yarn collection (`--adapter yarn-lock --platform all-lockfile-targets`) reads
Classic v1 locks using the pinned official `@yarnpkg/lockfile` parser, or modern
Yarn YAML with metadata version 6/8/10 using `@yarnpkg/parsers`. A companion manifest is required; modern
workspace manifests restore package names, versions, and runtime/development scope.
Nested projects use `--path path/to/yarn.lock`. Repository configuration and
manifests are retained with parsed native selections; no package installation,
user configuration, plugins or project scripts run. Registered requests refresh
through the existing queue/cache workflow. The pinned Classic metadata reader is
installed with this pipeline's dependencies; no global Yarn installation is needed.

Classic monorepos additionally capture
[`yarn workspaces info --json`](https://classic.yarnpkg.com/lang/en/docs/cli/workspaces/)
using Yarn 1.22.22, offline, with a temporary cache and sanitized environment.
`--no-default-rc`, `YARN_IGNORE_PATH=1` and `--ignore-scripts` prevent repository/user
configuration, delegated binaries and lifecycle scripts from running. The command
has a 30-second timeout and bounded output. Retained native workspace locations
and matching/mismatching dependency lists connect named production roots using
their manifests' runtime/development/optional scopes. Unnamed orchestration roots
remain source evidence with an explicit unmodeled-root boundary. Every requested
root must match. Ambiguous native classifications and potentially applicable
`resolutions` overrides suppress edges and remain gaps; this metadata does not
prove installed selection under overrides. Capture context v2 invalidates old
refresh and completed-batch caches; historical captures keep their replay behavior.

Metadata v6 covers the pinned Cardano JS SDK Yarn 3.2.1 input. Its
[native lock writer](https://github.com/yarnpkg/berry/blob/%40yarnpkg/cli/3.2.1/packages/yarnpkg-core/sources/Project.ts#L1461)
retains grouped descriptors, workspace placeholders, dependency/peer metadata,
conditions and cache checksums. Bare dependency ranges are normalized for lookup;
workspace versions come from retained manifests. Cache checksums are not tarball
integrity and virtual peer instances still require a separate installed inventory.
This adds an accepted input format without changing historical capture identities.

Yarn lock records establish declared selections, not an installed dependency tree.
Peer bindings are left unresolved; platform conditions remain conditional edges.
Installed Classic workspace layout, unlisted selectors, ambiguous descriptors, opaque Git/
local/patch sources, configuration extensions, native bundles and shipped artifact
correspondence remain explicit gaps. Modern cache checksums are retained as raw
evidence and never substituted for npm tarball integrity. Unknown lock versions
and conflicting workspace identities fail collection. In modern captures, registry
identity comes from committed `.yarnrc.yml` settings (including parent directories
within the checkout); environment-dependent registry URLs are rejected.

These boundaries follow [Yarn Classic's lockfile guarantees](https://classic.yarnpkg.com/blog/2017/05/31/determinism/),
the [official Classic parser](https://github.com/yarnpkg/yarn/tree/master/packages/lockfile),
and modern Yarn's [virtual package model](https://yarnpkg.com/advanced/pnp-spec)
and [registry configuration](https://yarnpkg.com/configuration/yarnrc).

Go collection runs `go list -e -deps -json -mod=readonly` for runtime and test graphs. It uses explicit `GOOS/GOARCH`, disables cgo and workspace overlays, and prevents automatic toolchain downloads. Select packages with `--packages ./...` and tags with `--tags tag,tag`; defaults cover every package in the selected module. Replacements preserve their actual source identity. Missing packages and native errors produce partial coverage. This is package-import coverage for the declared configuration, not a module-lock interpretation of `go.sum`.

uv collection requires a committed `uv.lock` and uses offline, locked JSON tree output with explicit Python/platform selection. It captures extras and development groups separately. User uv environment overrides and external configuration discovery are disabled. Build-backend dependencies and installed wheel/sdist selection remain gaps. The JSON format is a preview API; the scheduled collector pins uv 0.12.22 and rejects unknown schema versions. Nested projects use `--path path/to/pyproject.toml`.

All collectors verify retained evidence before reusing a cached profile. Go patterns/tags and Python versions are part of the collection request identity. New source checkouts refuse to overwrite local changes.

`npm run readiness -- refresh-native` refreshes all registered `collect` requests against the currently discovered source revisions. Unchanged inputs reuse retained profiles. One failed profile does not stop the others; failures remain gaps and the command exits unsuccessfully. Imported custom profiles are not converted into executable commands automatically.

For bounded runs, use `refresh-native --tools lucid-evolution,opshin --limit 2`.
The limit counts distinct registered requests after filtering and deduplication
across historical revisions; multiple configurations for one tool count separately.
Requests run in stable tool-ID order. Unknown tools and tools without registrations
are rejected before collection. Each request logs its position before starting and
saves successful output immediately, so retrying a stopped batch can reuse it.
Toolchain probes have 30-second deadlines, Git operations two minutes, GitHub
requests one minute, and native resolution commands five minutes. These are
per-command limits, not a total batch deadline. Expired commands are force-killed
and collection errors retain diagnostics.

Run validation, replay, report generation, and the site build separately. On Linux,
`timeout -k 5s 120s node --import tsx scripts/readiness/cli.ts replay` provides an
outer deadline and a kill grace period. The Node loader also works in restricted
environments that disallow the `tsx` CLI's IPC socket. Replay logs each profile;
a timeout is an unfinished check, never a successful validation.

### Resumable catalog batches

`collect-batch` adds explicitly selected requests before their first successful
collection. Store the reviewed selection in a JSON file:

```json
{
  "schemaVersion": 1,
  "requests": [{
    "toolId": "cardano-peer-connect",
    "revision": "6fce1afe581da1009a81fe119ec83357150abab9",
    "adapter": "npm-lock",
    "roots": ["@fabianbormann/cardano-peer-connect"],
    "platform": "all-lockfile-targets"
  }]
}
```

```sh
npm run readiness -- collect-batch --input content/readiness/catalog-batch.json --limit 2
```

`data/readiness/collection-queue.json` retains pending, running, succeeded, failed,
and deferred jobs, their pinned requests, attempts, errors, and successful profile
IDs. The existing store writer lock covers queue and snapshot writes. Every
transition is saved atomically; a killed run's running jobs become pending on the
next selected run. The native cache recovers a profile saved just before interruption.
New pending work runs before failed retries so a repeatedly failing request cannot
starve the rest of a limited batch. Requests outside `--tools` remain queued.

A successful job is skipped only while its profile and evidence bytes are retained.
`--refresh` reruns selected successes and bypasses the native cache. Use it when
deliberately changing toolchains or resolver inputs; ordinary batch resumption
reuses the completed pinned capture. `refresh-native` remains the command for
registered profiles against newly discovered releases and current resolver inputs.
If discovery has moved beyond a batch's pinned revision, that job is deferred;
verify and update the input file rather than silently collecting a different source.
Outstanding selected failures and deferred requests cause a nonzero exit status,
including failures left unattempted by the current limit. A bounded run may leave
pending jobs without failing; inspect its summary and rerun to continue. Collection
success means evidence was captured, not complete coverage or hardfork readiness.

The checked catalog batch includes source-only/monorepo release caveats in
`content/readiness/README.md`. Scheduled refresh handles successful registrations;
unregistered batch failures require an explicit batch retry.

### Import other native output

```sh
npm run readiness -- import-native --profile profile.json --input native-output.json
```

Example profile:

```json
{
  "toolId": "kupo",
  "release": "<assessed-release>",
  "revision": "<40-character-commit>",
  "platform": "x86_64-linux",
  "features": ["default"],
  "command": "cabal build all --dry-run",
  "toolchain": "<cabal-and-ghc-versions>",
  "origin": "source-reconstruction",
  "adapter": "cabal-plan",
  "rootNames": ["kupo"]
}
```

Replace placeholders with observed values. `release-build` is reserved for an actual release build's output; reconstructing source locally is not equivalent.

For new Cabal imports, wrap the untouched native `plan.json` in this envelope:

```json
{
  "formatVersion": 1,
  "sourceDirectory": "/source",
  "roots": [{ "unitId": "<exact-local-unit-id>", "component": "lib" }],
  "plan": { "<native-plan-fields>": "<native-values>" },
  "provenance": { "<capture-inputs-and-logs>": "<retained-content>" }
}
```

Use observed unit IDs and component names from `install-plan`, not package names
inferred from the catalog. Select every intended root explicitly; a library root
does not include its test or example siblings. Version 1 accepts Cabal/Cabal-library
3.12.1.0 plans and requires profile `platform` to match `<arch>-<os>` from the plan.
It preserves per-component flag conditions, executable and custom setup build
dependencies, development scope, pre-existing compiler units, pinned Git overrides,
archive checksums and Cabal metadata revision hashes. Missing or ambiguous targets
remain gaps; malformed dependency arrays fail import. Bare historical plans retain
their original interpretation for replay and should not be used for new captures.

Retain the exact `cabal.project`, selected package manifests, freeze/local files if
present, source override commits/manifests, command, toolchain and system-library
versions, resolver logs, index states, repository security metadata, and worker
recipe in `provenance` or supporting source evidence. The whole envelope is retained
and hashed. Provenance is evidence for review, not an independently verified claim
of a successful build. Graph replay consumes the retained plan offline; rerunning
the solver also requires the source, toolchain and package repositories.

The first real Haskell pilot is Atlas v0.14.1 at
`62e37abda859cdd7e8814e7d07f963c29e4f2833`. It used GHC 9.6.6 and Cabal 3.12.1.0
on x86_64 Linux, with the unchanged project index states (Hackage
`2025-04-15T19:49:23Z`, CHaP `2025-04-11T16:42:25Z`) and three Git overrides.
Its selected command was
`cabal --config-file=/work/cabal/config build atlas-cardano:lib:atlas-cardano --dry-run --builddir=/work/dist`.
The retained envelope includes the pinned official Haskell image digest, custom
Dockerfile with BLST 0.3.13, compiler/package dump, signed repository metadata and
cache hashes, source inputs, successful log and prior missing-libsodium failure.
This Debian worker is not the full Atlas Nix release environment. No Atlas code
was compiled or tested. Full repository index tarballs are not vendored; the
retained native plan is sufficient for graph replay, not an offline fresh solve.

### Gradle selected-variant collection and imports

`gradle-resolution` accepts format-version 1 output from
`scripts/readiness/gradle-resolution.init.gradle`, currently pinned to Gradle
7.5.1. `collect`, `collect-batch` and `refresh-native` run the build in a disposable
Docker worker using the pinned image
`gradle@sha256:deb7b59256192aed1f463ab5e698c509cc77ce5d4e421d8b89b5d99eb0b24538`
(Gradle 7.5.1, JDK 17.0.5, Linux amd64). Docker must be available; the collector
pulls that exact image only when absent. The selected build must declare an
official Gradle 7.5.1 wrapper distribution. The wrapper itself is never executed.
Other Gradle versions need a separately validated worker/adapter.

The worker has a read-only root and source/capture mounts, no host home, Docker
socket or credential mounts, no forwarded host environment, no Linux capabilities,
two CPUs, 2 GiB memory with no additional swap, 256 PIDs, 1 GiB work storage and
128 MiB temporary storage. The image's cache volume is masked with another bounded
16 MiB tmpfs. Project evaluation can access the network for public plugins and
metadata. There are no host-writable project output mounts. Native JSON returns on
bounded stdout; the capture retains stderr, elapsed time, source input sizes,
worker limits, exact scripts and image digest. A run is limited to six minutes;
image preparation has a separate three-minute bound. Every container has a unique
name and is forcibly removed on success, failure or client timeout. Cleanup
failure is reported with that exact name for inspection.

Registered requests retain explicit project/configuration/scope selections.
Verified cached evidence is reused before checkout or Docker startup; revision,
selection, image, worker script or limit changes invalidate the cache. A successful
batch resume also checks the current worker context. `--refresh` forces a fresh
capture. Native dependency failures retain their partial graph but fail collection
and remain retryable. Adapter limitations alone do not prevent cache reuse.
Manual `import-native` remains available for retained native envelopes.

Select each configuration explicitly in a JSON array:

```json
[
  { "projectPath": ":", "configuration": "runtimeClasspath", "scope": "runtime" }
]
```

Pass its path to `collect --configurations selection.json`, alongside explicit
`--roots`, `--path build.gradle` (or a discovered nested build with its own settings) and
`--platform amd64-Linux`. The native capture also verifies that Gradle's actual
root directory matches the selection, so ancestor settings cannot silently
change source identities. The worker supplies the init script properties. For a
manual capture, pass `-Dreadiness.selection` and `-Dreadiness.output` and run
`readinessResolution` with the init script. Scope is an explicit capture
choice: runtime, build or development. It must match the selected configuration's
purpose. Only those configurations are included; local dependencies' separate
compiler/plugin/annotation-processor configurations are not implied. The native
[`ResolutionResult`](https://docs.gradle.org/current/javadoc/org/gradle/api/artifacts/result/ResolutionResult.html)
API describes selections, while
[`getDependenciesForVariant`](https://docs.gradle.org/current/javadoc/org/gradle/api/artifacts/result/ResolvedComponentResult.html)
preserves each selected variant's own edges. Constraints affect native version
selection but do not create exposure edges. Native failures remain gaps; malformed
captures, missing referenced nodes and unbound included builds fail closed.

The profile platform must equal the captured `<arch>-<os>` (for this Linux worker,
`amd64-Linux`). Root names are captured `<group>:<project-name>` identities, which
can differ from published Maven artifact IDs. Keep that distinction explicit.
Local project sources bind to the immutable checkout and relative path. External
module coordinates lack per-module repository provenance and binary checksums in
this API, so their identities remain isolated to the capture. This deliberately
does not merge them into verified Maven artifacts. No binaries are downloaded by
the graph traversal; Gradle may download plugins and metadata during evaluation.
File dependencies and shipped/native inventories remain separate boundaries.

The first pilot selects Cardano Client Lib v0.7.3 at
`f1130177b02761ea15b93a92e385ae0739d27096`: `runtimeClasspath` for `:`,
`:governance` and `:backend-modules:blockfrost`. These yield 97 variant occurrences
and 247 dependency edges; nine native constraint records remain evidence only.
The aggregate library includes QuickTx through its native project dependencies.
Koios/Ogmios backends, supplier modules, integration tests and build classpaths
outside those roots remain open. Gradle's successful capture task is not a
successful SDK build or a hardfork result. The original manual profile remains
historical evidence; `content/readiness/gradle-batch.json` registers the same three
configurations for managed collection and scheduled refresh:

```sh
npm run readiness -- collect-batch --input content/readiness/gradle-batch.json
npm run readiness -- refresh-native --tools bloxbean-cardano-client-library
```

This follows ADR-1/ADR-2: only retained, reviewable evidence feeds the static site.
The scheduled workflow already calls `refresh-native`; its host `GH_TOKEN` is not
forwarded into the Gradle worker.

Supported adapters are `npm-lock`, `pnpm-lock`, `yarn-lock`, `bun-lock`, `poetry-lock`, `cargo-metadata`, `cabal-plan`, `gradle-resolution`, `go-packages`, and `uv-tree`. Cabal remains import-only. Other Yarn versions/installed peer contexts, older pnpm lock formats, Python projects without supported uv/Poetry inputs, and unsupported build systems remain visible coverage work. No synthetic resolution is substituted.

## Scan retained source for integration leads

```sh
npm run readiness -- scan-integrations
npm run readiness -- scan-integrations --tools lucid-evolution,masumi --output .readiness/integration-leads.json
```

This offline scan reads source captures already attached to the selected tools or
their native profiles. It does not fetch a repository, execute source, launch a
review, or add graph edges/capability findings. The default report is
`data/readiness/integration-scan.json`; it accounts for all catalog tools, including
tools without captured source. The regular `report` command refreshes it alongside
coverage and impact reports. Run either command after source captures or discovery
changes. Existing `capture-source` commands can retain additional pinned files.

Versioned lexical rules locate URLs/service calls, protocol/wallet markers,
embedded/vendored references, generator commands, downloads and container build
inputs. Each lead carries the retained evidence ID, `/content` citation pointer,
exact quote and one-based line/column (columns count UTF-16 code units). Quotes are
bounded excerpts; column denotes the excerpt's start. A match can be documentation, a comment, example or test. It
does not establish production scope, target identity, deployment, enabled behavior
or compatibility. Every lead remains `needs-review`, and every tool's scan coverage
is partial even when no matches occur.

The report enumerates captured files and explicit exclusions: historical revision,
foreign/unbound repository, native package lock, binary content, or resource limit.
Limits are 200 eligible files and 2,000 leads per tool, 2 MiB per source file, and
500 characters per excerpt. Evidence-ID order determines which files fit a bounded
scan. Files outside the captured bundle remain an unresolved frontier; a scan is
never evidence of repository-wide absence. Missing/corrupt attached evidence fails
the command rather than yielding a successful empty report.

New manual review exports include an `integration-scan.json` navigation aid derived
only from that packet's own retained inputs. Cite and examine original evidence;
the scan is not an independent source or an admission decision. Its version and
input digest are recorded separately. Existing packet identities, pending states,
and accepted graph decisions are unchanged by creating this derived aid. The owner
continues to decide when to launch discovery and challenge reviews.

## Check the hardfork change register

`content/readiness/dijkstra/changes.json` lists the Dijkstra changes, their
surfaces and the pinned source lines they rest on (see its README).

```sh
npm run readiness -- check-changes                   # structure, closed vocabulary, pinned revisions
npm run readiness -- check-changes --verify-sources  # also re-read every cited quote via gh
```

`--verify-sources` needs GitHub access and fails if any quote has left its
recorded line. Regenerate citations only from immutable revisions.

`content/readiness/dijkstra/boundary.json` records each boundary component's
Dijkstra status per surface. It is validated against the change register's
surfaces; `released` needs a named release and every status except
`no-evidence` needs evidence.

```sh
npm run readiness -- check-boundary                   # counts components by worst status
npm run readiness -- check-boundary --verify-sources  # also re-read every source citation
```

Statuses age quickly: re-observe a component (new head, release and trackers)
before relying on an entry older than a week.

`content/readiness/dijkstra/classification.json` classifies every catalog tool
by the changed surfaces it touches (R3). It is regenerated from default-branch
heads:

```sh
npm run readiness -- classify-surfaces                     # all tools, six repositories at a time
npm run readiness -- classify-surfaces --tools ogmios,kupo # a subset (writes the same output file)
```

Each repository is fetched shallowly with files over 1 MiB omitted, scanned and
then deleted; scans are cached in `.readiness/surface-scans/` per revision and
rule digest, so an interrupted run resumes and an unchanged repository is not
fetched again. Hits are lexical leads: a dependency or service hit inherits the
R2 status of the component behind it, markers only show that a surface is
touched, and prose (docs, READMEs, changelogs) never establishes exposure.
Tests, examples, benchmarks and demos are kept as auxiliary hits that never set
readiness. The run also records each repository's archive state and last push
through `gh api`. Changing a rule or the scanner bumps `SCANNER_VERSION`, which
invalidates the cache; delete `.readiness/surface-scans/` to force a rescan.

Manifests only show direct dependencies. Components reached through another
package are read from the lockfiles committed at each classified revision and
written to `content/readiness/dijkstra/transitive.json`:

```sh
npm run readiness -- transitive                      # every scanned tool (GitHub API tree plus raw lockfile reads)
npm run readiness -- transitive --tools carp,lace    # a subset; other tools' links are kept
```

Each link names the nearest catalog component on the lockfile path, its
locked package and line. A component reached only through another component
the tool declares is not linked: that component's own classification and
leads carry it. Nothing is cloned, and lockfiles in test, example or vendored
paths are skipped. Lockfile rules live in `lib/readiness/transitive.ts`
(`LOCK_RULES`) and are kept out of the scan rule digest. Links are merged by
the next `classify-surfaces` run as `transitive:<component>` hits.

After editing `boundary.json`, `changes.json` or `transitive.json`, recompute
the classification from the recorded revisions and cached scans, without
fetching, so that lead decisions read at those revisions stay valid:

```sh
npm run readiness -- classify-surfaces --reclassify
```

After a rescan, confirm the inherited gaps:

```sh
npm run readiness -- check-leads                   # every shipped gap decided, none stale or orphaned
npm run readiness -- check-leads --verify-sources  # also re-read every quoted line at its revision
```

`check-leads` lists gaps without a decision (`unreviewed`), own-code surfaces
without a decision (`ownUnreviewed`: marker surfaces of non-boundary tools with
no confirmed gap, decided with `via: "own"`), decisions read at an older
revision than the new scan (`stale`) and decisions that no longer match a gap,
an own surface or a surface waiting on its component's verdict (`orphaned`,
which fails the command). Decide each new or stale lead by
reading the tool's shipped code at the classified revision and record the quoted
lines in `content/readiness/dijkstra/leads.json`. Then regenerate the unlock
report:

```sh
npm run readiness -- unlocks                                    # content/readiness/dijkstra/unlocks.json
npm run readiness -- unlocks --component scalus,cardano-js-sdk  # what fixing these together unlocks
```

Every bump-ready tool needs an own-era-handling reading in
`content/readiness/dijkstra/upgrades.json` at its classified revision:

```sh
npm run readiness -- check-upgrades                   # lists missing and stale readings
npm run readiness -- check-upgrades --verify-sources  # also re-read every quoted line
```

Devnet results (R4) live in `content/readiness/dijkstra/devnet.json`; the
recipe that produced them is `scripts/readiness/devnet/README.md`. After
editing either register:

```sh
npm run readiness -- check-devnet     # known subjects, recipe files present, boundary evidence consistent
npm run readiness -- check-boundary   # also fails when an assessment disagrees with a devnet result it cites
```

## Manual review handoff

For the four prepared higher-level consumer packets, follow
[Run the prepared reviews](./RUN-PREPARED-REVIEWS.md), which includes discovery
and independent-challenge prompts and owner import steps.

First capture specific source files needed for cited findings, then export a packet:

```sh
npm run readiness -- capture-source --tool oura --path README.md
npm run readiness -- export-review --tools oura --output .readiness/reviews/oura
```

The packet contains selected tools, profiles, graph records, evidence hashes, decompressed evidence, a result template, and the [task briefs](./DEPENDENCY-REVIEW-TASKS.md). Run discovery and challenge tasks manually. Capture additional sources and export a new packet if the first review needs evidence outside its packet.

The implemented interchange format is JSON. Import supports relationship, capability and gap findings; identity questions remain gaps. A tool needs a native profile before a relationship or capability can be attached to its context. Review tasks for other tools can still return evidence gaps. Capability findings use the [versioned capability format](./CAPABILITY-REVIEW-FORMAT.md), copied into every packet as `CAPABILITIES.md`.

Task brief version 2 binds the review contract to the packet digest and includes
capability findings and prior decisions. Re-export version-1 pending packets;
their old IDs become `needs-revalidation`. Historical snapshots without capability
fields keep their semantic identity; no empty capability tables are added on read.
The Capabilities dashboard view filters by behavior, verification, source
applicability and runtime/build/development scope. Tool pages and JSON exports
retain profile conditions, evidence and decision history. Reports and snapshot
comparisons include capabilities without adding dependency reach or compatibility
claims. Native rebuild refuses to discard manual capability findings.

Relationship finding shape, inside the exported result template's `findings` array:

```json
{
  "id": "finding-001",
  "toolId": "oura",
  "kind": "relationship",
  "from": "<consumer-occurrence-id-from-packet>",
  "target": {
    "ecosystem": "service",
    "name": "<service-name>",
    "version": null,
    "source": "<documented-interface-or-source-URL>",
    "integrity": null
  },
  "type": "service",
  "scope": "runtime",
  "optional": true,
  "condition": "<configuration-enabling-this-integration>",
  "rationale": "<what-the-evidence-establishes>",
  "citations": [{
    "evidenceId": "<evidence-id-from-packet>",
    "pointer": "/content",
    "quote": "<exact-source-excerpt>"
  }]
}
```

Types: `service`, `protocol`, `bundled`, `code-generation`. Scopes: `runtime`, `build`, `development`. Unknown target version/integrity remain `null`. JSON pointers refer to retained evidence documents; excerpts must match. Package edges come from native adapters.

Gap findings use `id`, `toolId`, `kind: "gap"`, `area`, `rationale`, `nextAction`, and `citations` (which may be empty). Areas: `artifact`, `resolution`, `integration`, `capability`, `discovery`.

```sh
npm run readiness -- import-review --packet .readiness/reviews/oura/packet.json --input result.json
```

Findings default to suggested. A separate decision document can record checked evidence:

```json
{
  "decisions": [{
    "findingId": "finding-001",
    "verification": "verified",
    "method": "source-review",
    "rationale": "<specific-evidence-check-and-applicability>"
  }]
}
```

Pass it with `--decisions decisions.json`. Methods: `source-review`, `maintainer-confirmation`, `native-check`. Verification states: `verified`, `suggested`, `disputed`, `rejected`. Changing an existing relationship decision also requires its `previousVerification`. Neither task completion nor agreement between passes establishes compatibility.

Results from stale input packets are rejected. Unrelated tools' updates do not invalidate a packet. Reimporting an identical submission is idempotent. Pending packet IDs are recorded in `data/readiness/reviews.json`.

## Evidence, replay, and comparisons

```sh
npm run readiness -- replay
npm run readiness -- diff --before previous-snapshot.json --output changes.json
npm run readiness -- diff --before-ref <git-ref> --output data/readiness/changes.json.gz
npm run test:readiness
```

- `snapshot.json` is the canonical snapshot manifest and coverage state. Its
  `storageVersion: 1` envelope references immutable `snapshots/<table>/<sha256>.json`
  chunks for artifacts, occurrences, and edges. The logical graph still uses
  schema version 1. `Store.load()` validates every referenced chunk and reconstructs
  the same graph before checking its semantic digest.
- `evidence/*.json.gz` retains content-addressed inputs with checksums. Keep these files with every published snapshot; do not prune referenced evidence.
- `report.json` contains coverage gaps and an ecosystem backlog.
- `impact.json` contains distinct downstream tools and explanatory paths per scope/profile.
- `projects.json` unions downstream tools across package versions within known source namespaces. Forks and ambiguous sources stay separate.
- `work.json` contains the coverage and component-investigation queues, tied to
  the snapshot digest. Investigation tasks group versions by the same evidenced
  namespace as `projects.json`, preserving individual consumer release/profile
  paths. The website's **Investigations** view computes the same queue from
  committed inputs; it supports search, ecosystem, ownership and capability
  evidence filters, plus JSON export. Existing **Work queue** gaps expose owners
  and linked issues too.
  Stored investigation entries reference their project in `projects.json` via
  `pathsRef`; retain both files with the snapshot. This avoids duplicating the
  full occurrence paths. Website filtered exports include the matching impact
  records and labeled paths for independent inspection.
  Collected root components remain in `projects.json` and the investigation queue
  even with zero downstream consumers. Their root profiles and evidence are
  retained; zero reach does not remove material uncertainty from investigation.
- Ranking is lexicographic, descending: current verified runtime capabilities at
  an exact component root, current suggested/disputed capabilities, distinct
  verified runtime/build consumers, potential consumers, then the total open gaps
  across those consumers. Each factor is shown. Development-only verified reach
  does not increase the runtime/build factor. Potential reach retains the graph's
  suggested/disputed paths across scopes. Missing component evidence remains
  explicit; no ranking factor is a compatibility finding. A consumer capability
  is never attributed to its dependencies. Historical and multiple-root findings
  remain inspectable but do not establish current component-specific behavior.
- Author task ownership in `content/readiness/work-assignments.json`. Each row
  has `taskId`, `owner`, `issueUrl`, and `nextAction`; the last three accept `null`.
  Copy a task ID from the queue export. Investigation IDs persist across versions
  within the same package namespace; coverage IDs bind a catalog tool to its gap.
  For example, replace the placeholder ID before saving:

  ```json
  [{ "taskId": "<copy exported taskId>", "owner": "Assigned investigator", "issueUrl": null, "nextAction": null }]
  ```

  `null` next action keeps the generated suggestion. Issue links must use HTTPS
  without credentials. `report --assignments path.json` supports an alternate
  assignment file for isolated runs; website builds use the committed default.
  Malformed or duplicate assignments fail validation. Assignments with no current
  task remain in `unmatchedAssignments` and are shown for reconciliation instead
  of being silently deleted. Assignment changes never alter graph evidence or
  readiness. Catalog maintainer hints are separate from assigned owners and do
  not constitute verified contact information. No issues or messages are sent.
- `changes.json.gz` uses comparison schema version 2 and must target the current
  snapshot digest. Regenerate older comparisons with `diff`; stale or older-format
  files are not displayed. A `.json.gz` output is lossless gzip-compressed JSON;
  plain `.json` output remains supported. The website also reads historical
  `changes.json`, but rejects a directory containing both filenames to avoid
  silently selecting an obsolete report. When migrating, verify decompressed
  equality before removing the plain copy. Compression changes repository storage,
  not comparison contents or the browser's JSON export. The website offers searchable, paginated tool changes,
  recorded versions, relationship changes, and exact-artifact reach changes, with full and filtered JSON
  exports. Reach changes keep required, optional, build, development and potential
  exposure separate; equal counts with different consumers still produce a change.
  Added, removed and corrected relationship records retain endpoints, type, scope,
  conditions and citations independently of reach changes. Native-plan records
  outside the selected closure remain distinguishable from counted exposure.
  Added and removed consumers carry a supporting path from their respective
  snapshot, including the actual scoped/verified edges and retained evidence index.
  Removed records remain explainable even when they no longer occur in the current
  graph. Keep both compared snapshots and their evidence for complete reconstruction.
  Version sets include selected roots and reachable dependencies across retained
  historical profiles. They exclude unreachable native-plan records and reuse the
  existing conservative source namespaces; a newly observed version does not
  imply deployment, replacement or a consumer upgrade.
  Tool observations expose before/after coverage, gaps and source identity, added
  or removed profiles, configuration/command/toolchain changes and review decisions.
  Changed input hashes alone cannot distinguish a collector update from changed
  inputs or corrected evidence; the report says so instead of inventing a cause.
- `replay` reconstructs native graph records and admitted manual relationships,
  capability findings and decisions from retained inputs, without network access
  or evidence writes. It compares the complete graph (including unexpected or
  missing records) and checks review-created gaps, coverage changes and tool
  evidence links. Source-discovery metadata is retained as input, not rediscovered
  by replay.
- New review imports archive the checked original packet as content-addressed
  evidence. `snapshot.reviewSubmissions` links each accepted submission to its
  packet archive. Keep both evidence objects, their cited inputs and prior
  submissions in backups. Inventory refresh preserves this history. Review order
  comes from predecessor submissions in packet inputs, not timestamps or filename
  ordering; later releases do not invalidate replay of historical decisions.
- Older manual imports without archived packet context fail replay explicitly.
  The original packet and pre-import snapshot are required to recover that
  history; replay never invents a baseline from the current graph. Reimport into
  a separate restored pre-import snapshot, then reconcile subsequent inputs and
  decisions before replacing canonical data. A native-only snapshot needs no
  migration. Identical accepted submissions remain idempotent.
- Native output and configuration evidence have explicit roles. `rebuild-native` upgrades native graph records after an adapter change using retained evidence, and marks affected review packets for revalidation. It refuses to overwrite graphs containing manual relationships or decisions that need reconciliation.
- Semantic digests exclude operational timestamps. Resolver inputs, command/toolchain, profile, and native output remain part of profile identity.
- Required exposure takes precedence over optional exposure within a profile. A tool may still appear in both columns when it has different exposure in different profiles; project totals union tools rather than summing version counts.
- A single-writer lock prevents concurrent collection commands from overwriting each other. Interrupted same-host locks are recovered when their process no longer exists.

Profiles are historical, release-specific records. Refreshing discovery does not silently change old graphs or declare the newest release resolved. Collect a new profile for the new release. Tool-level resolution stays partial until supported configuration coverage has been established; a complete native profile does not establish complete tool coverage.

### Static website reports

`next build` derives JSON reports from the committed snapshot, assignments and
current comparison. The static export includes these files under
`out/map/readiness/data/`; deploy them together with the HTML and other assets.
No collection, registry access or runtime server is involved (ADR-1/ADR-2).
Requests use `NEXT_PUBLIC_BASE_PATH` (ADR-11). Serve the exported directory through
HTTP, including when inspecting it locally without external network access.

The pinned Next.js build uses `experimental.cpus: 1` in `next.config.ts` to
limit static generation to one worker. Each worker loads the retained graph;
duplicating it across workers can exhaust memory on small build hosts. This
trades parallel throughput for lower memory use without omitting routes, graph
records or TypeScript checks. Other processes still need memory, and larger
snapshots may require further profiling. Validate changes to this setting with
the complete export, including `NEXT_PUBLIC_BASE_PATH=/devx-updates npm run build`.

Initial HTML contains tool coverage and the full catalog denominator. Other
reports load when their tabs open; comparison loads when expanded. Impact and
project indexes omit paths, which are partitioned into 32 static files shared by
impact and investigation views. Expanding a component loads its path file. A
filtered export fetches all required path files, with at most four concurrent
requests, before producing the complete download. A failed fetch never produces
a partial export or an empty-success report.

Filenames hash each report's content, including authored assignments and comparison
data rather than only graph identity. The browser checks the response version and
identity, reuses successful/in-flight requests, and allows retries after failures.
If a deployment has replaced files referenced by an older page, reload the page;
do not treat missing files as missing evidence. These are reproducible website
assets, not replacements for retained snapshots and evidence. Investigation and
comparison files still load in full when opened; pagination limits rendering, not
their transfer size.

### Snapshot storage and backups

New saves use ordinary JSON chunks capped at 2 MiB. Occurrences and edges are
grouped by profile; artifacts are distributed across stable hash buckets. Evidence
lists are stored once per chunk and referenced by a local integer. Each decoded
record receives its own evidence array, preserving independent review updates.
Records remain complete JSON objects, one per line, for readable diffs.

Chunks are content-addressed and written before atomically replacing the manifest.
A failed save leaves the previous manifest usable. Existing chunks must match their
expected bytes; corruption is rejected. Old chunks and evidence are not pruned
automatically, so readers and retained manifests can still use their original
references. Superseded chunks can accumulate after graph corrections; any future
cleanup must account for retained manifests, not just the current snapshot.

```sh
npm run readiness -- compact-storage
npm run readiness -- export-snapshot --output /tmp/readiness-before.json
npm run readiness -- diff --before /tmp/readiness-before.json
npm run readiness -- diff --before-ref HEAD
```

`compact-storage` migrates storage without changing operational timestamps or the
semantic digest. Legacy self-contained snapshots remain readable. `export-snapshot`
writes a self-contained logical snapshot for comparisons and portable graph
backups; evidence files must still accompany backups intended for native replay.
Copying `snapshot.json` alone no longer copies the graph: either export it or copy
the manifest together with its referenced `snapshots/` files. Git comparisons read
the manifest and all chunks from one resolved commit. The CI baseline uses the
self-contained export, and uploaded review artifacts include the chunk directory.

## Scheduled collection

`.github/workflows/readiness.yml` refreshes discovery and registered native profiles weekly and on manual dispatch. It validates data and uploads a review artifact with a snapshot comparison, including resolution failures. It has read-only repository permission and does not commit, push, or create pull requests. Accepted snapshots and evidence are committed separately after review.

Adding a new native profile and launching review passes remain explicit tasks. Download review artifacts within their 90-day retention window; merged evidence is retained in git.

### Bun and Poetry production SDK inputs

`bun-lock` reads text `bun.lock` version 1/config versions 0 and 1 with pinned
`jsonc-parser` 3.3.1, including comments and trailing commas. It captures every
locked workspace manifest, checks dependency declarations, follows nested package
keys and workspace aliases, and retains development, optional and peer edges.
Use `--platform all-lockfile-targets` and select production package names.
Binary `bun.lockb` and other versions remain unsupported. Repository `bunfig.toml`
and `.npmrc` files are retained; when present, omitted registry URLs retain an
unresolved registry identity instead of assuming npm's public registry.
Installed peer contexts, overrides/patch content and lifecycle outputs remain gaps.
The format/lookup boundary follows [Bun's lockfile documentation](https://bun.sh/docs/pm/lockfile)
and the [Bun 1.3.14 native reader](https://github.com/oven-sh/bun/blob/bun-v1.3.14/src/install/lockfile/bun.lock.zig)
with its [configuration version definition](https://github.com/oven-sh/bun/blob/bun-v1.3.14/src/install/ConfigVersion.zig).
Config version 0 uses the same text-v1 package lookup; accepting it does not bypass
manifest/lock validation. Unknown configuration versions are rejected.

`poetry-lock` reads Poetry lock version 2.1 with legacy `[tool.poetry]` manifests,
using Poetry and poetry-core **2.1.1** in an isolated Python interpreter. Set up
collector tooling once (these commands install collector tooling only):

```sh
uv venv .readiness/toolchains/poetry --python python3
uv pip install --python .readiness/toolchains/poetry/bin/python poetry==2.1.1
npm run readiness -- collect-batch --input content/readiness/lock-sdk-batch.json
```

Python must provide `tomllib` (3.11+). `READINESS_POETRY_PYTHON` can select another
interpreter with the same pinned Poetry/core versions. Toolchain versions and the
helper digest participate in cache identity. The helper uses the
[native Locker](https://github.com/python-poetry/poetry/blob/2.1.1/src/poetry/packages/locker.py)
to verify the manifest content hash and read all locked packages; native
`Package.satisfies` checks names, constraints and sources. No Poetry CLI, plugin,
consumer install, build, solver or backend runs. Replay needs retained JSON only,
without Python or Poetry. A conditional integration test exercises the real reader
when the tooling interpreter is available. The readiness workflow provisions this
reader before tests and refresh; local checks should install it too.

Every group, extra declaration, marker and candidate wheel/sdist hash is retained.
The graph preserves matching alternatives with their conditions, without selecting
a target environment or claiming an installed distribution hash. Each locked group has separate package occurrences, so transitive edges stay in
their selected group. Non-main groups are development scope. PEP 621 manifests and direct/local/git dependencies are
explicitly rejected by this first boundary; it does not run local metadata hooks.
Build-backend dependencies, native libraries and release provenance remain gaps.
Both adapters use collection registration, bounded batches, retry, evidence-checked
cache reuse and offline replay. Their profiles remain partial and hardfork-unassessed.
