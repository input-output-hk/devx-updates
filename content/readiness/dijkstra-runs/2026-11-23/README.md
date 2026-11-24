# Dijkstra assessment run: 2026-11-23

Target: official node **11.2.1**, commit `90bc1cd9380a78a63091ff673f8c5693152c8f60` (tagged prerelease, 2026-11-10), CLI
11.7.0.0. The previous runs (2026-11-01 to 2026-11-11) were on 11.2.0; their complete assessment is archived in
`../../dijkstra-history/2026-11-11-node-11.2.0/`. Every check in `devnet.json` was rerun on 11.2.1; nothing is carried
over. See `provenance.json` for recipe hashes and limits.

11.2.1 changes no ledger rule. Its ledger revision (`95b36905`, cardano-ledger-dijkstra 0.5.0.0) has the same Dijkstra
CDDL as 11.2.0's, and fixes a byte-order regression in `cardano-ledger-binary` 1.10.0.0: node 11.2.0 encoded and decoded
pool relay IPv4 addresses with their bytes swapped; 11.1.3 and 11.2.1 use network order. No check here uses a pool relay.
Its CLI adds the options for guards and account balance intervals, so this run exercises both.

## What changed since 2026-11-09/11 (node 11.2.0)

| Component | Tested | Result |
| --- | --- | --- |
| Node, CLI | 11.2.1, 11.7.0.0 | Native and PlutusV4 guards (the V4 script ran in phase two) and balance intervals are accepted; an unmet interval is rejected. Same block shape: ten-field header, protocol version 12.0. |
| Yaci | 0.5.0-pre17 | **Now decodes all 336 Dijkstra blocks** (0.5.0-pre15 decoded none). A prerelease, cut from the next branch. |
| cardano-client-lib | 0.8.0-pre8 | The era-aware reader and Dijkstra models are released (PR #748). Every Dijkstra build case is accepted, including when signed through the Transaction object. Read with Era.Dijkstra, 31 of 32 encodings give the on-chain id; the PlutusV4 guard does not. QuickTx stake registration is still rejected. |
| Ogmios (IntersectMBO fork) | master 54bb8c1c | **Now returns full Dijkstra transactions**, evaluates a PlutusV4 guard, submits, follows the mempool and answers a rejected submission. Dijkstra protocol parameters are still unavailable. Not upstream or released. |
| @cardano-sdk/core | 0.47.1 | Unchanged version, new finding: fails on every balance-interval transaction (keys them by credential; the node keys them by reward account). Guards, direct deposits and sub-transactions round-trip. |
| Blockfrost RYO | v7.0.1 | Same gaps as v7.0.0; a PlutusV4 guard's redeemer comes back with purpose `guard` and an empty `script_hash`. |
| gouroboros | v0.221.0 | Unchanged: decodes all blocks, reports ordinary Dijkstra transactions as Conway. |
| Pallas | v1.5.0-rc.3, main 0b17c8f6 | Unchanged: every transaction with the era named, no block. |
| CSL | 17.0.0, 15.0.3, 18.0.0-beta.1 | Unchanged, and also fail on guards and balance intervals. 18.0.0-beta.1 (npm only) behaves like 17.0.0. |
| CML, PyCardano | 6.2.0, v0.19.2 | Unchanged versions and failures, plus guards and balance intervals. |
| Kupo (fork), Ogmios/Kupo releases | ee51691d, v7.0.0, v2.12 | Unchanged: the fork stops at the first sub-transaction; the releases at the first Dijkstra block. |
| cardano-db-sync | 13.8.0.0 | Unchanged: stops at the first PlutusV4 script, and (with the enum workaround) at the first spend of a sub-transaction output. |
| blockfrost-platform | 1.0.0, main d5a48256 | Unchanged: 1.0.0 cannot connect; main rejects every three-element transaction. |
| txtop, Aiken | v0.17.0 (+ gouroboros v0.221.0), v1.1.24 | Unchanged. |

## Files

- `transactions-labeled.txt`, `transaction-ids.json`: 32 envelope and mempool encodings; every mempool id matches its
  envelope. New: `dijkstra-native-guard`, `dijkstra-plutusv4-guard`, `dijkstra-balance-interval` (with mempool
  encodings) and `dijkstra-balance-interval-unmet` (rejected, envelope only).
- `blocks.txt.gz`: 336 raw, unwrapped Dijkstra blocks. `blocks-hfc.txt.gz`: HFC-wrapped versions plus one Conway control.
  `first-blocks.txt`: the first block of each era. `block-shape.log`: the first Dijkstra block's structure.
- Probe and service logs, one per tool and version, including failing checks. `service-layer.log` drops docker's
  image-pull lines and nothing else; `db-sync.log.gz` and `db-sync-resumed.log.gz` are the complete db-sync logs.
- `ccl-0.8.0-pre8-era-decode.log` and `ccl-0.8.0-pre8-dijkstra-build.log` come from `jvm-probe/ccl-e2e/BranchProbe.java`,
  written for the 2026-11-11 branch build and run here against the released 0.8.0-pre8 artifacts (its heading still says
  "branch"; `build-inputs/ccl-0.8.0-pre8-ledger-cbor-classpath.txt` is what ran). The build log's first `dd` and `abi-*`
  attempts were rejected because the end-to-end `dereg-new` case had deregistered their stake account; they were rerun
  after `reg-new`.
- `ccl-e2e-*.log`: QuickTx built, signed and submitted through cardano-submit-api 11.2.1. In `ccl-e2e-dups.log`, 0.7.3's
  QuickTx merged the two outputs of the first lock into one, so it was locked again before the spend.
- `ogmios-fork-*.log`, `ogmios-fork-dijkstra-transactions.json`, `kupo-fork-full-chain.log`: the IntersectMBO forks.
- `blockfrost-*.log`, `platform-*.log`: Blockfrost RYO v7.0.1 and blockfrost-platform. `blockfrost-resume.log` is this
  experiment's workaround (adding `plutusV4` to db-sync's enum), not a fix.
- `aiken/results.json`: the offline Aiken runner against v1.1.24; identical to 2026-11-09 apart from the timestamp.
- `comparison.json`: comparison with `../../dijkstra-history/2026-11-11-node-11.2.0/`.
- `build-inputs/`: resolved Cargo locks, the Go module list, npm locks, Maven classpaths, Python freeze, toolchain versions,
  image digests and binary hashes.
- `manifest.json`: SHA256 for every retained file. Testnet signing keys, mnemonics and chain databases are excluded.

Not run: Koios, required top-level guards, the historical patched gouroboros controls and cardano-node-api, and Ogmios
and Kupo against the versioned configuration. Source releases are not runtime verification; transaction ids, slots and
block counts are specific to this devnet.
