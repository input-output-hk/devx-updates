# cardano-client-lib and the Dijkstra hard fork: diagnosis and remediation

Assessed 2026-11-11 against **cardano-node 11.2.0 / Dijkstra protocol version 12**, with **cardano-client-lib (CCL)
0.7.3, 0.8.0-pre7, master and the unmerged `feat/ledger-cbor` branch**. Like the
[ledgerjs diagnostic](LEDGERJS-DIJKSTRA-DIAGNOSTIC.md), this records reproducible findings (ADR-2, ADR-3), not a
readiness declaration. Evidence: [`content/readiness/dijkstra-runs/2026-11-11-ccl/`](../content/readiness/dijkstra-runs/2026-11-11-ccl/README.md).

**No released CCL knows Dijkstra, but most Conway-style transactions it builds still go through after the fork.** The
node re-reads a Conway transaction as Dijkstra, and plain payments, metadata, Plutus V3 spends and the Conway-era
certificates are accepted. What breaks in released code:

1. **QuickTx stake (de)registration is rejected.** `registerStakeAddress` and `deregisterStakeAddress` emit the legacy
   certificates (types 0 and 1) that Dijkstra removed. The node answers `EraMismatch`. Every CCL release is affected,
   and so is every tool that registers stake keys this way.
2. **Reading Dijkstra transactions silently loses data.** `Transaction.deserialize` drops sub-transactions, direct
   deposits and the other new body keys without an error. The transaction id CCL then computes is wrong.
3. **No Dijkstra feature can be built**: no `Era.Dijkstra`, no Plutus V4, no guards, sub-transactions, direct deposits
   or balance intervals, no BLS key, no parameter keys 34-56.
4. **0.7.x only:** the same key added twice as a signer produces a duplicate vkey witness, which Dijkstra rejects
   and Conway accepted.

**Upstream is far along, on a branch.** PR [#748](https://github.com/bloxbean/cardano-client-lib/pull/748) (draft,
`feat/ledger-cbor`) adds an era-aware CBOR reader that reads Dijkstra and Leios (ADR 0003, M7a and M7c) and Dijkstra
fields in the transaction models (ADR 0004, W-M1). On the devnet, models built on that branch produced transactions
that node 11.2.0 accepted, including direct deposits, guards, balance intervals, a Plutus V4 spend and a
sub-transaction, and the branch read every Dijkstra transaction of the 2026-11-09 corpus with the on-chain id. None of
it is merged or released, QuickTx and the builders are explicitly out of scope until Dijkstra is final, and two defects
on the branch (below) would break a typical caller.

## Scope and exact versions

| Component | Identity | What was done |
| --- | --- | --- |
| Node | 11.2.0, `dac0d7ab2dfdee1f9eda901589e3c6ac8eaa1899` | Fresh devnet, forked to Dijkstra and raised to PV 12.0; `cardano-submit-api` from the same archive |
| CCL 0.7.3 | `f1130177`, Maven Central | QuickTx cases built, signed and submitted |
| CCL 0.8.0-pre7 | `9a5d6072`, Maven Central (2026-10-28, newest release) | Same QuickTx cases |
| CCL master | `5ca123ea` (2026-11-05) | Source reading; differs from pre7 by Conway fixes only |
| CCL `feat/ledger-cbor` | `d3324ec3` (2026-11-09), PR #748 | Built with JDK 21; corpus decoded; Dijkstra transactions built from the models and submitted; module tests run |
| Corpus | `dijkstra-runs/2026-11-09/` | 25 transactions with on-chain ids, including a direct deposit, a sub-transaction and a Plutus V4 reference script |

## What breaks in released code

Each row was submitted to the node unless marked as source-only. "Accepted" means the submit API returned 202 and the
transaction reached a block.

