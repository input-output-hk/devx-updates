# Selected catalog collections

## Chain-data query services

`query-service-batch.json` selects AdaStat's separately locked backend/frontend
and Cardano GraphQL's production server and API/background module. No service,
database, application build or chain compatibility test runs.

| Consumer | Selected roots | Scope and remaining boundaries |
| --- | --- | --- |
| AdaStat | `adastat-backend` and `adastat-frontend`, each manifest 2.0.0 with its own pnpm v9 lock | Default-branch source, without verified stable-release or hosted-deployment correspondence. The separate AdaStat Indexer, PostgreSQL schema/data, API/WebSocket deployments, Mithril and content gateways need integration evidence. Built bundles and native/WASM assets remain unverified. |
| Cardano GraphQL | `@cardano-graphql/server` and `@cardano-graphql/api-cardano-db-hasura`, manifest/tag 9.1.0, Classic Yarn lock | Pinned Yarn 1.22.22 supplies native workspace links; root orchestration, CLI and client packages remain unselected audit records. Hasura, db-sync/PostgreSQL, node metrics, submit-api, token metadata, Mithril and the index-service container remain separate integration boundaries. Generated code, offline-mirror tarballs and Nix/container artifacts require provenance. |

All three profiles use `all-lockfile-targets` and remain partial source
reconstructions. Native workspace metadata is captured offline with project/user
rc files, delegated Yarn binaries and lifecycle scripts disabled. It describes
workspace range matches, not installed hoisting or peer bindings. Manifest scope
is retained; ambiguous matches and potentially applicable resolution overrides
remain gaps. No service edges, capabilities or readiness claims are inferred.

```sh
node --import tsx scripts/readiness/cli.ts collect-batch --input content/readiness/query-service-batch.json --limit 3
```

## Hardware signing and wallet batch

`signing-batch.json` adds production signing consumers and a developer wallet,
using the immutable source revisions already selected by discovery. No application
build, browser installation, signing operation or network compatibility test runs.

| Consumer | Selected roots | Scope and remaining boundaries |
| --- | --- | --- |
| Cardano HW CLI | `cardano-hw-cli` 1.19.1, Classic Yarn v1 lock | Tag/manifest version agrees, but the manifest's embedded commit field differs from the selected revision. Node/pkg binaries, USB/HID assets, CSL WASM, Ledger/Trezor/Keystone firmware and cardano-cli interoperability need verification. Retain the Trezor postinstall patch as an artifact boundary. |
| Cardano Dev Wallet | `cardano-wallet` 0.0.0 in `webext`, npm v3 lock | Default-branch source, without a verified browser-store release mapping. All declarations are development dependencies, including CSL and message-signing WASM imported by the wallet implementation. Preserve native development scope; the generated extension's runtime bundle still needs inventory. Blockfrost/Ogmios/Kupo deployments and Plutip remain separate boundaries. |
| Bursa CLI/library/signer | `github.com/blinklabs-io/bursa`, root Go module | v0.19.0 source; Go 1.26.8, Linux/amd64, cgo disabled, workspace off, all module packages and test metadata. Configured Vault/SOPS/cloud signers, PKCS#11 and PostgreSQL watermarks need separate integration evidence. |
| Bursa headless wallet | `github.com/blinklabs-io/bursa/ui`, separate `ui/go.mod` | Same source tag, separate module selection: its declared Bursa/Dingo versions differ from current standalone roots. Default headless scope excludes webview/cgo, nftmedia and integration tags. The tracked embedded HTML is only a pre-build placeholder; published desktop/mobile artifacts, built UI assets and enabled node/bootstrap settings remain unverified. |
| Bursa wallet frontend and connector | `bursa-wallet-ui` and `bursa-connector` in separate npm v3 locks | Web package has no version; connector is 0.1.0. Preserve declared dependency scopes (connector declarations are development-only). Hardware browser transports and generated/embedded artifacts require review. |

JavaScript profiles use `all-lockfile-targets` and remain partial source
reconstructions. Complete Go metadata applies only to its declared platform,
build-tag and package scope. It is not a successful compile/test or readiness
claim. Native selections from each module remain distinct; no upstream checkout
substitutes for the versions selected by its consumer. Original Lucid is not a
standalone root. Existing owner-run review tasks are unchanged.

