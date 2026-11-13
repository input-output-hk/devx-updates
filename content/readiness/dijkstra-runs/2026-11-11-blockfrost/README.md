# Blockfrost on the Dijkstra devnet: 2026-11-11

A fresh node 11.2.0 devnet (same recipe as 2026-11-09), with one extra transaction: an ordinary payment that spends the
output of the sub-transaction. Recipe: `scripts/readiness/devnet/blockfrost.sh`; versions in `build-inputs.txt`.

db-sync 13.8.0.0 stops at the first PlutusV4 script, as on 2026-11-09. To see what Blockfrost serves past that point,
`plutusV4` was then added to the database's `scripttype` enum by hand and db-sync restarted. That is this experiment's
workaround, not a fix anyone has shipped.

| What | Result |
| --- | --- |
| db-sync 13.8.0.0 | Exits at block 77 on the PlutusV4 reference script (`invalid input value for enum scripttype`). |
| db-sync with `plutusV4` added | Indexes the PlutusV4 script, the direct deposit and the transaction carrying the sub-transaction, but not the sub-transaction itself. Exits on the next transaction that spends the sub-transaction's output: `TxId not found` for 4d6d05ed…, the sub-transaction's id. |
| Blockfrost v7.0.0, sub-transaction | `/txs/<sub-transaction>` is 404; the parent shows only its own input and output. The output the sub-transaction spent is still listed as unspent at the address, and its new output is not listed. |
| Blockfrost v7.0.0, direct deposit | The node reports a 2 ADA account balance; `/accounts` reports 0, and the transaction shows 2 ADA going nowhere. |
| Blockfrost v7.0.0, PlutusV4 | `/scripts/<hash>` answers `"type": "plutusV4"`, outside the OpenAPI enum (`timelock`, `plutusV1`–`plutusV3`). |
| Blockfrost v7.0.0, parameters | Protocol version 12 and the PlutusV4 cost model are served; none of the 23 new Dijkstra parameters are. |
| Blockfrost v7.0.0, `/network/eras` | HTTP 500 (`Cannot read properties of undefined (reading 'is_era_hardfork')`). |
| blockfrost-platform 1.0.0 | Its Pallas offers node-to-client V10–V16; node 11.2.0 accepts only V23, so it cannot connect. |
| blockfrost-platform main | Connects with V23. Its `/tx/submit` pre-check accepts the 5 Conway four-element encodings and rejects all 20 three-element ones (every Dijkstra-built transaction and every mempool re-encoding) with HTTP 400, before the node sees them. |

- `service-layer.log`: db-sync 13.8.0.0 and Blockfrost v7.0.0 as released (`service-layer.sh`).
- `db-sync.log.gz`: that db-sync run.
- `resume.log`, `db-sync-resumed.log`: db-sync restarted with `plutusV4` added (`blockfrost.sh resume`).
- `blockfrost-probe.log`: Blockfrost's answers next to the node's (`blockfrost.sh probe`).
- `blockfrost-v7-errors.log`: errors Blockfrost logged.
- `platform-submit.log`: `platform-probe` on the 25 encodings of `../2026-11-09/transactions-labeled.txt`.
- `platform-handshake.log`: the node's answer to each platform build's version proposal.
- `transaction-ids.json`: this chain's test transactions, including the sub-transaction's own id.
- `manifest.json`: SHA256 for every retained file.
