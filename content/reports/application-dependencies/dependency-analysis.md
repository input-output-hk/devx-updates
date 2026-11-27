# Application dependency analysis

Desk observations checked **2026-10-22** cover the first twenty applications in the
[frozen activity ranking](projects-by-volume.md): 57 component-to-tool relationships
across thirteen applications, with gaps for all twenty. The
[dependency table](application-tool-dependencies.md) records sources and qualifications.
The activity window is 16 September–16 October 2026; later source snapshots do not
establish which tools generated those transactions. Application counts may overlap.

## Distinct component stacks

Minswap V2, WingRiders Rapid and SundaeSwap V3+ identify Aiken validators, while their
inspected SDKs declare Lucid, Mesh and Blaze respectively. Minswap also declares
Blockfrost, Maestro and Ogmios packages. Sources:
[Minswap S002–S005](application-tool-dependencies.md#source-s002),
[WingRiders S011–S012](application-tool-dependencies.md#source-s011),
[SundaeSwap S015–S017](application-tool-dependencies.md#source-s015).

Stacks also differ within projects. MuesliSwap has a Plutus Tx concentrated-pool
component and an OpShin orderbook with PyCardano and an Ogmios Python client.
Splash combines Plutarch/Aiken validators, CML builders, a CML fork in a Rust agent
and Pallas chain-sync networking. Sources:
[MuesliSwap S048–S050](application-tool-dependencies.md#source-s048),
[Splash S020–S024](application-tool-dependencies.md#source-s020).

**Interpretation:** validator compilation, transaction building, data access and
testing form separate dependency boundaries. A change in one component does not
establish an application-wide migration or a version split in reported activity.

## Shared integration boundaries

Aiken recurs in Minswap V2, WingRiders Rapid, SundaeSwap V3+, Splash V3 and Masumi V2
manifests. CSWAP's Aiken reference is a documentation claim with an unverified
deployment/source match. Off-chain libraries vary across Lucid, Mesh, Blaze,
Evolution SDK, Cardano Client Lib and PyCardano. Sources:
[manifest relationships](application-tool-dependencies.md#manifest-relationships),
[CSWAP S026](application-tool-dependencies.md#source-s026).

Provider interfaces recur too: Minswap declares multiple clients; Dano documents
Kupo/Ogmios; UVerify declares Cardano Client Lib, Yaci Store and Blockfrost/Koios/Ogmios
adapters. Active production endpoints remain unknown. Sources:
[S004–S005](application-tool-dependencies.md#source-s004),
[S009–S010](application-tool-dependencies.md#source-s009),
[S040–S041](application-tool-dependencies.md#source-s040).

**Interpretation:** shared dependencies suggest compatibility work may span several
packages. They do not establish market share, common deployed versions, vulnerabilities
or single points of failure. Multiple adapters do not demonstrate tested failover
or interchangeable providers.

## Evidence strength and unresolved gaps

Testing relationships include Splash/Lucid Evolution, UVerify/Mesh, SundaeSwap/Lucid
benchmark scaffolding and Liqwid's Plutarch utilities. Hosky provides a cardano-cli
claim prototype; Spectrum's Plutarch/Haskell packages are historical; Wayup's Anvil
record is indexed documentation whose direct URL returned 404. These do not establish
current production stacks. Sources:
[S025](application-tool-dependencies.md#source-s025),
[S043](application-tool-dependencies.md#source-s043),
[S015](application-tool-dependencies.md#source-s015),
[S036](application-tool-dependencies.md#source-s036),
[S001](application-tool-dependencies.md#source-s001),
[S030–S031](application-tool-dependencies.md#source-s030),
[S034](application-tool-dependencies.md#source-s034).

No concrete tool relationship was established for 5am.earth, Midnight's Cardano
distribution, FMS, Indianchain, VyFinance, Shadowbook or Indigo. Missing evidence
is not absence of dependencies or a non-responsive classification. The
[gaps table](application-tool-dependencies.md#gaps-across-the-researched-applications)
records each application's limitations, including unknown deployment versions,
providers and component-level transaction attribution. Masumi's inspected 21 October
snapshot postdates the activity window; Dano's manifest/README version mismatch
remains unresolved.

The [26 October map snapshot](changelog.md) retains unverified baseline links.
Its degree counts combine manifest, optional, testing and historical relationships;
[preliminary scores](package-importance-report.md) therefore describe recorded
connectivity rather than production reliance. Our strongest finding is the existence
of shared component-level integration boundaries; their production exposure and
ecosystem-wide criticality remain unquantified.