```sh
node --import tsx scripts/readiness/cli.ts collect-batch --input content/readiness/signing-batch.json --limit 2
```

## Enterprise and API application batch

`application-batch.json` adds three production service roots: enterprise
transaction/query access, an MCP server, and a self-hosted chain-data API.
Selections use already discovered immutable source revisions and retain complete
lock inputs. No package installation or application scripts run.

| Consumer | Selected production root | Source/configuration caveat |
| --- | --- | --- |
| ODATANO | `@odatano/core`, npm root `.` | Tag/manifest 1.9.0 versus lock root 1.7.10; runtime, optional, development and peer declarations agree. Preserve the lock version. Router and wallet applications, generated CDS models, SAP deployment, HSM/native PKCS#11 artifacts and configured chain backends remain separate boundaries. |
| Cardano MCP | `cardano-mcp` | Manifest 0.1.0 on default-branch source; Yarn 1.22.22 / Classic v1 lock. Demo/documentation roots are excluded. External providers/indexers, the invoked Aiken executable, serialization WASM and supported release/deployment mapping remain unresolved. |
| Blockfrost (`blockfrost`) | `blockfrost-backend-ryo` | Tag/manifest 6.8.0; Yarn 3.6.3 / metadata v6. The run-your-own backend is the catalog's Blockfrost source and the hosted API runs it; the deployed hosted release is not identified. Node/db-sync, PostgreSQL extensions, token metadata, optional Mithril and built container/Nix inventories require separate evidence. |

All profiles use `all-lockfile-targets` and remain partial source reconstructions.
Retained source and authored gaps record the production configuration and artifact
boundaries. They establish no capability or compatibility findings.

The same inspection considered `x402-cardano`. Its discovered default-branch source
has an upstream x402 README and core TypeScript `x402` 0.6.6 manifest with EVM/Solana
dependencies. A Cardano-specific production root/release has not been verified, so
no generic root/example lock substitutes for that scope. Retained manifests and an
artifact gap request the correct branch/release and entry points before collection.
Original Lucid remains excluded from standalone collection.

```sh
node --import tsx scripts/readiness/cli.ts collect-batch --input content/readiness/application-batch.json --limit 3
```

Successful requests register for refresh. Existing owner-run review packets are
independent; this batch does not launch reviews or infer service relationships.

## Initial catalog batch

`catalog-batch.json` records explicit source/configuration choices for a bounded
phase-3 rollout. Revisions come from the existing discovery snapshot. Package
names and lock formats were checked in manifests at those exact revisions.
These are source reconstructions; none establishes the contents of published
artifacts, deployed configurations, or hardfork compatibility.

| Tool | Selected production root | Source/configuration caveat |
| --- | --- | --- |
| Cardano Peer Connect | `@fabianbormann/cardano-peer-connect` | v1.2.21 matches root manifest/lock version 1.2.21; npm v3 lock, all lockfile targets |
| Helios | `@helios-lang/compiler` | Manifest version 0.17.33 on the discovered default branch; no stable GitHub release identified; pnpm v9 lock |
| Minswap SDK | `@minswap/sdk` | v0.5.0 matches root manifest 0.5.0; pnpm v9 lock and pnpm 9.10.0 declared in package manifest |
| Weld | `@ada-anvil/weld` in `core` | Core manifest/lock version 0.7.0 at the plugin release `@ada-anvil/weld-plugin-hodei@0.0.10`; not a verified release mapping for core; npm v3 workspace lock |
| Dingo | `github.com/blinklabs-io/dingo` | v0.84.0; Linux/amd64, cgo disabled, all module packages and tests; go.mod requires Go 1.26.8 and recommends toolchain 1.26.9; the collector prohibits automatic toolchain downloads |

JavaScript locks include development and optional selections; they do not prove
installed platform applicability. Runtime services, protocol boundaries, native
bundles, and capability reviews remain unresolved. Collection failures are kept
in `data/readiness/collection-queue.json` and the tool's resolution gaps.

