# Ogmios and Kupo forks on the Dijkstra devnet: 2026-11-10

The node team (IntersectMBO) is porting Ogmios and Kupo to the node 11.2 libraries in its own forks. None of that work is
merged into CardanoSolutions/ogmios or CardanoSolutions/kupo, or released. These results show where the forks stand; they
do not make either component ready, which the site only records once the work is merged upstream.

Same node (11.2.0, `dac0d7ab`) and same chain as the 2026-11-09 run: the test transactions are the ones in
`../2026-11-09/transaction-ids.json`. Recipe: `scripts/readiness/devnet/forks.sh`; versions in `build-inputs.txt`.

| Fork | Result |
| --- | --- |
| Ogmios `2f9b5d14` | Chain sync reaches the tip: 15 Conway and 2356 Dijkstra blocks, no decode error. Each Dijkstra transaction is returned as its id only (`TODO(dijkstra): minimal body`). Submitting a Dijkstra payment works and returns the right id; a rejected submission and mempool monitoring drop the client's connection (`TODO(dijkstra): toRawTxIdHash`). The protocol-parameters query is unavailable in Dijkstra. |
| Kupo `bdb44975` | Indexes every Dijkstra block and test transaction up to block 186, including the direct deposit, with output counts matching cardano-cli. Stops with an explicit error at block 187, the first transaction carrying a sub-transaction. |

Both forks still reject the node's versioned configuration and need the flattened one, like the releases.

- `ogmios-chain-sync.log`: blocks per era, each test transaction with the fields Ogmios returns, and ledger queries.
- `ogmios-dijkstra-transactions.json`: Ogmios's JSON for the Dijkstra-built test transactions.
- `ogmios-api.log`: submission, rejected submission, mempool monitoring and versioned configuration.
- `kupo-full-chain.log`: the full chain, where Kupo stops at the sub-transaction.
- `kupo-before-sub-transaction.log`: the chain truncated after block 186, with the outputs Kupo indexed for each test transaction.
- `manifest.json`: SHA256 for every retained file.
