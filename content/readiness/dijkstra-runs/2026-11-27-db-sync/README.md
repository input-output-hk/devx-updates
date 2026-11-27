# cardano-db-sync on the Dijkstra devnet: 2026-11-27

A fresh node **11.2.1** devnet (`90bc1cd9`, CLI 11.7.0.0), built with the usual recipe: `start.sh`, `hardfork.sh 11`,
`hardfork.sh 12`, `transactions.sh`, `advanced.sh` and `blockfrost.sh spend-sub`. Then each db-sync build was run from
genesis with `scripts/readiness/devnet/db-sync.sh` on Postgres 16. `ISSUE.md` is the write-up for the db-sync
maintainers.

| Build | Result |
| --- | --- |
| master `c49b7268` (13.9.0.0, unreleased; pins node 11.2.3 deps), from cache.iog.io | Same as 13.8.0.0. Indexes Dijkstra blocks with no decoder failures, then exits at block 82 on the PlutusV4 reference script (`invalid input value for enum scripttype: "plutusV4"`). Highest block indexed: 81. |
| master, `plutusV4` added to `scripttype` by hand | Indexes the PlutusV4 script, guards, balance interval, direct deposit and the transaction carrying the sub-transaction, but not the sub-transaction. Exits at block 86 with `TxId not found` for `7b0f2e16…`, the sub-transaction's id, when the next payment spends its output. |
| leios-w42 `72e067fa` (has "Add Plutus V4" and "Capture nested transactions") | Cut from 13.7.2.1 on the Leios prototype node. Decodes no Dijkstra block from node 11.2.1 (`DecoderFailure`, `DeserialiseFailure 864 "expected bool"`) and stays at block 26, the last Conway block. |

What master records once past the enum (`master-report.log`):

- Sub-transaction: the top-level transaction has 1 input and 1 output (its own). The sub-transaction has no `tx` row, and
  the output it spent (`split#1`) is never marked consumed. The node reports it spent.
- Direct deposit: the transaction shows 50 ADA in, 47.7 ADA out, 0.3 ADA fee and 0 deposit, so 2 ADA goes nowhere. The
  node reports a 2 ADA account balance. No table records direct deposits.
- PlutusV4 guard: the redeemer is stored with purpose `guard`, but `script_hash` is NULL.
- Protocol parameters: protocol version 12.0 and the PlutusV4 cost model are stored. None of the 23 new Dijkstra
  parameters has an `epoch_param` column.
- Pool BLS keys: `pool_update` has no column for them. Not exercised on chain.

Upstream on 2026-11-27: no issue comment, pull request or branch on master's line touches the Dijkstra gaps. Issue
#2115 ("Integrate Dijkstra") is open with no comments. Master's `TODO(Dijkstra)` markers in `Cardano/Db/Types.hs` and
`ParamProposal.hs` are still there. The Haskell CI on master passes on Linux (ghc96, ghc912) and fails on macOS when
`cardano-db-tool` links against ICU, which is unrelated. The chain-gen mock tests have no Dijkstra era, so no db-sync test
covers Dijkstra.

## Files

- `master-run.log`, `master-resume.log`, `master-report.log`: `db-sync.sh run`, `resume` and `report` for master.
- `db-sync-master.log.gz`, `db-sync-master-resumed.log.gz`: the complete db-sync logs of those two runs.
- `leios-w42-run.log`, `db-sync-leios-w42.log.gz`: the leios-w42 run (`LEGACY_LOGGING=1`), stopped after 150 s of
  decoder retries.
- `transactions.log`, `advanced.log`: what the node accepted. `conway-legacy-reg` and `dijkstra-legacy-reg` are rejected
  by the node, as before, so they are not db-sync failures.
- `build-inputs.txt`: versions and digests.