Run `npm run readiness -- collect-batch --input content/readiness/catalog-batch.json
--limit 2` to advance a small batch. Use `--tools id,id` for an individual retry.
If source discovery changes a selected revision, verify the new manifests before
updating the request. See `docs/READINESS-OPERATIONS.md` for resume semantics.

## Higher-level workflow batch

`workflow-batch.json` prioritizes missing user workflows over collector convenience,
as recorded in `docs/HARDFORK-READINESS.md`. The existing batch already includes
transaction SDKs and wallet connectors; this batch adds a wallet application,
governance application, another transaction framework, Hydra workflows, and a
multi-DEX consumer. This is a coverage selection, not an adoption ranking.

| Tool / workflow | Selected production root | Pinned source/configuration caveat |
| --- | --- | --- |
| Lace / mobile wallet, signing and sending | `lace-mobile` in `apps/lace-mobile` | `lace-mobile@2.4.0` matches manifest and npm v3 workspace-lock version 2.4.0. Browser-extension, installed iOS/Android native dependencies, hardware devices, and hosted provider configurations remain outside this profile. |
| GovTool / governance actions and wallet interaction | `@govtool/frontend` in `govtool/frontend` | Repository release v2.0.36 contains frontend manifest/lock version 2.0.29; retain both identities. npm v3 frontend scope only; the Haskell backend, metadata service, deployment flags, container inventory, and postinstall patches are unresolved boundaries. |
| Evolution SDK / transaction construction | `@evolution-sdk/evolution` in `packages/evolution` | Manifest version 0.6.0 at `@evolution-sdk/devnet@3.0.21`; the tag belongs to devnet and does not establish the SDK's published release. pnpm v9 lock, pnpm 9.0.0 declared. Provider integrations and direct chain-sensitive implementation need review. |
| Hydra SDK / Head interaction and transaction construction | `@hydra-sdk/core`, `@hydra-sdk/transaction`, `@hydra-sdk/bridge` | Core tag/manifest 1.5.0; transaction 1.2.3 and bridge 2.0.2 share that source revision without independently verified release mappings. pnpm v9 lock produced under declared pnpm 10.5.2. Hydra node deployments, network configuration, and WASM build correspondence remain unresolved. |
| Dexter / multi-DEX swaps and pool queries | `@indigo-labs/dexter` | Manifest/npm v3 lock version 5.4.9 on discovered default-branch source; no stable GitHub release identified. DEX contracts, hosted provider deployments, and enabled integrations require separate evidence. |

All five profiles use the all-lockfile-targets scope. Package closures do not
establish installed platform selection, published artifacts, runtime integration
coverage, or hardfork compatibility. No install or project build scripts run.
Missing and ambiguous workspace identities remain resolution gaps. Unsupported
production roots such as Blaze's main SDK remain queued for adapter work; its
nested WASM Cargo manifest must not stand in for whole-SDK coverage.

Run `node --import tsx scripts/readiness/cli.ts collect-batch --input
content/readiness/workflow-batch.json --limit 2` to advance the batch, or select
one request with `--tools lace --limit 1`. Validate and replay separately before
regenerating reports and committing the milestone.

## Yarn wallet and SDK batch

`yarn-batch.json` extends production coverage into an unsupported package manager
instead of substituting incidental npm/Cargo manifests. These roots add web and
full-node desktop wallets, wallet-oriented transaction construction, native/WASM
bindings, and an SDK using several chain-data providers.