| Case (QuickTx) | 0.7.3 | 0.8.0-pre7 | Why |
| --- | --- | --- | --- |
| Payment | accepted | accepted | Conway 4-element form with `is_valid = true` is still accepted and re-read as Dijkstra |
| Payment with metadata | accepted | accepted | |
| Lock at a Plutus V3 script, inline datum | accepted | accepted | |
| Spend a Plutus V3 script | accepted | accepted | Redeemers are written as a map, as Dijkstra requires |
| `registerStakeAddress` | **rejected** | **rejected** | `StakeRegistration`, certificate type 0, removed in Dijkstra. `TxValidationEraMismatch` (`EraMismatch {ledgerEraName = "Dijkstra", otherEraName = "Conway"}`) |
| `deregisterStakeAddress` | **rejected** | **rejected** | `StakeDeregistration`, type 1. Same error |
| Same, with `RegCert` / `UnregCert` swapped in (`preBalanceTx`) | accepted | accepted | Workaround available today; needs the stake key witness |
| Same key added twice with `withSigner` | **rejected** | accepted | 0.7.3 writes two identical vkey witnesses; Dijkstra decodes witness sets with no duplicates. 0.8 splices witnesses into the bytes and de-duplicates (`bd9e1c82`, 2026-10-01); `release/0.7.x` has not taken it |
| Spend two outputs sharing a datum hash | rejected (`ScriptIntegrityHashMismatch`) | accepted | **Not a Dijkstra issue.** 0.7.x hashes datums without the set tag 258 it writes; fails on Conway too. Fixed in 0.8 by `a39f5924` (#603), not backported |

Source references:

- QuickTx certificates: 0.8.0-pre7 and master `quicktx/.../intent/StakeRegistrationIntent.java:120` and
  `StakeDeregistrationIntent.java:179`; 0.7.3 `quicktx/.../StakeTx.java:65` and `:93`. `Tx.registerStakeAddress`
  (`Tx.java:297-315`) is the only stake-registration entry point; `RegCert` and `UnregCert` exist but QuickTx never
  emits them. The feature branch does not touch `quicktx`, `function`, `core` or the backends.
- Reading: on the 2026-11-09 corpus, 0.8.0-pre7 decodes the direct-deposit and sub-transaction transactions without
  error, drops those fields and computes a different id (`jvm-codecs` check). 0.7.3 also throws on Dijkstra metadata
  transactions (`IndexOutOfBoundsException`). Re-encoding always writes the legacy 4-element form.
- Model and enums, on every release and master: `Era` ends at `Conway(7)` (`common-spec/.../Era.java:18`),
  `Language` at `PLUTUS_V3`, the body writer at key 22. Master gained Conway's parameter-update keys 25-33 on
  2026-11-05 (#743, unreleased); keys 34-56 are only on the branch.

### Things that work today and could drift

- **Reference-script fees.** CCL hard-codes the tier multiplier 1.2 and the 25,600-byte stride
  (`core/.../FeeCalculationServiceImpl.java:229-230`). Dijkstra turns them into parameters (keys 36 stride and 37 multiplier). The devnet's
  values equal the constants, so fees are right today, but a governance change would make CCL under-pay.
  Reference-input fees per policy and per datum byte (keys 55-56) are zero and only activate at v13.
- **Protocol parameters from backends.** The Blockfrost and Ogmios parameter DTOs ignore unknown fields, so the 23 new
  parameters are dropped, not fatal. Cost models are mapped only for V1-V3 (`supplier/ogmios-supplier/.../ProtocolParametersDto.java:81-83`,
  `backend-modules/koios/.../KoiosEpochService.java:251-278`), so a Plutus V4 cost model never reaches the builder.
- **Pool registration** writes the margin as a tag-30 rational (`RationalNumber`), which version 12 requires. Pool
  registration without a BLS key remains valid. Not submitted in this run.
- **Pointer addresses.** CCL can build them; Dijkstra rejects any V1-V3 script transaction whose outputs carry a
  pointer. No CCL default produces one.

## What upstream is doing

| Item | State (2026-11-11) | Content |
| --- | --- | --- |
| [#752](https://github.com/bloxbean/cardano-client-lib/issues/752) | Open, opened by us 2026-11-11 | Checklist of the findings below: QuickTx stake certificates, the branch's signer, key 14 and era-less reads, QuickTx Plutus V4 and backends, reference-script fee parameters, the 0.7.x backport, and a release |
| [#707](https://github.com/bloxbean/cardano-client-lib/issues/707) | Open, label `Leios` | Plutus V4 type, script hash prefix 4, V4 cost model; QuickTx V4 "later" |
| ADR 0003 (PR [#746](https://github.com/bloxbean/cardano-client-lib/pull/746), merged as a document) | Accepted | One era-aware ledger reader (`ledger-cbor` module). M0-M6 (Byron-Conway refactor), **M7a** (read Dijkstra and Leios, experimental) and **M7c** (Dijkstra fields in Yaci's models) implemented on the branch. **M7b** (Dijkstra final, drop the experimental marking, move pins) not started; its entry condition is a node release that forks without `ExperimentalHardForksEnabled` |
| ADR 0004 (on the branch) | Proposed; W-M1 implemented | Dijkstra in CCL's models, opt-in by era: `Era.Dijkstra(8)`, `PLUTUS_V4`, `PlutusV4Script`, `RedeemerTag.Guarding`, `RequireGuard`, body keys 14 and 23-27, `SubTransaction`, `AccountBalanceInterval`, witness key 8, aux key 5, pool `blsKey`, parameter keys 34-56; `Transaction.serialize(Era)` and `deserialize(bytes, Era)`. **W-M2 (QuickTx and builders) is a separate, later decision**, gated on Dijkstra being final |
| PR [#748](https://github.com/bloxbean/cardano-client-lib/pull/748) `feat/ledger-cbor` | **Draft**, review required, mergeable; one of two devnet integration runs and SonarCloud failing | 59 commits, +33k/-2.8k. Its description still says "M7 (Dijkstra) not part of it", but the branch now carries M7a, M7c and ADR 0004 W-M1 (commits of 2026-11-07) |
| ADR 0005 (PR [#750](https://github.com/bloxbean/cardano-client-lib/pull/750)) | Proposed (r4) | Moves Yano's Haskell-strict decoding policy into CCL as an opt-in, with the full conformance gate before release. Not Dijkstra-specific |
| Merged to master after pre7 | Unreleased | Conway fixes that also matter after the fork: #743 parameter-update keys 25-33, #744 Haskell map order, #745 script-ref and inline-datum bytes, #742 numeric decoding, #734 indefinite arrays, #741 CBOR conformance gate |

Yaci and Yano have matching local branches (`feat/ledger-cbor-reader`) that "follow once this is released", per the PR.
The release order in ADR 0003 is CCL, then Yaci, then Yano, so Yaci and Yaci Store cannot ship Dijkstra block reading
before a CCL release.

## What the branch delivers, verified on the devnet

Built at `d3324ec3`, models written with `serialize(Era.Dijkstra)`, signed over the bytes
(`TransactionSigner.sign(byte[], …)`), submitted raw.

| Case | Result | Evidence |
| --- | --- | --- |
| Payment in the 3-element form | accepted | `83a3…` |
| Direct deposit (key 25) of 5 ada | accepted; reward balance became 5,000,000 | `stake-address-info` |
| Guard (key 14, key credential) | accepted; a guard on an unsigned key is rejected with `MissingVKeyWitnessesUTXOW` for that key | negative control |
| Account balance interval (key 26), lower bound 1 ada | accepted; lower bound 100 ada rejected with `BalancesOutsideAccountBalanceIntervals` | negative control |
| Output with a Plutus V4 reference script | accepted | |
| Lock at, then spend, a Plutus V4 script (witness key 8, V4 language view in the script data hash) | accepted | the node ran the V4 script |
| Top-level transaction with one signed sub-transaction (key 23) | accepted | sub-body signed over its own hash, read back through `RawTx` |
| Decode the 2026-11-09 corpus with `deserialize(bytes, Era.Dijkstra)` | `RawTx.txId()` equals the on-chain id for all 25. The model's `getTxHash` matches for 22: 19 re-encode byte for byte, 3 Conway envelopes are rewritten in the 3-element form with the same body. The other 3 are a legacy registration, which the model refuses to write in Dijkstra by design, and the two `required_signers` bodies (defect 2) | `branch-decode.log` |
| Branch module tests (`common-spec`, `ledger-cbor`, `transaction-spec`, `plutus`) | 1,100 tests, 0 failures, 13 skipped | `branch-tests.log`; run without the external CBOR dataset, so the dataset gates are among the skipped |

Not exercised here: required top-level guards (key 24), starting balance intervals (key 27), the guard native script
(type 6), redeemer tag 6, pool registration with a BLS key, parameter-change proposals with keys 34-56, Leios
certificates. The node 11.2.0 CLI cannot build most of these either; the branch tests them against the ledger's golden
transaction and dataset samples only.

## What is missing

### Defects on the branch

1. **Signing a Dijkstra model drops the Dijkstra fields.** `TransactionSigner.sign(Transaction, HdKeyPair)` and
   `sign(Transaction, SecretKey)` serialize in the transaction's era, sign, then re-read the result with era-less
   `Transaction.deserialize(signedTxBytes)` (`transaction-spec/.../TransactionSigner.java:32-59`), which reads as
   Conway, before restoring `era`. Body keys 23-27 are lost and key 14 changes reading. With a direct deposit,
   `Account.sign(tx)` produced a body without key 25, rejected with `ValueNotConservedUTxO` and `InvalidWitnessesUTXOW`
   (`dd-modelsign`). Signing the bytes works. `Account.sign`, QuickTx's signers and most user code take the model path.
   Fix: re-read with the transaction's era (`deserialize(bytes, era)` when `era` is set).
2. **Key 14 in key-hash form does not round-trip.** A Dijkstra body may write key 14 as a set of key hashes, which is
   what a Conway `required_signers` body becomes on the chain. The branch reads it as `guards` and writes it back as
   credentials (ADR 0004 D4), so `getTxHash` of the model differs from the on-chain id
   (`conway-required-signer` and `mempool-conway-required-signer` in `branch-decode.log`). ADR 0004 D5 says ids should
   come from `RawTx`, but re-signing or re-submitting such a model changes the body.
3. **Era-less reading still loses data silently.** `Transaction.deserialize(bytes)` keeps reading as Conway by design
   (ADR 0004 Q3). On Dijkstra bytes it still drops direct deposits and sub-transactions without an error and computes
   the wrong id, exactly as 0.8.0-pre7 does. Every existing caller (backends' transaction parsing, evaluators,
   `Account.sign(String)`, downstream codecs) takes this path until it passes an era.

### Not started or deferred

- **QuickTx and the builders (ADR 0004 W-M2):** stake (de)registration still emits types 0 and 1 on master and the
  branch; no Dijkstra output form; no Plutus V4 scripts, cost model or `attachSpendingValidator` for V4; no API for
  guards, sub-transactions, direct deposits or intervals; fee and balance calculation do not know direct deposits,
  sub-transaction execution units or the new reference-script parameters.
- **Backends:** V4 cost models are not mapped from Blockfrost, Koios or Ogmios; parameters 34-56 are not mapped into
  `ProtocolParams`.
- **Any release.** The newest release is 0.8.0-pre7 (2026-10-28). Master is `0.8.0-pre8-SNAPSHOT`.
- **0.7.x:** neither the duplicate-witness fix nor the datum-hash fix is backported.

## Downstream impact

The stake-certificate break reaches tools that build their own transactions, which the current lead decisions mark
`not-reached` ("building its own transactions"):

- **cardano-rosetta-java** (`e3be4dac`) builds the legacy certificates directly for Rosetta staking operations:
  `api/.../common/util/ProcessConstructions.java:41` (`new StakeRegistration(credential)`) and `:67`
  (`new StakeDeregistration(credential)`). Exchanges' stake key registration through Rosetta would be rejected after
  the fork. The fix is in Rosetta, using CCL's existing `RegCert` and `UnregCert`.
- **yaci-devkit** (`d93538a2`) calls QuickTx `registerStakeAddress` while setting up clusters:
  `applications/cli/.../service/LocalNodeService.java:363`, `peer/PeerService.java:238`,
  `yano/YanoGovernanceService.java:180`. A cluster at protocol version 12 fails those steps until QuickTx changes.
- The existing `confirmed` leads (Scalus, julc, cardano-client-bindings, cardano-rosetta-java parse, Yaci, Yaci Store,
  cf-ledger-sync) stand. On the branch they would still need to pass an era to every read (defect 3).

## Concrete remediation sequence

1. **QuickTx, now, in a Conway-compatible way.** Emit `RegCert` and `UnregCert` with the deposit (and the stake
   witness the registration then needs) instead of `StakeRegistration` and `StakeDeregistration`. They are valid in
   Conway, so this needs no era switch and fixes every downstream QuickTx caller. Users can do it today with
   `preBalanceTx` (shown accepted on 0.7.3 and 0.8.0-pre7).
2. **Backport to 0.7.x** the witness de-duplication, and the tag-258 datum hash fix, which is a Conway bug.
3. **Fix the branch's model signer** (defect 1) before merge, and add a Dijkstra signing test that round-trips keys
   23-27.
4. **Merge and release PR #748** so Yaci, Yaci Store and Yano can follow (ADR 0003 release order), keeping the
   experimental marking until M7b.
5. **W-M2:** Dijkstra in QuickTx (3-element output, V4 scripts and cost models from the backends, the new body
   fields, fee and balance rules), once the era is final.
6. **Make the reference-script fee read keys 36-37** when present, falling back to the constants.

## Corrections to the boundary record

`content/readiness/dijkstra/boundary.json` (`bloxbean-cardano-client-library`, observed `5ca123ea`) said the only
Dijkstra work is #707. The assessment changes below are applied, backed by the devnet checks `ccl-quicktx` and
`ccl-branch-transactions` in `devnet.json`; the lead changes are not applied yet. This run supports:

- `era-identity`, `transaction-encoding`, `plutus-language`, `protocol-parameters`, `stake-pool-registration`:
  `in-progress`, citing PR #748 and ADR 0004 at `d3324ec3`, together with the devnet results above. They stay `gap`
  for every release.
- `protocol-parameters`: the "keys only up to 24" summary is out of date for master (#743 adds 25-33); 34-56 remain
  branch-only.
- `transaction-rules`: `gap`, no longer `no-evidence`. QuickTx's stake (de)registration is rejected on the devnet in
  0.7.3 and 0.8.0-pre7 (new devnet check), and 0.7.3 duplicates vkey witnesses.
- Leads for `cardano-rosetta-java` and `yaci-devkit` on `transaction-rules` / `transaction-encoding`: `confirmed`, with
  the lines above.
