# Projects by attributable transaction activity

As of **2026-10-22**. Source generated **2026-10-16**; captured 2026-10-22.
Reporting window, verbatim: `2026-09-16T21:45:52` to `2026-10-16T21:44:37`
(~6 epochs (30 days); chain epoch 662). Timestamps have no timezone suffix.

[Frozen JSON](volume-source/tx-stats.json) · [Provenance](volume-source/README.md) ·
[Immutable upstream source](https://github.com/cardano-foundation/cardano-org/blob/85eb8c314fab8af16f6318764750da45161ae8b9/src/data/tx-stats.json) ·
[Attribution methodology](https://cardano.org/docs/get-involved/tx-rankings/)

## Method

All application and metadata rows are retained separately and ordered by descending
transaction count. Ties use competition ranks, ordered by source label. Activity
prioritises stack research; counts may overlap and do not measure users, value,
code quality or SDK-generated transactions.

## Application ranking

56 rows from `appStats`. Stack cells cover on-chain language, SDK, provider/indexer
and devnet. Unknown means not researched in this table, not that no dependency exists.

| Rank | Application | Source label | Transactions | Stack | Evidence |
| --- | --- | --- | --- | --- | --- |
| 1 | Hosky | `hosky` | 1,724,962 | Public claim prototype: Python + cardano-cli; production unknown | [Desk findings](#stack-research-hosky) |
| 2 | Minswap | `minswap` | 149,547 | V2: Aiken; SDK: Lucid; Blockfrost/Maestro adapters | [Desk findings](#stack-research-minswap) |
| 3 | 5am.earth | `5am.earth` | 49,928 | Cardano anchoring documented; language/SDK/provider unknown | [Desk findings](#stack-research-5am-earth) |
| 4 | Dano Finance | `dano-finance` | 49,531 | CLMM SDK: Evolution SDK, Ogmios; Kupmios documented | [Desk findings](#stack-research-dano-finance) |
| 5 | WingRiders | `wingriders` | 39,560 | Component-specific: Rapid Aiken/Mesh; DEX Blockfrost adapter | [Desk findings](#stack-research-wingriders) |
| 6 | SundaeSwap | `sundaeswap` | 28,432 | V3: Aiken; core SDK: Blaze; Blockfrost example | [Desk findings](#stack-research-sundaeswap) |
| 7 | Midnight | `midnight` | 24,610 | Cardano NIGHT redemption documented; distribution stack unknown | [Desk findings](#stack-research-midnight) |
| 8 | Splash Protocol | `splash` | 20,589 | Plutarch/Aiken contracts; CML builders; Rust/Pallas agents | [Desk findings](#stack-research-splash) |
| 9 | CSWAP | `cswap` | 20,402 | Aiken named in project docs; SDK/provider unknown | [Desk findings](#stack-research-cswap) |
| 10 | FMS by Trivolve | `fms-by-trivolve` | 19,643 | Forensic application described; implementation stack unknown | [Desk findings](#stack-research-fms-by-trivolve) |
| 11 | Indianchain by Trivolve | `indianchain-by-trivolve` | 13,694 | Trivolve/Quixy integration proposal; implementation stack unknown | [Desk findings](#stack-research-indianchain-by-trivolve) |
| 12 | Spectrum Finance | `spectrum-finance` | 9,179 | Published Plutarch contracts and Haskell SDK; current deployment unknown | [Desk findings](#stack-research-spectrum-finance) |
| 13 | VyFinance | `vyfinance` | 7,718 | Docs and public org reviewed; implementation stack unknown | [Desk findings](#stack-research-vyfinance) |
| 14 | Wayup | `wayup` | 6,741 | Indexed Anvil build-tx integration docs; current implementation unknown | [Desk findings](#stack-research-wayup) |
| 15 | Shadowbook | `shadowbook` | 3,921 | Primary product mention found; attribution and stack unresolved | [Desk findings](#stack-research-shadowbook) |
| 16 | Liqwid Finance | `liqwid-finance` | 3,376 | Published Plutarch libraries/tests; complete application stack unresolved | [Desk findings](#stack-research-liqwid-finance) |
| 17 | Indigo Protocol | `indigo-protocol` | 2,233 | Current docs reviewed; historical contract URL unavailable | [Desk findings](#stack-research-indigo-protocol) |
| 18 | UVerify | `uverify` | 1,840 | Java/Cardano Client Lib; Yaci Store; documented local devnet | [Desk findings](#stack-research-uverify) |
| 19 | Masumi | `masumi` | 1,421 | Aiken; Mesh payment components; Blockfrost; Lucid also declared | [Desk findings](#stack-research-masumi) |
| 20 | MuesliSwap | `muesliswap` | 1,075 | Component-specific Haskell/Plutus and OpShin; PyCardano/Ogmios | [Desk findings](#stack-research-muesliswap) |
| 21 | SpaceBudz | `spacebudz` | 740 | Unknown | Pending research |
| 22 | DripDropz | `dripdropz` | 738 | Unknown | Pending research |
| 23 | Iagon | `iagon` | 586 | Unknown | Pending research |
| 24 | RealFi | `realfi` | 562 | Unknown | Pending research |
| 25 | USDCx Bridge | `usdcx-bridge` | 544 | Unknown | Pending research |
| 26 | JpgStore | `jpg.store` | 492 | Unknown | Pending research |
| 27 | SaturnNFT | `saturnnft` | 343 | Unknown | Pending research |
| 28 | Lovejoin | `lovejoin` | 268 | Unknown | Pending research |
| 29 | Unfrack.it | `unfrack.it` | 260 | Unknown | Pending research |
| 30 | Fluid Tokens | `fluid-tokens` | 247 | Unknown | Pending research |
| 31 | Saturn Swap | `saturn-swap` | 222 | Unknown | Pending research |
| 32 | SingularityNET | `singularitynet` | 192 | Unknown | Pending research |
| 33 | Chilled Kongs | `chilled-kongs` | 180 | Unknown | Pending research |
| 34 | Dexhunter | `dexhunter` | 160 | Unknown | Pending research |
| 35 | Seedelf | `seedelf` | 119 | Unknown | Pending research |
| 36 | Wanchain | `wanchain` | 59 | Unknown | Pending research |
| 37 | DRepTalk | `dreptalk.com` | 53 | Unknown | Pending research |
| 38 | Lenfi | `lenfi` | 46 | Unknown | Pending research |
| 39 | Genius Yield | `genius-yield` | 26 | Unknown | Pending research |
| 40 | Intersect Budget Contracts | `intersect` | 24 | Unknown | Pending research |
| 41 | Strike Finance | `strike-finance` | 23 | Unknown | Pending research |
| 42 | TeddySwap | `teddyswap` | 21 | Unknown | Pending research |
| 43 | $USDM | `$usdm` | 20 | Unknown | Pending research |
| 44 | Disco Solaris | `disco-solaris` | 17 | Unknown | Pending research |
| 45 | L4VA Protocol | `l4va-protocol` | 13 | Unknown | Pending research |
| 46 | AdaLink | `adalink` | 10 | Unknown | Pending research |
| 47 | Book.io | `book.io` | 6 | Unknown | Pending research |
| 47 | Cardano.org | `cardano.org` | 6 | Unknown | Pending research |
| 47 | World Mobile Token | `world-mobile-token` | 6 | Unknown | Pending research |
| 50 | Plutus.Art | `plutus.art` | 4 | Unknown | Pending research |
| 51 | ADA Handle | `ada-handle` | 3 | Unknown | Pending research |
| 51 | Tokhun | `tokhun` | 3 | Unknown | Pending research |
| 53 | Generic | `generic` | 2 | Unknown | Pending research |
| 54 | Axo | `axo` | 1 | Unknown | Pending research |
| 54 | Explosif | `explosif` | 1 | Unknown | Pending research |
| 54 | Hydra | `hydra` | 1 | Unknown | Pending research |

## Research scope and activity share

Desk review covers the first twenty applications, checked **2026-10-22**.
Their **2,178,402** counts are **99.73%** of the **2,184,400** summed application counts.
This is a prioritisation statistic, not unique-network or verified-stack coverage.
Hosky's large count remains a particular gap: its public prototype does not establish
the production distribution stack.

## Stack research

The observations below apply to named components, not complete deployments.
Snapshots can postdate the activity window; missing evidence remains unknown.

<a id="stack-research-hosky"></a>
### Hosky

- Public Proof of Onboarding claims prototype is Python and invokes cardano-cli for wallet/UTxO operations and constructing/submitting asset distributions. README explicitly describes a beta proof of concept, not production software.
- This documents a team-published component, not the implementation behind the ranked Hosky distribution total. No transaction count is assigned to this prototype.
- On-chain contract language, production SDK/provider/indexer and devnet: unknown.

Sources checked:
- [Hosky claims prototype README](https://github.com/HOSKYToken/poo-genericClaim/blob/bdceb649269240a9f1c5f891f48c0df351fcb71a/README.md)

<a id="stack-research-minswap"></a>
### Minswap

- On-chain: Minswap V2 contract repository declares Aiken and aiken-lang/stdlib; README documents Aiken checks. This establishes the V2 component, not the version breakdown of the aggregate ranked transactions.
- SDK: official TypeScript SDK declares `@spacebudz/lucid`, Blockfrost, Maestro and Ogmios client/schema dependencies.
- Provider/indexer: SDK README offers Blockfrost, Maestro and a self-hosted Minswap syncer adapter. These are supported integrations; production provider selection is unknown.
- Testing: README uses `aiken check`; Preprod is documented as a deployment network. Dedicated devnet tooling is unknown; no tests or deployments were executed in this review.

Sources checked:
- [minswap/minswap-dex-v2 / aiken.toml](https://github.com/minswap/minswap-dex-v2/blob/c3293ad435792ba502f5a2b1691c6736e5f167e6/aiken.toml)
- [minswap/minswap-dex-v2 / README.md](https://github.com/minswap/minswap-dex-v2/blob/c3293ad435792ba502f5a2b1691c6736e5f167e6/README.md)
- [minswap/sdk / package.json](https://github.com/minswap/sdk/blob/ee95d4317414ae1fe2cdc40549e14a1e185dcf59/package.json)
- [minswap/sdk / README.md](https://github.com/minswap/sdk/blob/ee95d4317414ae1fe2cdc40549e14a1e185dcf59/README.md)

<a id="stack-research-5am-earth"></a>
### 5am.earth

- Official website and case study describe anchoring agricultural identity and field records on Cardano but do not identify the implementation SDK, contract language or provider.
- The located public organisation repository contains treasury proposal artifacts, not an application implementation manifest. Planned architecture or named partners do not establish deployed tooling.
- On-chain language, SDK, provider/indexer and devnet: unknown.

Sources checked:
- [Official website](https://5am.earth/)
- [Official case study](https://5am.earth/case-studies/)
- [Public organisation proposal repository](https://github.com/5am-earth/cardano-budget-2026)

<a id="stack-research-dano-finance"></a>
### Dano Finance

- Official CLMM SDK manifest declares `@evolution-sdk/evolution` and Ogmios client/schema dependencies. Do not replace this with Lucid Evolution based on third-party descriptions.
- Provider/indexer: README configures Kupmios with Kupo and Ogmios endpoints. This is a documented integration, not confirmation of the production infrastructure.
- On-chain language is unknown from inspected CLMM SDK files. An organisation fork of the Aiken standard library alone does not establish its deployed contract language.
- README describes Preprod/Mainnet support; dedicated devnet tooling unknown. The CLMM component does not establish the entire lending/trading platform stack or which component generated the ranked transactions.
- Source inconsistency: manifest pins Evolution 0.3.32 while README states 0.32.2; record both verbatim and do not assume a tested version.

Sources checked:
- [dano-finance/clmm-sdk / package.json](https://github.com/dano-finance/clmm-sdk/blob/0416dc1f3531ce77eec7664ea3947f192a3aca40/package.json)
- [dano-finance/clmm-sdk / README.md](https://github.com/dano-finance/clmm-sdk/blob/0416dc1f3531ce77eec7664ea3947f192a3aca40/README.md)

<a id="stack-research-wingriders"></a>
### WingRiders

- Rapid DEX: contract manifest declares Aiken; SDK core declares `@meshsdk/core` and `@meshsdk/core-csl`. SDK docs describe tRPC data fetching. These facts concern Rapid DEX, not all WingRiders products.
- Separate DEX adapter: README documents Blockfrost and dex-serializer with Cardano Multiplatform Library installation; Lucid appears in a swap example. Examples and adapters do not establish the production frontend stack.
- The leaderboard does not split the ranked WingRiders total by component in the captured report; no part of that total is assigned to Mesh or another SDK.
- Original/V1 DEX contract language and production provider are not established here. Dedicated devnet/testing infrastructure unknown.
- The Mesh dependency is recorded from the pinned WingRiders manifest; no application transaction count is attributed to Mesh; the recorded relationships contribute to map degree.

Sources checked:
- [WingRiders/rapid-dex-contracts / aiken.toml](https://github.com/WingRiders/rapid-dex-contracts/blob/6afe522d9116e81359e30cc202feab5f3d0b8e60/aiken.toml)
- [WingRiders/rapid-dex / sdk/core/package.json](https://github.com/WingRiders/rapid-dex/blob/9e4921e373796b0d3feaf73a342246e24231cde5/sdk/core/package.json)
- [WingRiders/rapid-dex / sdk/core/README.md](https://github.com/WingRiders/rapid-dex/blob/9e4921e373796b0d3feaf73a342246e24231cde5/sdk/core/README.md)
- [WingRiders/dex-blockfrost-adapter / README.md](https://github.com/WingRiders/dex-blockfrost-adapter/blob/99a1c7106dfcc2c32ff62345991608f222ad92a8/README.md)

<a id="stack-research-sundaeswap"></a>
### SundaeSwap

- Contract repository identifies V3 and later contracts as Aiken; it distinguishes older V1 Plutus contracts. No version split is available for the ranked count.
- Core SDK package manifest declares Blaze SDK/data dependencies. SDK guide shows a Blockfrost-backed Blaze instance and SundaeSwap API pool queries; these are documented integration choices, not a measured production provider.
- Contract README describes validator tests and Lucid testing/benchmark scaffolding. Preview examples are testnet evidence; dedicated devnet remains unknown.

Sources checked:
- [SundaeSwap-finance/sundae-contracts / README.md](https://github.com/SundaeSwap-finance/sundae-contracts/blob/be33466b7dbe0f8e6c0e0f46ff23737897f45835/README.md)
- [SundaeSwap-finance/sundae-contracts / aiken.toml](https://github.com/SundaeSwap-finance/sundae-contracts/blob/be33466b7dbe0f8e6c0e0f46ff23737897f45835/aiken.toml)
- [SundaeSwap-finance/sundae-sdk / packages/core/package.json](https://github.com/SundaeSwap-finance/sundae-sdk/blob/9f032253e0711e3a308068ed55cc85b5de71a348/packages/core/package.json)
- [SundaeSwap-finance/sundae-sdk / docs/guides/core/index.md](https://github.com/SundaeSwap-finance/sundae-sdk/blob/9f032253e0711e3a308068ed55cc85b5de71a348/docs/guides/core/index.md)

<a id="stack-research-midnight"></a>
### Midnight

- Official NIGHT launch guide describes token distribution/redemption on Cardano. It does not establish the contract language, transaction builder or indexer behind the captured Midnight application row.
- Midnight-chain Compact tooling and bridge code are not treated as evidence of the Cardano distribution stack. Contract language, SDK, provider/indexer and devnet remain unknown.

Sources checked:
- [Official NIGHT launch and redemption guide](https://midnight.network/blog/guide-to-the-night-token-launch-and-redemption)

<a id="stack-research-splash"></a>
### Splash Protocol

- Contract repository contains Plutarch validators and separate Aiken validator packages. These are component-specific observations; no contract-version allocation of ranked activity is inferred.
- TypeScript builder package depends on browser/node Cardano Multiplatform Library. Rust agent manifest also depends on a pinned CML fork; cardano-chain-sync declares Pallas networking.
- Provider/indexer: repository contains its own chain-sync/off-chain components; a production hosted provider choice is not established.
- Testing package declares Lucid Evolution. That supports a testing dependency, not a claim that Lucid Evolution builds all production swaps. Dedicated devnet remains unknown.

Sources checked:
- [splashprotocol/splash-core / plutarch-validators/plutarch-validators.cabal](https://github.com/splashprotocol/splash-core/blob/a185ee8668414fc2bafc232fb74533bc135137fd/plutarch-validators/plutarch-validators.cabal)
- [splashprotocol/splash-core / validators_v3/aiken.toml](https://github.com/splashprotocol/splash-core/blob/a185ee8668414fc2bafc232fb74533bc135137fd/validators_v3/aiken.toml)
- [splashprotocol/protocol-sdk / packages/builder/package.json](https://github.com/splashprotocol/protocol-sdk/blob/ebc01e8871284c6ac450c35e8d5e3bcab7d5fb56/packages/builder/package.json)
- [splashprotocol/splash-offchain-multiplatform / bloom-cardano-agent/Cargo.toml](https://github.com/splashprotocol/splash-offchain-multiplatform/blob/f23126425063d9d4dbf5ba07401f97737f99d3aa/bloom-cardano-agent/Cargo.toml)
- [splashprotocol/splash-offchain-multiplatform / cardano-chain-sync/Cargo.toml](https://github.com/splashprotocol/splash-offchain-multiplatform/blob/f23126425063d9d4dbf5ba07401f97737f99d3aa/cardano-chain-sync/Cargo.toml)
- [splashprotocol/splash-offchain-multiplatform / splash-testing-cardano/package.json](https://github.com/splashprotocol/splash-offchain-multiplatform/blob/f23126425063d9d4dbf5ba07401f97737f99d3aa/splash-testing-cardano/package.json)

<a id="stack-research-cswap"></a>
### CSWAP

- Project documentation names Aiken for token-swap contracts. Some wording is forward-looking; this is a project documentation claim, not a deployed-script/source match.
- Off-chain SDK, provider/indexer and devnet remain unknown. Third-party DEX adapters supporting CSWAP do not establish CSWAP using those adapters internally.

Sources checked:
- [CSWAP capabilities documentation](https://docs.cswap.fi/cswap-platform/cswap-dex-capabilities)

<a id="stack-research-fms-by-trivolve"></a>
### FMS by Trivolve

- Trivolve describes a forensic evidence-management application. Cardano Foundation separately identifies its FMS as on-chain record-integrity infrastructure.
- Neither inspected source identifies a concrete Cardano SDK, contract language, provider/indexer or devnet. These fields remain unknown; other Trivolve applications do not establish the FMS stack.

Sources checked:
- [Trivolve official product portfolio](https://trivolvetech.com/)
- [Cardano Foundation June update](https://cardanofoundation.org/blog/june-2026-activities)

<a id="stack-research-indianchain-by-trivolve"></a>
### Indianchain by Trivolve

- The team-authored Catalyst proposal describes a Trivolve/Quixy agricultural-records integration with Cardano. Planned architecture is not proof of the production implementation.
- No concrete contract-language, SDK, provider/indexer or devnet dependency was established from the inspected primary proposal. Leave those fields unknown rather than copy the FMS stack.

Sources checked:
- [Team-authored IndianChain proposal](https://projectcatalyst.io/funds/14/cardano-use-cases-partners-and-products/indianchain-indian-governments-10m-settlements-on-cardano)

<a id="stack-research-spectrum-finance"></a>
### Spectrum Finance

- Public contract package declares Plutarch and Plutus libraries. Published Haskell SDK cardano-tx package references Cardano API and Plutus chain-index/ledger packages.
- These pinned repositories are historical components; they do not establish which version or runtime generated the reporting-period transactions, or imply that activity migrated to Splash.
- Production provider/indexer and dedicated devnet remain unknown. Contract test-suite definitions exist; no tests were executed in this review.

Sources checked:
- [spectrum-finance/cardano-dex-contracts / cardano-dex-contracts-onchain/cardano-dex-contracts-onchain.cabal](https://github.com/spectrum-finance/cardano-dex-contracts/blob/c25c8ab7daf52871d29efd00d3dac236cc9d6a36/cardano-dex-contracts-onchain/cardano-dex-contracts-onchain.cabal)
- [spectrum-finance/cardano-dex-sdk-haskell / cardano-tx/cardano-tx.cabal](https://github.com/spectrum-finance/cardano-dex-sdk-haskell/blob/39d53d78fce1cf20b78b10bff9a9fc73b747cf2a/cardano-tx/cardano-tx.cabal)

<a id="stack-research-vyfinance"></a>
### VyFinance

- Official docs identify the application and link the VYFI GitHub organisation. Its inspected repository listing exposes registry/adapter forks, not a manifest establishing the application implementation.
- Contract language, SDK, provider/indexer and devnet remain unknown. Third-party integrations or forked token registries are not evidence of deployed stack dependencies.

Sources checked:
- [VyFinance official docs](https://docs.vyfi.io/)
- [Officially linked GitHub organisation](https://github.com/vyfi)

<a id="stack-research-wayup"></a>
### Wayup

- Indexed Anvil developer documentation describes a Wayup marketplace transaction-building API. Direct page retrieval returned 404 during this check; retain this as historical indexed documentation, not a currently validated endpoint.
- The integration indicates an Anvil transaction-building interface, not the SDK or contract language used internally. Current SDK, language, provider/indexer and devnet remain unknown.

Sources checked:
- [Anvil Wayup integration documentation (indexed content)](https://dev.ada-anvil.io/wayup)

<a id="stack-research-shadowbook"></a>
### Shadowbook

- DexHunter official landing page names a Cardano ShadowBook order-book product, marked coming soon. This alone does not identify the implementation behind the captured Shadowbook registry label.
- Contract language, SDK, provider/indexer and devnet remain unknown. Similarly named Arbitrum projects were excluded; no repository identity is assumed from name similarity.

Sources checked:
- [DexHunter primary ShadowBook product mention](https://landing.dexhunter.io/)

<a id="stack-research-liqwid-finance"></a>
### Liqwid Finance

- Liqwid Labs public monorepo declares Plutarch libraries and exposes Plutarch-oriented QuickCheck, context-builder and unit-testing utilities.
- This establishes team-maintained tooling components, not the complete current deployed lending implementation. No per-transaction adoption claim follows from a shared team repository.
- Off-chain application SDK, production provider/indexer and dedicated devnet remain unknown from inspected files.

Sources checked:
- [Liqwid-Labs/liqwid-libs / README.md](https://github.com/Liqwid-Labs/liqwid-libs/blob/27c4b50edc39128a0506ed3ef0e065b270377def/README.md)
- [Liqwid-Labs/liqwid-libs / liqwid-plutarch-extra/liqwid-plutarch-extra.cabal](https://github.com/Liqwid-Labs/liqwid-libs/blob/27c4b50edc39128a0506ed3ef0e065b270377def/liqwid-plutarch-extra/liqwid-plutarch-extra.cabal)

<a id="stack-research-indigo-protocol"></a>
### Indigo Protocol

- Official docs describe Indigo applications and protocol versions but do not establish a concrete current stack in the inspected introduction.
- Historically indexed official indigo-smart-contracts material describes Haskell/Plutus tooling, but direct GitHub and API requests returned 404. Treat it as unavailable historical evidence, not a verified current repository or deployed version.
- Current contract language, off-chain SDK, provider/indexer and devnet remain unresolved; historical code is not silently applied to V3.

Sources checked:
- [Indigo official documentation](https://docs.indigoprotocol.io/)
- [Historical official contract URL](https://github.com/IndigoProtocol/indigo-smart-contracts)

<a id="stack-research-uverify"></a>
### UVerify

- Pinned backend README describes Java/Spring Boot, Plutus V3 validators and Yaci Store indexing. Plutus V3 is an execution target, not a source-language identification.
- Maven manifest declares Bloxbean Cardano Client Lib, Yaci Store starters and Blockfrost/Koios/Ogmios backend adapters. README documents Blockfrost/Koios primary backend choices; production configuration is unknown.
- Examples README documents a Docker local Cardano devnet. Bootstrap manifest declares Mesh; this is a sandbox/bootstrap dependency, not attribution of production certificate transactions to Mesh.
- The Mesh dependency above is reported from the pinned manifest without application transaction attribution; recorded relationships contribute to map degree.

Sources checked:
- [UVerify-io/uverify-backend / README.md](https://github.com/UVerify-io/uverify-backend/blob/cb1fb2ecef3cee3fe63138898a99c7a5ae1e9865/README.md)
- [UVerify-io/uverify-backend / pom.xml](https://github.com/UVerify-io/uverify-backend/blob/cb1fb2ecef3cee3fe63138898a99c7a5ae1e9865/pom.xml)
- [UVerify-io/uverify-examples / README.md](https://github.com/UVerify-io/uverify-examples/blob/a822d08748e7373c8f25195185bad8a99cfa40ba/README.md)
- [UVerify-io/uverify-examples / sandbox/bootstrap/package.json](https://github.com/UVerify-io/uverify-examples/blob/a822d08748e7373c8f25195185bad8a99cfa40ba/sandbox/bootstrap/package.json)

<a id="stack-research-masumi"></a>
### Masumi

- Aiken manifests identify payment and registry contracts. Root manifest declares Blockfrost JS, Cardano Serialization Lib and lucid-cardano; payment-source-v2 separately declares Mesh core components.
- These are current repository components. The inspected head is dated 21 October, after the volume window; no inference is made that all dependencies were present during that window.
- Provider: Blockfrost configuration is documented. README links test and Hydra operations guides; this pass has not established a particular dedicated devnet configuration or executed any tests.
- The Mesh dependency follows a pinned package manifest; no portion of Masumi transactions is attributed to Mesh; recorded relationships contribute to map degree.

Sources checked:
- [masumi-network/masumi-payment-service / smart-contracts/payment-v2/aiken.toml](https://github.com/masumi-network/masumi-payment-service/blob/7cb71dba4445a330d179a3859f4fe7be0b43b23e/smart-contracts/payment-v2/aiken.toml)
- [masumi-network/masumi-payment-service / package.json](https://github.com/masumi-network/masumi-payment-service/blob/7cb71dba4445a330d179a3859f4fe7be0b43b23e/package.json)
- [masumi-network/masumi-payment-service / packages/payment-source-v2/package.json](https://github.com/masumi-network/masumi-payment-service/blob/7cb71dba4445a330d179a3859f4fe7be0b43b23e/packages/payment-source-v2/package.json)
- [masumi-network/masumi-payment-service / README.md](https://github.com/masumi-network/masumi-payment-service/blob/7cb71dba4445a330d179a3859f4fe7be0b43b23e/README.md)

<a id="stack-research-muesliswap"></a>
### MuesliSwap

- Liquidity-efficient DEX repository contains a Haskell/Plutus concentrated-pool package and a separate OpShin orderbook package. Do not reduce this to a single contract language.
- Orderbook manifest declares OpShin, PyCardano and an Ogmios Python dependency; concentrated-pool off-chain code declares team Cardano Python utilities.
- Separate official market-maker README requires Blockfrost and describes Preprod configuration. This establishes an optional bot integration, not the production DEX provider.
- Contract README documents pytest and testnet examples; a dedicated devnet remains unknown. No contract component is assigned the aggregate ranked transaction total.

Sources checked:
- [MuesliSwapTeam/muesliswap-liquidity-efficient-dex / concentrated-lp/onchain/concentrated-liquidity-pools.cabal](https://github.com/MuesliSwapTeam/muesliswap-liquidity-efficient-dex/blob/d0d96b9d518bb36d970be91145e86cd348712e86/concentrated-lp/onchain/concentrated-liquidity-pools.cabal)
- [MuesliSwapTeam/muesliswap-liquidity-efficient-dex / orderbook/pyproject.toml](https://github.com/MuesliSwapTeam/muesliswap-liquidity-efficient-dex/blob/d0d96b9d518bb36d970be91145e86cd348712e86/orderbook/pyproject.toml)
- [MuesliSwapTeam/muesliswap-liquidity-efficient-dex / concentrated-lp/offchain/pyproject.toml](https://github.com/MuesliSwapTeam/muesliswap-liquidity-efficient-dex/blob/d0d96b9d518bb36d970be91145e86cd348712e86/concentrated-lp/offchain/pyproject.toml)
- [MuesliSwapTeam/muesliswap-liquidity-efficient-dex / README.md](https://github.com/MuesliSwapTeam/muesliswap-liquidity-efficient-dex/blob/d0d96b9d518bb36d970be91145e86cd348712e86/README.md)
- [MuesliSwapTeam/muesliswap-market-maker / README.md](https://github.com/MuesliSwapTeam/muesliswap-market-maker/blob/d15eee7c5759404fe09633bdb0ecbbc920c52f45/README.md)

## Metadata-label activity (separate)

73 rows from `metadataLabelStats`, including unverified labels.
These are metadata usages, not additional application projects. The source verification flag
indicates registry recognition; it does not verify an application or its tooling stack.
Descriptions are retained from the source. Unspecified descriptions remain unknown.

| Rank | Label | Source description | Transactions | Registry verified |
| --- | --- | --- | --- | --- |
| 1 | `674` | CIP-0020 - Transaction message/comment metadata | 200,365 | Yes |
| 2 | `0` | Unknown | 57,072 | No |
| 3 | `1` | Unknown | 20,067 | No |
| 4 | `2` | Unknown | 17,598 | No |
| 5 | `3` | Unknown | 17,591 | No |
| 6 | `4` | Unknown | 17,587 | No |
| 7 | `1804` | Unknown | 13,657 | No |
| 8 | `721` | CIP-0025 - NFT Token Standard | 4,495 | Yes |
| 9 | `8746` | Unknown | 993 | No |
| 10 | `675` | Unknown | 585 | No |
| 11 | `55534473` | Unknown | 582 | No |
| 12 | `103251` | Unknown | 417 | No |
| 13 | `100` | Unknown | 384 | No |
| 14 | `1997` | Unknown | 348 | No |
| 15 | `1694` | Voltaire - additional metadata for governance, provided in a separate transaction | 207 | Yes |
| 16 | `6868` | Unknown | 154 | No |
| 17 | `31415` | Unknown | 146 | No |
| 18 | `6862` | Unknown | 66 | No |
| 19 | `8461` | Unknown | 64 | No |
| 20 | `55555` | Unknown | 62 | No |
| 21 | `7` | Unknown | 47 | No |
| 22 | `1967` | nut.link metadata oracles registry | 45 | Yes |
| 23 | `1000` | Unknown | 44 | No |
| 23 | `1002` | Unknown | 44 | No |
| 23 | `1003` | Unknown | 44 | No |
| 23 | `1004` | Unknown | 44 | No |
| 23 | `1005` | Unknown | 44 | No |
| 23 | `1007` | Unknown | 44 | No |
| 23 | `1008` | Unknown | 44 | No |
| 23 | `1009` | Unknown | 44 | No |
| 23 | `1707` | Unknown | 44 | No |
| 32 | `55534472` | Unknown | 32 | No |
| 33 | `6749` | Unknown | 30 | No |
| 34 | `1815` | Unknown | 28 | No |
| 34 | `3692` | CIP-0149 - Optional DRep compensation | 28 | Yes |
| 36 | `42` | Unknown | 24 | No |
| 37 | `2000` | Unknown | 22 | No |
| 37 | `2001` | Unknown | 22 | No |
| 37 | `2002` | Unknown | 22 | No |
| 40 | `202310` | Unknown | 19 | No |
| 41 | `2718` | Unknown | 18 | No |
| 42 | `17` | CIP-XXXX - On-chain surveys and polls metadata | 16 | Yes |
| 42 | `747264` | Unknown | 16 | No |
| 42 | `777` | CIP-0027 - Royalties Standard | 16 | Yes |
| 42 | `8414` | claimpaign.com campaigns | 16 | Yes |
| 46 | `1695` | Unknown | 14 | No |
| 46 | `37326` | Eternl Pro - license metadata | 14 | Yes |
| 48 | `7746` | Unknown | 12 | No |
| 49 | `7788` | Unknown | 11 | No |
| 49 | `80808081` | Unknown | 11 | No |
| 51 | `1100` | Unknown | 6 | No |
| 51 | `1971` | Unknown | 6 | No |
| 53 | `1984` | CIP-0171 - On-chain Smart Contract Bytecode Verification | 5 | Yes |
| 54 | `1854` | CIP-146 Multi-signatures wallet registration | 4 | Yes |
| 54 | `309` | CIP-0190 - Proof of Existence record | 4 | Yes |
| 54 | `5800` | Unknown | 4 | No |
| 54 | `73` | Unknown | 4 | No |
| 54 | `839` | Agora - Proposal creation metadata | 4 | Yes |
| 59 | `8745` | Unknown | 3 | No |
| 60 | `19526` | Unknown | 2 | No |
| 60 | `61284` | CIP-0015 - Catalyst registration | 2 | Yes |
| 60 | `61285` | CIP-0015 - Catalyst witness | 2 | Yes |
| 60 | `8675309` | Unknown | 2 | No |
| 64 | `1668` | Begin Wallet: dApp rating record from dApp Store | 1 | Yes |
| 64 | `19670001` | Unknown | 1 | No |
| 64 | `20` | Unknown | 1 | No |
| 64 | `529` | Tokenance - Producer-signed Proof of Origin record | 1 | Yes |
| 64 | `5757` | Unknown | 1 | No |
| 64 | `6676` | Maya Protocol - Cross-chain swap memo (bifrost observer) | 1 | Yes |
| 64 | `73115` | Unknown | 1 | No |
| 64 | `83741` | Unknown | 1 | No |
| 64 | `8413` | commitproof.com lets you prove what you knew and when | 1 | Yes |
| 64 | `8747` | Unknown | 1 | No |

## Gaps and next research

| Gap | State as of 2026-10-22 |
| --- | --- |
| Application stacks | 20 rows desk-reviewed; other rows unresearched. Component/deployment gaps stated above. |
| Applications absent from source | Unmeasured; absence is not zero activity. |
| Unattributable network volume | Not derived: per-project overlaps prevent subtraction of summed counts from the network total. |
| Non-responsive projects | No contact outcomes established by this desk-ranking exercise. |
| SDK attribution | No transaction counts attributed directly to SDKs. |

The source network total is **2,609,711 transactions** for the same period.
A unique attributed/unattributed split needs deduplicated attribution data, not this ranking.