| Tool / workflow | Selected production root | Pinned source/configuration caveat |
| --- | --- | --- |
| AdaLite / web wallet and server | `adalite-app`, `adalite-server` | Repository/root package 7.0.2, application manifest has no version, server manifest 6.18.1. Yarn 4.17.1 / lock metadata 10. Collection is blocked by conflicting lock identity: `js-tokens` declares `0.0.0-use.local` but resolves to `npm:4.0.0`. No profile is accepted; the request remains retryable pending corrected, verified source. Root build orchestration, deployed backend/providers and hardware-wallet behavior remain unassessed. |
| Daedalus / full-node desktop wallet | `daedalus` | Source tag and manifest 11.5.0; declared Yarn 1.22.21, Classic v1 lock. JavaScript closure only: Nix inputs, bundled cardano-node/cardano-wallet, Electron/native rebuild output and platform installers need separate collection. |
| TyphonJS / wallet transaction construction | `@stricahq/typhonjs` | Source tag/manifest 4.0.0; Yarn 4.13.0 / lock metadata 8. Published package correspondence and direct transaction/serialization behavior need evidence. This is the library profile, not a Typhon wallet deployment. |
| Cometa / native-backed transaction SDK | `@biglup/cometa` | Source tag/manifest 1.2.0; Classic v1 lock, producing Yarn version unspecified. The manifest has no runtime npm dependencies; README/build scripts describe compiled, compressed and inlined libcardano-c WASM. The native runtime is an unresolved bundled-artifact boundary, not a dependency-free compatibility pass. |
| Cardano Web3 / query and transaction SDK | `cardano-web3-js` | Source tag/manifest 2.3.4; Classic v1 lock, producing Yarn version unspecified. Declared Koios/Kupo/Ogmios clients and cardano-wasm-libs are captured; actual provider deployments and WASM artifact correspondence need separate review. |

All captures retain exact source, manifest and lock evidence without installing
dependencies. Classic declarations and modern workspace manifest scopes remain
distinct; missing selectors, optional platform conditions, peer bindings, opaque
sources and release correspondence remain visible gaps. Modern Yarn registry
locators retain their registry identity and cache checksums are not tarball hashes.

Run `node --import tsx scripts/readiness/cli.ts collect-batch --input
content/readiness/yarn-batch.json --limit 2`, or select individual tools with
`--tools`. Successful requests register for scheduled native refresh; other work
stays pending or retryable. The operation remains local until separately reviewed
publication.

## Additional wallets and contract workflows

`wallet-batch.json` selects five more higher-level consumers at already discovered
immutable revisions. Every request explicitly names its npm lock and production
package paths. `rootPaths` are relative to that lock (`.` means its root); names
and paths must both match. This disambiguates Cardano Connect with Wallet's React
package from the same-named monorepo orchestration root. Unselected lock records
remain retained, but are not added as production roots.

| Consumer | Selected package paths | Source/configuration caveat |
| --- | --- | --- |
| Nami | `.` / `nami-wallet` | Default-branch source, no stable release identified. Manifest 3.9.6, npm lock 3.9.5; dependency declarations agree. Manifest declares Yarn 1.22.21, while README documents npm installation. The committed npm graph is one source reconstruction; the authoritative release lock, browser bundle, vendored signing WASM and provider deployment remain unresolved. |
| Yoroi mobile | `.` / `yoroi-v2`, relative to `mobile/package-lock.json` | Source tag v7.0.5 and mobile manifest 7.0.5, lock root 7.0.4; dependency declarations agree. Expo/native iOS and Android output, patches, hardware wallets and runtime providers need separate evidence. Repository scripts and other applications are not selected roots. |
| Veridian Wallet | `.` / `veridian-wallet` | Source tag, manifest and lock agree on 1.2.2. Capacitor native builds, KERIA, witnesses and deployed services remain outside the npm graph; the sample dApp is not an application root. |
| Marlowe TS SDK | `packages/runtime/lifecycle`, `packages/wallet`, `packages/language/core/v1` | Selected `@marlowe.io` packages and source tag are 0.4.0-beta; retain prerelease identity. Root declares npm 9.3.1. Marlowe Runtime/backend deployments and wallet configuration need review; documentation, examples and testing packages are not selected roots. |
| Cardano Connect with Wallet | `core`, `react` | Source tag `cardano-connect-with-wallet-v0.2.22`; core manifest 0.2.12 vs lock 0.2.11, React manifest 0.2.22 vs lock 0.2.21. Dependency declarations agree in both. Preserve lock versions and release discrepancies; injected wallets, peer connections and enabled browser/mobile integrations need separate review. |

All five use npm v3 locks and `all-lockfile-targets`. No package installation or
consumer build scripts run. These partial profiles do not prove shipped artifact
identity, enabled capabilities or hardfork compatibility. Manifest/lock version
differences remain explicit gaps instead of being silently corrected.

