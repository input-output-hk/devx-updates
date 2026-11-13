# Application/component-to-tool dependencies

Public-source desk observations checked **2026-10-22**.
Sources and their observation dates appear below.

This table records **57 relationships** for **13 of 20 applications**;
the remaining **7** have no established concrete tool relationship in this research.
All 20 retain explicit gaps. These are counts of documented relationships, not verified production stacks.

## Reading the relationships

Each row applies only to its named component. Manifests establish package dependencies;
documentation and examples retain their stated evidence strength. Optional, testing,
prototype and historical records do not establish production adoption. Missing matches
remain unknown. Application ranks order the review; transaction counts are not tool
scoring inputs, while recorded relationships contribute to graph degree.

## Manifest relationships

| Application | Component | Tool | Relationship | Evidence | Source | Qualification |
| --- | --- | --- | --- | --- | --- | --- |
| Minswap | DEX V2 contracts | Aiken | written-in | manifest | [S002](#source-s002), [S003](#source-s003) | V2 only; aggregate activity has no version split. |
| Minswap | Published SDK | Lucid (@spacebudz/lucid) | declares-dependency | manifest | [S004](#source-s004) | Published SDK dependency; production adoption unverified. |
| Minswap | Published SDK | Blockfrost JS | declares-dependency | manifest | [S004](#source-s004) | Dependency and available adapter; active provider unknown. |
| Minswap | Published SDK | Maestro TypeScript SDK | declares-dependency | manifest | [S004](#source-s004) | Dependency and available adapter; active provider unknown. |
| Minswap | Published SDK | Ogmios client/schema | declares-dependency | manifest | [S004](#source-s004) | Client dependency; production deployment unverified. |
| Dano Finance | CLMM SDK | Evolution SDK (@evolution-sdk/evolution) | declares-dependency | manifest | [S009](#source-s009) | CLMM only; manifest/README versions differ. |
| Dano Finance | CLMM SDK | Ogmios client/schema | declares-dependency | manifest | [S009](#source-s009) | CLMM component; production infrastructure unknown. |
| WingRiders | Rapid DEX contracts | Aiken | written-in | manifest | [S011](#source-s011) | Rapid only; not an original/V1 DEX claim. |
| WingRiders | Rapid DEX SDK core | Mesh (@meshsdk/core, core-csl) | declares-dependency | manifest | [S012](#source-s012) | Rapid only. |
| SundaeSwap | V3+ contracts | Aiken | written-in | manifest | [S015](#source-s015), [S016](#source-s016) | V3 and onward; not older V1 contracts. |
| SundaeSwap | Core SDK | Blaze SDK/data | declares-dependency | manifest | [S017](#source-s017) | SDK source snapshot; no historical activity attribution. |
| Splash Protocol | Plutarch validator package | Plutarch | declares-dependency | manifest | [S020](#source-s020) | Specific validator package; version split unknown. |
| Splash Protocol | V3 validator package | Aiken | written-in | manifest | [S021](#source-s021) | Specific validator package; version split unknown. |
| Splash Protocol | TypeScript builder package | Cardano Multiplatform Library | declares-dependency | manifest | [S022](#source-s022) | Browser/node packages; no whole-application inference. |
| Splash Protocol | Rust bloom-cardano-agent | CML fork | declares-dependency | manifest | [S023](#source-s023) | Pinned fork in agent manifest. |
| Splash Protocol | Rust chain-sync package | Pallas networking | declares-dependency | manifest | [S024](#source-s024) | Chain-sync component; hosted provider unknown. |
| Splash Protocol | Testing package | Lucid Evolution | declares-test-dependency | test-manifest | [S025](#source-s025) | Testing only; no production swap-builder inference. |
| Spectrum Finance | Published on-chain package | Plutarch | declares-dependency | historical-manifest | [S030](#source-s030) | Historical source; current deployed version unknown. |
| Spectrum Finance | Published Haskell cardano-tx SDK | Cardano API | declares-dependency | historical-manifest | [S031](#source-s031) | Historical SDK; production use unverified. |
| Spectrum Finance | Published Haskell cardano-tx SDK | Plutus chain-index/ledger libraries | declares-dependency | historical-manifest | [S031](#source-s031) | Library dependencies; deployed indexer unknown. |
| Liqwid Finance | liqwid-plutarch-extra library | Plutarch | declares-dependency | manifest | [S037](#source-s037) | Team library; complete lending stack unverified. |
| UVerify | Java backend | Cardano Client Lib | declares-dependency | manifest | [S041](#source-s041) | Bloxbean dependency; production configuration unknown. |
| UVerify | Java backend | Yaci Store | declares-dependency | manifest | [S041](#source-s041) | Indexer starters; README also describes indexing. |
| UVerify | Java backend adapters | Blockfrost | supports-integration | manifest | [S041](#source-s041) | Backend adapter; active production provider unknown. |
| UVerify | Java backend adapters | Koios | supports-integration | manifest | [S041](#source-s041) | Backend adapter; active production provider unknown. |
| UVerify | Java backend adapters | Ogmios | supports-integration | manifest | [S041](#source-s041) | Backend adapter; active production provider unknown. |
| UVerify | Examples sandbox bootstrap | Mesh (@meshsdk/core, wallet) | declares-test-dependency | test-manifest | [S043](#source-s043) | Sandbox/bootstrap only. |
| Masumi | Payment V2 contracts | Aiken | written-in | manifest | [S044](#source-s044) | Snapshot after volume window; deployment version unknown. |
| Masumi | Payment service root | Lucid (lucid-cardano) | declares-dependency | manifest | [S045](#source-s045) | Root declaration; not proof of every transaction path. |
| Masumi | Payment service root | Cardano Serialization Lib | declares-dependency | manifest | [S045](#source-s045) | Root declaration; source snapshot after volume window. |
| Masumi | Payment service root | Blockfrost JS | declares-dependency | manifest | [S045](#source-s045) | Provider client; production configuration unknown. |
| Masumi | Payment-source-v2 package | Mesh (@meshsdk/core, core-cst) | declares-dependency | manifest | [S046](#source-s046) | V2 component. |
| MuesliSwap | Concentrated-pool on-chain package | Plutus Tx | declares-dependency | manifest | [S048](#source-s048) | Haskell component; not an orderbook-language claim. |
| MuesliSwap | Orderbook package | OpShin | written-in | manifest | [S049](#source-s049) | Orderbook component only. |
| MuesliSwap | Orderbook package | PyCardano | declares-dependency | manifest | [S049](#source-s049) | Pinned package references a branch; no locked resolution inferred. |
| MuesliSwap | Orderbook package | Ogmios Python client | declares-dependency | manifest | [S049](#source-s049) | Client integration; production endpoint unknown. |
| MuesliSwap | Concentrated-pool off-chain package | MuesliSwap Cardano Python utilities | declares-dependency | manifest | [S050](#source-s050) | Team utility package; component only. |
| MuesliSwap | Orderbook test dependencies | pytest | declares-test-dependency | test-manifest | [S049](#source-s049) | Testing dependency; no tests run in this review. |
| MuesliSwap | Orderbook test dependencies | Hypothesis | declares-test-dependency | test-manifest | [S049](#source-s049) | Property-testing dependency; not a devnet. |

## Documented integrations, examples and testing

| Application | Component | Tool | Relationship | Evidence | Source | Qualification |
| --- | --- | --- | --- | --- | --- | --- |
| Minswap | SDK syncer adapter | Minswap self-hosted syncer | supports-integration | documentation | [S005](#source-s005) | Supported alternative; not a confirmed production configuration. |
| Minswap | DEX V2 test workflow | Aiken check | documents-testing | documentation | [S003](#source-s003) | Tests documented; not executed in this review. |
| Dano Finance | CLMM SDK provider example | Kupo | supports-integration | documentation | [S010](#source-s010) | Kupmios example; production provider unverified. |
| Dano Finance | CLMM SDK provider example | Ogmios | supports-integration | documentation | [S010](#source-s010) | Kupmios example; not a separate activity attribution. |
| WingRiders | DEX state adapter | Blockfrost | supports-integration | documentation | [S014](#source-s014) | Adapter capability; production provider unknown. |
| WingRiders | DEX state adapter | WingRiders dex-serializer | uses-library | documentation | [S014](#source-s014) | State deserialization in this adapter. |
| WingRiders | DEX adapter installation | Cardano Multiplatform Library | documents-integration | documentation | [S014](#source-s014) | Installation requirement; no whole-application inference. |
| WingRiders | DEX adapter swap example | Lucid | example-uses | example | [S014](#source-s014) | Example only; original frontend builder unknown. |
| SundaeSwap | SDK swap guide | Blockfrost | example-uses | example | [S018](#source-s018) | Guide configuration; production provider unknown. |
| SundaeSwap | SDK pool-query guide | SundaeSwap API | supports-integration | documentation | [S018](#source-s018) | Documented pool-query interface. |
| SundaeSwap | Contract benchmark scaffolding | Lucid | documents-testing | documentation | [S015](#source-s015) | Testing scaffolding only. |
| CSWAP | Token-swap contracts | Aiken | project-doc-claim | documentation | [S026](#source-s026) | Some forward-looking wording; deployment/source match unverified. |
| Liqwid Finance | Published testing utilities | plutarch-quickcheck | documents-testing | documentation | [S036](#source-s036) | Team tooling; not confirmed production dependency. |
| Liqwid Finance | Published testing utilities | plutarch-context-builder | documents-testing | documentation | [S036](#source-s036) | Test/context tooling; no production-stack inference. |
| Liqwid Finance | Published testing utilities | plutarch-unit | documents-testing | documentation | [S036](#source-s036) | Unit-test tooling; not a devnet. |
| MuesliSwap | Optional market-maker bot | Blockfrost | documents-integration | documentation | [S052](#source-s052) | Bot requirement; not the production DEX provider. |

## Prototype and historical indexed documentation

| Application | Component | Tool | Relationship | Evidence | Source | Qualification |
| --- | --- | --- | --- | --- | --- | --- |
| Hosky | P.o.O claim prototype | cardano-cli | invokes | prototype-doc | [S001](#source-s001) | Beta prototype; production distribution unverified. |
| Wayup | Marketplace build-tx interface | Anvil transaction-building API | documents-integration | historical-indexed-doc | [S034](#source-s034) | Indexed primary docs; direct URL returned 404. |

## Gaps across the researched applications

Unknown tools are not encoded as dependency edges; the sources below identify the inspected material.

| Application | Relationships recorded | Remaining uncertainty | Inspected sources |
| --- | --- | --- | --- |
| Hosky | 1 | Production distribution language, SDK, provider/indexer and devnet unknown; public prototype only. | [S001](#source-s001) |
| Minswap | 7 | Production provider and dedicated devnet unknown; application activity has no contract-version split. | [S002](#source-s002), [S003](#source-s003), [S004](#source-s004), [S005](#source-s005) |
| 5am.earth | 0 | Language, SDK, provider/indexer and devnet unknown; Cardano anchoring alone identifies no concrete tool. | [S006](#source-s006), [S007](#source-s007), [S008](#source-s008) |
| Dano Finance | 4 | Contract language and devnet unknown; CLMM sources do not establish lending stack; Evolution version mismatch unresolved. | [S009](#source-s009), [S010](#source-s010) |
| WingRiders | 6 | Original/V1 language, production builder/provider and devnet unknown; Rapid evidence stays component-specific. | [S011](#source-s011), [S012](#source-s012), [S013](#source-s013), [S014](#source-s014) |
| SundaeSwap | 5 | Production provider and devnet unknown; V1/V3 activity split absent. | [S015](#source-s015), [S016](#source-s016), [S017](#source-s017), [S018](#source-s018) |
| Midnight | 0 | Cardano distribution language, SDK, provider/indexer and devnet unknown; Compact not assigned to distribution. | [S019](#source-s019) |
| Splash Protocol | 6 | Production provider/devnet and contract-version activity split unknown; test dependencies are not production dependencies. | [S020](#source-s020), [S021](#source-s021), [S022](#source-s022), [S023](#source-s023), [S024](#source-s024), [S025](#source-s025) |
| CSWAP | 1 | SDK, provider/indexer and devnet unknown; documented Aiken claim lacks deployment/source confirmation. | [S026](#source-s026) |
| FMS by Trivolve | 0 | Language, SDK, provider/indexer and devnet unknown; no specific dependency established. | [S027](#source-s027), [S028](#source-s028) |
| Indianchain by Trivolve | 0 | Language, SDK, provider/indexer and devnet unknown; planned integration does not establish deployed tools. | [S029](#source-s029) |
| Spectrum Finance | 3 | Current contract/SDK deployment, provider/indexer and devnet unknown; historical packages only. | [S030](#source-s030), [S031](#source-s031) |
| VyFinance | 0 | Language, SDK, provider/indexer and devnet unknown; registry forks excluded as stack evidence. | [S032](#source-s032), [S033](#source-s033) |
| Wayup | 1 | Current implementation and endpoint unverified; language, internal SDK, provider/indexer and devnet unknown. | [S034](#source-s034) |
| Shadowbook | 0 | Registry-label/product identity unresolved; language, SDK, provider/indexer and devnet unknown. | [S035](#source-s035) |
| Liqwid Finance | 4 | Current lending implementation, off-chain SDK, provider/indexer and devnet unknown; team libraries only. | [S036](#source-s036), [S037](#source-s037) |
| Indigo Protocol | 0 | Current language, SDK, provider/indexer and devnet unresolved; unavailable historical contract URL excluded from edges. | [S038](#source-s038), [S039](#source-s039) |
| UVerify | 6 | Validator source language and production provider unknown; Plutus V3 is a target; local sandbox is documented. | [S040](#source-s040), [S041](#source-s041), [S042](#source-s042), [S043](#source-s043) |
| Masumi | 5 | Dedicated devnet and historical deployment configuration unknown; current repository postdates transaction window. | [S044](#source-s044), [S045](#source-s045), [S046](#source-s046), [S047](#source-s047) |
| MuesliSwap | 8 | Production provider, dedicated devnet and component activity split unknown; optional bot kept separate. | [S048](#source-s048), [S049](#source-s049), [S050](#source-s050), [S051](#source-s051), [S052](#source-s052) |

## Sources

All sources were checked **2026-10-22**. Links pin source commits where available;
commit dates and access limitations are retained below. Unpinned websites and
indexed/unavailable material have weaker provenance than pinned manifests.

<a id="source-s001"></a>
- **S001** [Hosky claims prototype README](https://github.com/HOSKYToken/poo-genericClaim/blob/bdceb649269240a9f1c5f891f48c0df351fcb71a/README.md).

<a id="source-s002"></a>
- **S002** [minswap/minswap-dex-v2 / aiken.toml](https://github.com/minswap/minswap-dex-v2/blob/c3293ad435792ba502f5a2b1691c6736e5f167e6/aiken.toml).

<a id="source-s003"></a>
- **S003** [minswap/minswap-dex-v2 / README.md](https://github.com/minswap/minswap-dex-v2/blob/c3293ad435792ba502f5a2b1691c6736e5f167e6/README.md).

<a id="source-s004"></a>
- **S004** [minswap/sdk / package.json](https://github.com/minswap/sdk/blob/ee95d4317414ae1fe2cdc40549e14a1e185dcf59/package.json).

<a id="source-s005"></a>
- **S005** [minswap/sdk / README.md](https://github.com/minswap/sdk/blob/ee95d4317414ae1fe2cdc40549e14a1e185dcf59/README.md).

<a id="source-s006"></a>
- **S006** [Official website](https://5am.earth/).

<a id="source-s007"></a>
- **S007** [Official case study](https://5am.earth/case-studies/).

<a id="source-s008"></a>
- **S008** [Public organisation proposal repository](https://github.com/5am-earth/cardano-budget-2026).

<a id="source-s009"></a>
- **S009** [dano-finance/clmm-sdk / package.json](https://github.com/dano-finance/clmm-sdk/blob/0416dc1f3531ce77eec7664ea3947f192a3aca40/package.json).

<a id="source-s010"></a>
- **S010** [dano-finance/clmm-sdk / README.md](https://github.com/dano-finance/clmm-sdk/blob/0416dc1f3531ce77eec7664ea3947f192a3aca40/README.md).

<a id="source-s011"></a>
- **S011** [WingRiders/rapid-dex-contracts / aiken.toml](https://github.com/WingRiders/rapid-dex-contracts/blob/6afe522d9116e81359e30cc202feab5f3d0b8e60/aiken.toml).

<a id="source-s012"></a>
- **S012** [WingRiders/rapid-dex / sdk/core/package.json](https://github.com/WingRiders/rapid-dex/blob/9e4921e373796b0d3feaf73a342246e24231cde5/sdk/core/package.json).

<a id="source-s013"></a>
- **S013** [WingRiders/rapid-dex / sdk/core/README.md](https://github.com/WingRiders/rapid-dex/blob/9e4921e373796b0d3feaf73a342246e24231cde5/sdk/core/README.md).

<a id="source-s014"></a>
- **S014** [WingRiders/dex-blockfrost-adapter / README.md](https://github.com/WingRiders/dex-blockfrost-adapter/blob/99a1c7106dfcc2c32ff62345991608f222ad92a8/README.md).

<a id="source-s015"></a>
- **S015** [SundaeSwap-finance/sundae-contracts / README.md](https://github.com/SundaeSwap-finance/sundae-contracts/blob/be33466b7dbe0f8e6c0e0f46ff23737897f45835/README.md).
  Commit date: 2025-02-26T16:47:57Z.

<a id="source-s016"></a>
- **S016** [SundaeSwap-finance/sundae-contracts / aiken.toml](https://github.com/SundaeSwap-finance/sundae-contracts/blob/be33466b7dbe0f8e6c0e0f46ff23737897f45835/aiken.toml).
  Commit date: 2025-02-26T16:47:57Z.

<a id="source-s017"></a>
- **S017** [SundaeSwap-finance/sundae-sdk / packages/core/package.json](https://github.com/SundaeSwap-finance/sundae-sdk/blob/9f032253e0711e3a308068ed55cc85b5de71a348/packages/core/package.json).
  Commit date: 2026-10-17T02:13:44Z.

<a id="source-s018"></a>
- **S018** [SundaeSwap-finance/sundae-sdk / docs/guides/core/index.md](https://github.com/SundaeSwap-finance/sundae-sdk/blob/9f032253e0711e3a308068ed55cc85b5de71a348/docs/guides/core/index.md).
  Commit date: 2026-10-17T02:13:44Z.

<a id="source-s019"></a>
- **S019** [Official NIGHT launch and redemption guide](https://midnight.network/blog/guide-to-the-night-token-launch-and-redemption).

<a id="source-s020"></a>
- **S020** [splashprotocol/splash-core / plutarch-validators/plutarch-validators.cabal](https://github.com/splashprotocol/splash-core/blob/a185ee8668414fc2bafc232fb74533bc135137fd/plutarch-validators/plutarch-validators.cabal).
  Commit date: 2026-09-13T19:14:29Z.

<a id="source-s021"></a>
- **S021** [splashprotocol/splash-core / validators_v3/aiken.toml](https://github.com/splashprotocol/splash-core/blob/a185ee8668414fc2bafc232fb74533bc135137fd/validators_v3/aiken.toml).
  Commit date: 2026-09-13T19:14:29Z.

<a id="source-s022"></a>
- **S022** [splashprotocol/protocol-sdk / packages/builder/package.json](https://github.com/splashprotocol/protocol-sdk/blob/ebc01e8871284c6ac450c35e8d5e3bcab7d5fb56/packages/builder/package.json).
  Commit date: 2025-11-29T09:03:49Z.

<a id="source-s023"></a>
- **S023** [splashprotocol/splash-offchain-multiplatform / bloom-cardano-agent/Cargo.toml](https://github.com/splashprotocol/splash-offchain-multiplatform/blob/f23126425063d9d4dbf5ba07401f97737f99d3aa/bloom-cardano-agent/Cargo.toml).
  Commit date: 2026-07-16T10:06:39Z.

<a id="source-s024"></a>
- **S024** [splashprotocol/splash-offchain-multiplatform / cardano-chain-sync/Cargo.toml](https://github.com/splashprotocol/splash-offchain-multiplatform/blob/f23126425063d9d4dbf5ba07401f97737f99d3aa/cardano-chain-sync/Cargo.toml).
  Commit date: 2026-07-16T10:06:39Z.

<a id="source-s025"></a>
- **S025** [splashprotocol/splash-offchain-multiplatform / splash-testing-cardano/package.json](https://github.com/splashprotocol/splash-offchain-multiplatform/blob/f23126425063d9d4dbf5ba07401f97737f99d3aa/splash-testing-cardano/package.json).
  Commit date: 2026-07-16T10:06:39Z.

<a id="source-s026"></a>
- **S026** [CSWAP capabilities documentation](https://docs.cswap.fi/cswap-platform/cswap-dex-capabilities).

<a id="source-s027"></a>
- **S027** [Trivolve official product portfolio](https://trivolvetech.com/).

<a id="source-s028"></a>
- **S028** [Cardano Foundation June update](https://cardanofoundation.org/blog/june-2026-activities).

<a id="source-s029"></a>
- **S029** [Team-authored IndianChain proposal](https://projectcatalyst.io/funds/14/cardano-use-cases-partners-and-products/indianchain-indian-governments-10m-settlements-on-cardano).

<a id="source-s030"></a>
- **S030** [spectrum-finance/cardano-dex-contracts / cardano-dex-contracts-onchain/cardano-dex-contracts-onchain.cabal](https://github.com/spectrum-finance/cardano-dex-contracts/blob/c25c8ab7daf52871d29efd00d3dac236cc9d6a36/cardano-dex-contracts-onchain/cardano-dex-contracts-onchain.cabal).
  Commit date: 2023-08-23T16:41:29Z.

<a id="source-s031"></a>
- **S031** [spectrum-finance/cardano-dex-sdk-haskell / cardano-tx/cardano-tx.cabal](https://github.com/spectrum-finance/cardano-dex-sdk-haskell/blob/39d53d78fce1cf20b78b10bff9a9fc73b747cf2a/cardano-tx/cardano-tx.cabal).
  Commit date: 2023-06-02T08:57:20Z.

<a id="source-s032"></a>
- **S032** [VyFinance official docs](https://docs.vyfi.io/).

<a id="source-s033"></a>
- **S033** [Officially linked GitHub organisation](https://github.com/vyfi).

<a id="source-s034"></a>
- **S034** [Anvil Wayup integration documentation (indexed content)](https://dev.ada-anvil.io/wayup).
  Access limitation: Search-indexed primary text; direct page returned 404.

<a id="source-s035"></a>
- **S035** [DexHunter primary ShadowBook product mention](https://landing.dexhunter.io/).

<a id="source-s036"></a>
- **S036** [Liqwid-Labs/liqwid-libs / README.md](https://github.com/Liqwid-Labs/liqwid-libs/blob/27c4b50edc39128a0506ed3ef0e065b270377def/README.md).
  Commit date: 2024-08-23T13:46:39Z.

<a id="source-s037"></a>
- **S037** [Liqwid-Labs/liqwid-libs / liqwid-plutarch-extra/liqwid-plutarch-extra.cabal](https://github.com/Liqwid-Labs/liqwid-libs/blob/27c4b50edc39128a0506ed3ef0e065b270377def/liqwid-plutarch-extra/liqwid-plutarch-extra.cabal).
  Commit date: 2024-08-23T13:46:39Z.

<a id="source-s038"></a>
- **S038** [Indigo official documentation](https://docs.indigoprotocol.io/).

<a id="source-s039"></a>
- **S039** [Historical official contract URL](https://github.com/IndigoProtocol/indigo-smart-contracts).
  Access limitation: Direct GitHub and API 404; historical primary content indexed.

<a id="source-s040"></a>
- **S040** [UVerify-io/uverify-backend / README.md](https://github.com/UVerify-io/uverify-backend/blob/cb1fb2ecef3cee3fe63138898a99c7a5ae1e9865/README.md).
  Commit date: 2026-09-24T06:24:54Z.

<a id="source-s041"></a>
- **S041** [UVerify-io/uverify-backend / pom.xml](https://github.com/UVerify-io/uverify-backend/blob/cb1fb2ecef3cee3fe63138898a99c7a5ae1e9865/pom.xml).
  Commit date: 2026-09-24T06:24:54Z.

<a id="source-s042"></a>
- **S042** [UVerify-io/uverify-examples / README.md](https://github.com/UVerify-io/uverify-examples/blob/a822d08748e7373c8f25195185bad8a99cfa40ba/README.md).
  Commit date: 2026-07-04T18:12:26Z.

<a id="source-s043"></a>
- **S043** [UVerify-io/uverify-examples / sandbox/bootstrap/package.json](https://github.com/UVerify-io/uverify-examples/blob/a822d08748e7373c8f25195185bad8a99cfa40ba/sandbox/bootstrap/package.json).
  Commit date: 2026-07-04T18:12:26Z.

<a id="source-s044"></a>
- **S044** [masumi-network/masumi-payment-service / smart-contracts/payment-v2/aiken.toml](https://github.com/masumi-network/masumi-payment-service/blob/7cb71dba4445a330d179a3859f4fe7be0b43b23e/smart-contracts/payment-v2/aiken.toml).
  Commit date: 2026-10-21T09:28:20Z.

<a id="source-s045"></a>
- **S045** [masumi-network/masumi-payment-service / package.json](https://github.com/masumi-network/masumi-payment-service/blob/7cb71dba4445a330d179a3859f4fe7be0b43b23e/package.json).
  Commit date: 2026-10-21T09:28:20Z.

<a id="source-s046"></a>
- **S046** [masumi-network/masumi-payment-service / packages/payment-source-v2/package.json](https://github.com/masumi-network/masumi-payment-service/blob/7cb71dba4445a330d179a3859f4fe7be0b43b23e/packages/payment-source-v2/package.json).
  Commit date: 2026-10-21T09:28:20Z.

<a id="source-s047"></a>
- **S047** [masumi-network/masumi-payment-service / README.md](https://github.com/masumi-network/masumi-payment-service/blob/7cb71dba4445a330d179a3859f4fe7be0b43b23e/README.md).
  Commit date: 2026-10-21T09:28:20Z.

<a id="source-s048"></a>
- **S048** [MuesliSwapTeam/muesliswap-liquidity-efficient-dex / concentrated-lp/onchain/concentrated-liquidity-pools.cabal](https://github.com/MuesliSwapTeam/muesliswap-liquidity-efficient-dex/blob/d0d96b9d518bb36d970be91145e86cd348712e86/concentrated-lp/onchain/concentrated-liquidity-pools.cabal).
  Commit date: 2024-08-08T12:01:29Z.

<a id="source-s049"></a>
- **S049** [MuesliSwapTeam/muesliswap-liquidity-efficient-dex / orderbook/pyproject.toml](https://github.com/MuesliSwapTeam/muesliswap-liquidity-efficient-dex/blob/d0d96b9d518bb36d970be91145e86cd348712e86/orderbook/pyproject.toml).
  Commit date: 2024-08-08T12:01:29Z.

<a id="source-s050"></a>
- **S050** [MuesliSwapTeam/muesliswap-liquidity-efficient-dex / concentrated-lp/offchain/pyproject.toml](https://github.com/MuesliSwapTeam/muesliswap-liquidity-efficient-dex/blob/d0d96b9d518bb36d970be91145e86cd348712e86/concentrated-lp/offchain/pyproject.toml).
  Commit date: 2024-08-08T12:01:29Z.

<a id="source-s051"></a>
- **S051** [MuesliSwapTeam/muesliswap-liquidity-efficient-dex / README.md](https://github.com/MuesliSwapTeam/muesliswap-liquidity-efficient-dex/blob/d0d96b9d518bb36d970be91145e86cd348712e86/README.md).
  Commit date: 2024-08-08T12:01:29Z.

<a id="source-s052"></a>
- **S052** [MuesliSwapTeam/muesliswap-market-maker / README.md](https://github.com/MuesliSwapTeam/muesliswap-market-maker/blob/d15eee7c5759404fe09633bdb0ecbbc920c52f45/README.md).
  Commit date: 2025-09-18T20:07:04Z.
