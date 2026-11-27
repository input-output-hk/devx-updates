# cardano-db-sync `dijkstra-0-0` on the Dijkstra devnet: 2026-11-27

The db-sync maintainers pointed at the tag
[`dijkstra-0-0`](https://github.com/IntersectMBO/cardano-db-sync/tree/dijkstra-0-0) as Dijkstra-ready. It is an
annotated tag ("Dijkstra-net non production", 2026-10-30), not a GitHub release, on commit `8b548af1`: 11 commits on
top of master's merge base `ccb9c0f4`, on no branch. It reports 13.8.0.0 and pins cardano-node `dac0d7ab` (the
"prepare 11.2" merge). Its changelog calls the Dijkstra support experimental and the schema it adds provisional.

It ran from genesis on the same node **11.2.1** devnet as [`2026-11-27-db-sync`](../2026-11-27-db-sync/), with
`scripts/readiness/devnet/db-sync.sh` on Postgres 16, plus a new step, `pool-bls.sh`, that re-registers a pool with a
BLS key. `db-sync.sh report` now compares the new tables with the node.

| Check | Result |
| --- | --- |
| Sync from genesis | Reached the node tip (block 3730) within the 240 s wait and kept following it. 0 decoder failures, 0 error lines. |
| Restart | Stopped at block 3862 and restarted from its epoch-384 ledger snapshot. Caught up to the tip with no errors. |
| Every submitted transaction | All indexed, including the sub-transaction `7b0f2e16…` and `spend-subtx-output`, which master exits on. The two the node rejects are absent, as expected. |
| Plutus V4 | `plutusV4` in the `scripttype` enum (migration 1-0017). The reference script is stored under the node's hash `31a78786…`. |
| Sub-transactions | Own `tx` row with `parent_tx_id` set to the top-level transaction. Its input `split#1` is marked consumed, and `spend-subtx-output` consumes its output `#0`. |
| Direct deposits | New `direct_deposit` table: one row, 2,000,000 lovelace to the right stake address, which matches the node's `rewardAccountBalance`. |
| Guards | New `tx_guard` table: the native and PlutusV4 guard credentials equal the scripts' hashes. |
| Account balance intervals | New `tx_account_balance_interval` table: lower bound 1 lovelace on the right account, as in the transaction body. |
| Protocol parameters | All 24 new Dijkstra fields have an `epoch_param` column holding the node's value (`maxPledgeLeverage` is null on both). The PlutusV4 cost model is stored. |
| Pool BLS keys | `pool_update.bls_key` and `bls_key_pop` match the key and proof of possession the node reports. |
| Native script JSON | The Dijkstra timelock script has its JSON. |
| Leios certificates | `leios_cert` table and `block.has_leios_cert` column exist. The devnet produces none, so they are not exercised. |
| Test suites | Re-run locally from the nix checks: cardano-db unit (pass), cardano-db-sync unit (pass), test-db (21/21), chain-gen (156/156), plus hlint, shellcheck and fourmolu (pass). Same as CI on the commit (Linux ghc96 and ghc912, macOS ghc96). |

## What is still open

- **Guard redeemers still have no script hash.** The PlutusV4 guard's redeemer has `purpose = 'guard'` and
  `script_hash = NULL`, though the node shows the guarding script `31a78786…`. `toAlonzoPurpose` still maps
  `DijkstraGuarding` to `Nothing`
  ([`Types.hs#L314`](https://github.com/IntersectMBO/cardano-db-sync/blob/8b548af13f62785ced9fd1daeb6f1dca6e278447/cardano-db-sync/src/Cardano/DbSync/Era/Shelley/Generic/Tx/Types.hs#L314)).
  The credential can be found by joining `tx_guard` on the redeemer's index, but any query that reads
  `redeemer.script_hash` gets nothing.
- **No Dijkstra chain-gen tests.** The mock forging still stops at Conway; the tag only adds a comment naming era 7.
  The new unit tests cover the Dijkstra native script JSON (`ScriptTest.hs`).
- **Not on master and not released.** The tag isn't on any branch, the schema is marked provisional, and master has 18
  commits the tag lacks. Blockfrost, Koios and GraphQL need a release with a stable schema.
- **Sub-transaction totals.** The sub-transaction's row has `fee` 0 and `out_sum` 50 ADA, and the top-level row keeps
  only its own input and output. That's consistent, but consumers that sum `tx` rows per block now count
  sub-transactions as transactions.

## Files

- `run.log`, `restart.log`, `report.log`: `db-sync.sh run`, `resume` (used here as a plain restart; the enum value
  already existed) and `report`.
- `pool-bls.log`: `pool-bls.sh`, the pool1 re-registration that `report` checks.
- `db-sync.log.gz`, `db-sync-restarted.log.gz`: the complete db-sync logs.
- `tests.log`: the four test suites and the hlint, shellcheck and fourmolu checks, re-run locally.
- `build-inputs.txt`: versions and digests.