```sh
node --import tsx scripts/readiness/cli.ts collect-batch --input content/readiness/wallet-batch.json --limit 2
```

Use `--tools` to bound an individual run; validate and replay before reports and
publication. Existing manually launched reviews remain separate; the owner guide
is [Run the prepared reviews](../../docs/RUN-PREPARED-REVIEWS.md).

## Wallet SDK, provider and application batch

`sdk-batch.json` follows the higher-level workflow priority. Cardano JS SDK is the
main gap: collect its production wallet, transaction construction, dApp connector
and governance packages, extending Yarn support to metadata v6 instead of
substituting a convenient lower-level package. Four complementary consumers add
provider-client, DEX, permission-wallet and application-connector context.

| Consumer | Selected production roots | Pinned source/configuration caveat |
| --- | --- | --- |
| Cardano JS SDK | `@cardano-sdk/wallet`, `@cardano-sdk/tx-construction`, `@cardano-sdk/dapp-connector`, `@cardano-sdk/governance` | Selected manifest versions 0.56.0, 0.29.1, 0.13.31 and 0.11.34, respectively, at hardware-ledger tag 0.17.0. That tag does not establish release correspondence for the selected packages. Yarn 3.2.1 / metadata v6; retain all 22 workspaces but exclude orchestration/e2e/service packages from selected roots. Hardware devices, deployed providers, patches and installed peer bindings remain unresolved. |
| Blockfrost JS | `@blockfrost/blockfrost-js` | Tag and manifest 6.2.0, declared Yarn 4.0.0 / metadata v8. Client lock coverage does not establish hosted Blockfrost versions, selected network/configuration, or serialization WASM artifact correspondence. |
| GeniusYield Lucid SDK | `@geniusyield/sdk` | Manifest 2.0.0 on pinned default-branch source, with pnpm v9 lock and Lucid Evolution dependency. No stable release mapping identified; deployed DEX contracts, provider configuration and enabled transaction workflows need separate evidence. |
| Epora | `permission-wallet-dapp` in `code/dApp` | Manifest 0.1.0 on pinned default-branch source; pnpm 10.0.0 / lock v9. The application root includes frontend/server packages, but does not resolve the separate Aiken validator closure, generated blueprints, database or hosted chain proxies. README describes a default Preprod deployment; no live deployment has been checked. |
| NEWM Cardano dApp Wallet Connector | `@newm.io/cardano-dapp-wallet-connector` | Manifest 1.5.5 versus npm v2 lock root 1.5.4, on pinned default-branch source. Preserve the discrepancy. Runtime browser wallet choices and injected providers remain unreviewed. |

All five requests retain `all-lockfile-targets` scope. No dependencies are
installed and no consumer scripts, Yarn plugins or release binaries are executed.
These are partial source reconstructions; capabilities and hardfork compatibility
remain unassessed. Blaze/Bun, PyCardano/Poetry and native Haskell/Scala workflows
remain explicit adapter priorities, not evidence of low risk.

```sh
node --import tsx scripts/readiness/cli.ts collect-batch --input content/readiness/sdk-batch.json --limit 2
```

Use `--tools cardano-js-sdk --limit 1` for the larger monorepo capture. Keep
source-backed gaps, queue failures and release distinctions visible. Existing
discovery/challenge review packets remain owner-launched work.

The Cardano JS SDK capture also exposes unresolved descriptors and workspace
declaration/lock differences. Root resolutions, six patch locators, package
extensions and plugins are retained as inputs requiring separate verification;
the collector does not guess their installed effects. The NEWM connector's
dependency declarations agree with its lock despite the root version discrepancy.
The two pnpm application/SDK importers also match their manifest declarations.

## Bun/Poetry production SDK batch

`lock-sdk-batch.json` selects Blaze's SDK, transaction, wallet and query packages,
plus PyCardano's root library. It continues the higher-level consumer priority.

