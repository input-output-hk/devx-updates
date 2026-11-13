# Dijkstra assessment run: 2026-11-09

Target: official node 11.2.0, commit `dac0d7ab2dfdee1f9eda901589e3c6ac8eaa1899` (tagged prerelease), CLI 11.6.0.0,
unchanged since the 2026-11-01 run. This run re-tests the newest releases of the critical-path components and adds
transaction bodies the earlier matrix did not exercise. See `provenance.json` for recipe hashes and limits.

- `comparison.json`: comparison with the complete prior assessment in `../../dijkstra-history/2026-11-01-node-11.2.0/`.
- `transactions-labeled.txt` and `transaction-ids.json`: 25 envelope/mempool encodings; every mempool id matches its
  envelope. New: `dijkstra-direct-deposit`, `dijkstra-sub-transaction` and `dijkstra-plutusv4-reference-script`
  (`advanced.sh`), with their split and mempool encodings.
- `blocks.txt.gz`: 247 raw, unwrapped Dijkstra blocks. `blocks-hfc.txt.gz`: HFC-wrapped versions plus one Conway control
  for CML and Yaci. `first-blocks.txt`: the first block of each era.
- Probe and service logs: observed results, including failing checks. `db-sync.log.gz` is the complete db-sync 13.8.0.0
  log; `service-layer.log` drops docker's image-pull progress lines and nothing else.
- `aiken/results.json`: the offline Aiken runner (`scripts/readiness/aiken-dijkstra-smoke.py`) against v1.1.24,
  unchanged since 2026-11-01.
- `build-inputs/`: resolved Cargo locks, Go module inventory, npm locks, Maven classpaths, Python freeze, toolchain
  versions, image digests and binary hashes.
- `manifest.json`: SHA256 for every retained file. Testnet signing keys, private credentials and chain databases are excluded.

## What changed since 2026-11-01

| Component | Tested | Result |
| --- | --- | --- |
| gouroboros | v0.218.2 | Decodes all Dijkstra blocks (fixed in v0.217.0). Still reports ordinary Dijkstra transactions as Conway, and `tx.Cbor()` returns block transactions in the four-element Conway shape. |
| cardano-db-sync | 13.8.0.0 | Decodes Dijkstra blocks and indexes ordinary Dijkstra transactions, then exits on the first PlutusV4 script: its `scripttype` enum has no `plutusV4`. |
| Blockfrost RYO | v7.0.0 (prerelease) | Serves Dijkstra blocks, transactions and protocol version 12 from db-sync 13.8.0.0; `/network/eras` throws. Needs a mounted JSON config: the image reads no `BLOCKFROST_CONFIG_*` variables and has no YAML parser. |
| Pallas | v1.5.0-rc.1, main 3da6ff9f | Decodes every Dijkstra transaction, including the three new bodies, when told the era. Still decodes no block from the node (expects the twelve-field header). |
| cardano-client-lib | 0.8.0-pre7, 0.7.3 | New check. Decodes the direct deposit and sub-transaction but drops those fields, so its transaction id differs from the chain's. |
| Yaci | 0.5.0-pre15 | New check. Decodes no Dijkstra block; the Dijkstra parsing is merged into a feature branch only. |
| @cardano-sdk/core | 0.47.1 | All 25 encodings round-trip exactly, and the typed reader returns the new fields. |
| CSL, CML, PyCardano | unchanged versions | Also fail on all three new bodies. |
| Ogmios, Kupo | unchanged versions | Same failure at the first Dijkstra block. |
| txtop | v0.17.0 | Connects, as released and with gouroboros v0.218.2; its transaction list was not observed. |

Source releases are not runtime verification. Exact offline fixtures and pinned binaries support deterministic replay;
live network timing and fresh dependency resolution vary. Not run: Koios, guards and balance intervals (no CLI options in
11.2.0), executing a PlutusV4 script, the historical patched gouroboros controls, and Ogmios/Kupo against the versioned
configuration. db-sync's handling of direct deposits and sub-transactions was not reached.
