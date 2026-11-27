
# Dijkstra hard fork readiness

Hi team! Thank you for all your work on db-sync! I ran some tests on a devnet with cardano-node 11.2.1 ahead of the
Dijkstra hard fork, and found several things to work on before it's ready. Blockfrost, Koios and Cardano GraphQL all
read from db-sync, so none of them can serve Dijkstra data until db-sync can (see blockfrost/blockfrost-backend-ryo#364).
Please let me know if we (I, my team @ [AlwaysTrue](https://alwaystrue.io), or anyone at IOG) can help with this!

Relates to #2115.

**Stops indexing**

- [ ] Add `plutusV4` to the `scripttype` enum, so db-sync doesn't exit at the first PlutusV4 script
- [ ] Index sub-transactions, so db-sync doesn't exit at the first spend of a sub-transaction output

**Indexes incorrectly or not at all**

- [ ] Record direct deposits
- [ ] Store the script hash of guard redeemers
- [ ] Store the 23 new Dijkstra protocol parameters in `epoch_param` and `param_proposal`
- [ ] Store pool BLS keys
- [ ] Add Dijkstra to the chain-gen mock tests

## Testing scenario

I tested on 2026-11-27 with cardano-db-sync master
([`c49b7268`](https://github.com/IntersectMBO/cardano-db-sync/commit/c49b7268a2f33ed0eb2e3341ad8fa15005fddfad),
13.9.0.0, the cache.iog.io build) on PostgreSQL 16. db-sync ran from genesis with the ledger enabled and default insert
options. The node was cardano-node 11.2.1 (`90bc1cd9`, cardano-cli 11.7.0.0) on a `cardano-testnet` devnet (magic 42).
The devnet forked from Conway to Dijkstra at epoch 2, and two hard-fork initiation actions took it to protocol version 12.

I built test transactions in both eras:

- payments, metadata and stake registration
- a direct deposit
- a PlutusV4 reference script
- a transaction carrying a sub-transaction, and a payment that spends the sub-transaction's output
- a native guard and a PlutusV4 guard
- an account balance interval

The node accepted all of them. Release 13.8.0.0 behaves the same way on node 11.2.0 and 11.2.1. I didn't test a pool
registration with a BLS key.

db-sync stops at the first PlutusV4 script (#1 below). To see what it does after that point, I added the value to the
database by hand and restarted db-sync. That workaround is only for the test.

**What already works:** db-sync decodes every Dijkstra block from node 11.2.1 with no decoder failures. It indexes
ordinary Dijkstra transactions, the native and PlutusV4 guard transactions, and the balance-interval transaction, and it
stores protocol version 12.0 and the PlutusV4 cost model.

**To reproduce:**
The devnet scripts are in
[`scripts/readiness/devnet`](https://github.com/input-output-hk/devx-updates/tree/02f57e45b3b414b1c9fde95780b88d33a4e074b1/scripts/readiness/devnet).
Its README builds the devnet and the test transactions (`start.sh`, `hardfork.sh`, `transactions.sh`, `advanced.sh` and
`blockfrost.sh spend-sub`).
[`db-sync.sh`](https://github.com/input-output-hk/devx-updates/blob/02f57e45b3b414b1c9fde95780b88d33a4e074b1/scripts/readiness/devnet/db-sync.sh)
runs any db-sync binary from genesis (`run`), applies the enum workaround (`resume`), and checks each transaction and
feature against the node (`report`). Logs from the run:
[`2026-11-27-db-sync`](https://github.com/input-output-hk/devx-updates/tree/02f57e45b3b414b1c9fde95780b88d33a4e074b1/content/readiness/dijkstra-runs/2026-11-27-db-sync).

## Issues

### 1. db-sync exits at the first PlutusV4 script

An output with a PlutusV4 reference script, or a transaction with a PlutusV4 witness, makes the insert into `script` fail
([`Other.hs#L176`](https://github.com/IntersectMBO/cardano-db-sync/blob/c49b7268a2f33ed0eb2e3341ad8fa15005fddfad/cardano-db-sync/src/Cardano/DbSync/Era/Universal/Insert/Other.hs#L176)),
and db-sync exits:

    Database transaction error: DbSessionError {... dbCsFncName = "insertScript" ...
      ServerError "22P02" "invalid input value for enum scripttype: \"plutusV4\"" ...
    runDbThread: Error SNErrDbSessionErr:

The Haskell side already maps the language
([`Types.hs#L311`](https://github.com/IntersectMBO/cardano-db-sync/blob/c49b7268a2f33ed0eb2e3341ad8fa15005fddfad/cardano-db/src/Cardano/Db/Types.hs#L311),
`TODO(Dijkstra): Add to Schema`), but no migration adds the value to the database enum. On the test chain, db-sync's
highest block is 81, and block 82 holds the PlutusV4 reference script.

The `leios-w42` branch already has the migration:
[`965eed4f`](https://github.com/IntersectMBO/cardano-db-sync/commit/965eed4f2c6605acc4d3e877386b6b8b7663a40d)
("Add Plutus V4").

### 2. Sub-transactions are not indexed, and db-sync exits on the first spend of their output

`fromDijkstraTx` only converts the top-level body
([`Dijkstra.hs#L38`](https://github.com/IntersectMBO/cardano-db-sync/blob/c49b7268a2f33ed0eb2e3341ad8fa15005fddfad/cardano-db-sync/src/Cardano/DbSync/Era/Shelley/Generic/Tx/Dijkstra.hs#L38)),
so a sub-transaction's inputs, outputs, scripts and certificates are never inserted. With the enum patched:

- The transaction `38e5e3f4…` carries the sub-transaction `7b0f2e16…`. `tx` has a row for `38e5e3f4…` with only its
  own input and output, and no row for `7b0f2e16…`.
- The output the sub-transaction spent is never marked consumed, though the node reports it spent. The output it
  created is missing. Anything that reads the UTxO set from db-sync would build on an output that no longer exists.
- When a later payment (`cb881ea1…`) spends the sub-transaction's output, db-sync exits. The escaped hash in the error
  is `7b0f2e16…`, the sub-transaction:

      Error SNErrDefault: "TxId not found for hash: \"{\SI.\SYN'\232\186\188\249B!\236/\150\220\219\214\212\133\ETX\146\182Pw&^J#/\DC2.O\""

The `leios-w42` branch already captures sub-transactions as their own `tx` rows, linked with a new `tx.parent_tx_id`:
[`e48dcb6b`](https://github.com/IntersectMBO/cardano-db-sync/commit/e48dcb6befa30cc2991fe78916b214a38e3a98b8)
("Capture nested transactions").

### 3. Direct deposits are not recorded

The test transaction `c2fa179c…` spends 50 ADA, pays 47.7 ADA to an address and 0.3 ADA in fees, and direct-deposits
2 ADA into a registered stake account. The node then reports `rewardAccountBalance` 2,000,000 lovelace for that
account.

db-sync records `out_sum` 47,700,000, `fee` 300,000 and `deposit` 0, so the 2 ADA goes nowhere, and no table holds
direct deposits. Any balance computed from db-sync is too low by the deposited amount. The `e48dcb6b` commit above lists
this as a TODO, and suggests a `direct_deposit(tx_id, addr_id, amount)` table.

### 4. Guard redeemers have no script hash

For a transaction with a PlutusV4 guard, the redeemer row has `purpose = 'guard'` and `script_hash = NULL`.
`toAlonzoPurpose` maps `DijkstraGuarding` to `Nothing`
([`Types.hs#L262`](https://github.com/IntersectMBO/cardano-db-sync/blob/c49b7268a2f33ed0eb2e3341ad8fa15005fddfad/cardano-db-sync/src/Cardano/DbSync/Era/Shelley/Generic/Tx/Types.hs#L262)),
so `handleRedeemer` falls through to `Nothing -> (rdmrMps, Nothing)`
([`Alonzo.hs#L249`](https://github.com/IntersectMBO/cardano-db-sync/blob/c49b7268a2f33ed0eb2e3341ad8fa15005fddfad/cardano-db-sync/src/Cardano/DbSync/Era/Shelley/Generic/Tx/Alonzo.hs#L249))
and never resolves the guard credential's script hash.

### 5. New Dijkstra protocol parameters are not stored

The node returns 54 protocol parameters at protocol version 12. `epoch_param` has a column for none of the 23 new ones:

- reference-script limits and pricing: `maxRefScriptSizePerBlock`, `maxRefScriptSizePerTx`, `refScriptCostStride`,
  `refScriptCostMultiplier`
- `maxPledgeLeverage` and `minPoolMargin`
- reference-input fees: `refInputsCostPerDatumByte`, `refInputsCostPerMultiAssetPolicy`
- Leios: the five `leios*` parameters, the three `maxEndorserBlock*` parameters and `maxRefScriptSizePerEndorserBlock`
- Peras: the six `peras*` parameters

`param_proposal` drops them too
([`ParamProposal.hs#L101`](https://github.com/IntersectMBO/cardano-db-sync/blob/c49b7268a2f33ed0eb2e3341ad8fa15005fddfad/cardano-db-sync/src/Cardano/DbSync/Era/Shelley/Generic/ParamProposal.hs#L101)).
Transaction builders that read parameters through Blockfrost or Koios can't compute Dijkstra fees without them. The
`leios-w42` branch stores the Leios ones:
[`4c403e51`](https://github.com/IntersectMBO/cardano-db-sync/commit/4c403e51bf7755521a1923ec248b3294ce891827) and
[`71b673fc`](https://github.com/IntersectMBO/cardano-db-sync/commit/71b673fceb8c6b8bc809a6ccaaa61051abb21b42).

### 6. Pool BLS keys are not stored

Dijkstra pool registrations carry a BLS key (`cardano-cli dijkstra stake-pool registration-certificate
--bls-signing-key-file`), but `pool_update` has no column for it. I found this in the schema; the test chain didn't
register a pool with a BLS key.

### 7. No Dijkstra test coverage

The chain-gen mock forging stops at Conway
([`Interpreter.hs#L677`](https://github.com/IntersectMBO/cardano-db-sync/blob/c49b7268a2f33ed0eb2e3341ad8fa15005fddfad/cardano-chain-gen/src/Cardano/Mock/Forging/Interpreter.hs#L677)),
so no test forges a Dijkstra block. Each issue above would make a good regression test.

The fixes in `leios-w42` can't be used as they are: the branch is cut from 13.7.2.1 on the Leios prototype node. Its
build ([`72e067fa`](https://github.com/IntersectMBO/cardano-db-sync/commit/72e067fa064af549a00d263c890c179989cf4f40))
fails on the first Dijkstra block from node 11.2.1 with `DecoderFailure … DeserialiseFailure 864 "expected bool"`, so
the changes would need porting to master.