- Blaze revision `0499975bfa4fdb324f2185657a7f17e4cea35aa1` is tagged
  `@blaze-cardano/blueprint@0.9.1`. Selected manifests are SDK 0.3.3, tx 0.15.4,
  wallet 0.6.3 and query 0.6.4; the tag does not prove these independent published
  artifacts. Bun 1.3.14's text lock retains all 21 workspaces and their dependencies,
  including examples/e2e/tooling outside the four selected roots. Overrides,
  optional peers, native/WASM outputs, providers and wallet configuration remain
  explicit review boundaries. The nested UPLC Cargo lock is not whole-SDK coverage.
- PyCardano revision `0445f3079cb8b356f48c13e040d00e25326ce59e`, tag `v0.19.2`,
  has matching library manifest 0.19.2 and a Poetry 2.1 lock produced by Poetry
  2.1.1. Collect its root `poetry.lock` with the verified manifest content hash;
  the example/full-stack lock is a separate project. All 95 locked distributions,
  main/dev/docs groups, markers, extras and candidate files stay retained.
  Python/platform selection, build-backend and native cryptography/serialization
  artifacts, configured chain backends and published package provenance remain open.

See [operations](../../docs/READINESS-OPERATIONS.md#bun-and-poetry-production-sdk-inputs)
for collector tooling. Both requests use `all-lockfile-targets`; neither executes
consumer scripts nor claims hardfork compatibility.


## SundaeSwap follow-up and Lucid Evolution handoff

`sundae-batch.json` records the attempted production roots: core 3.2.0,
gummiworm 2.0.16, taste-test 4.0.0 and yield-farming 4.0.0 at pinned revision
`9f032253e0711e3a308068ed55cc85b5de71a348` (core 3.2.0 tag). Its text-v1 Bun lock
uses config-version 0, now supported. Eight workspace manifests and configuration
are retained, but **collection fails**: core's math ranges are `^0.5.0` in the
lock versus `^0.5.1` in the manifest, and gummiworm's core ranges are `^3.0.0`
versus `^3.2.0`, each in runtime/development declarations. No native profile was
created. Keep the failed job retryable; select a new immutable upstream revision
with aligned inputs before resubmitting. Do not edit its lock to force collection.

Lucid Evolution's existing registered pnpm profile covers
`@lucid-evolution/lucid` 0.8.3. Production sources are now prepared for owner-run
review via [the handoff](./capability-reviews.md). This is Lucid Evolution,
not original Lucid, which the owner excluded from active readiness work.
No consumer reviews are launched automatically and no capability/compatibility
claims are imported by preparation.

## Payment service and application batch

`payment-app-batch.json` selects two higher-level production workflows from
pinned public sources. Both use pnpm project lock graphs; no consumer install,
build, plugin or deployment was executed.

| Consumer | Selected roots | Source/configuration boundary |
| --- | --- | --- |
| Masumi | `masumi-payment-service`, `admin-frontend` (both manifest 0.1.0) | Pinned default branch, not a stable release. Backend and frontend build separately. Seven importers retain distinct Mesh versions, peer selections, overrides and two patches. Hydra-host images, Aiken contract builds, generated clients, native/WASM artifacts and deployed services need separate evidence. |
| Sokosumi | `web` (0.1.0), `@sokosumi/core` (version unknown) | Repository tag `macos-v1.1.1` does not establish web/Core release identity. Thirteen project importers are retained, but Apple, CMO and CLI applications are not selected roots. The pnpm 12.11.2 environment document is retained separately with a toolchain gap; its packages do not enter application exposure. |

Masumi's two manifest/lock specifier differences match declared overrides;
eleven additional payment-core lock dependencies match manifest peers. Sokosumi's
project dependency declarations match its manifests. These checks do not verify
installed peer activation, patch application or built distribution provenance.
Source and configuration evidence makes the remaining boundaries reviewable.

Sokosumi's payment/registry clients use configured URLs and a network. No verified
service edge to the collected Masumi revision is inferred. Masumi's lock includes
`lucid-cardano`; retain that dependency as consumer evidence while original Lucid
remains excluded from standalone work. Both tools now have prepared capability
review packets in [the handoff](./capability-reviews.md), including additional
production workflow source. All seven owner-run packets remain pending; the five
earlier packet IDs are unchanged. Preparation does not import capability findings
or identify deployed service versions.
