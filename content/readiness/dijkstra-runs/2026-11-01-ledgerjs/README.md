# Ledger Dijkstra diagnostic evidence

Collected 2026-11-01. Read the [diagnostic report](../../../../docs/LEDGERJS-DIJKSTRA-DIAGNOSTIC.md) for interpretation, remediation and pinned primary-source citations. Reported upstream as [ledgerjs-hw-app-cardano#58](https://github.com/cardano-foundation/ledgerjs-hw-app-cardano/issues/58).

- `host-results.json`: 27 assertions on unmodified ledgerjs `9ce065887bfca145f7a2f46df2ea41b1b47b9640` source, package 8.1.0. Includes silent-field-loss observations, certificate controls, set tagging, reference-script bytes and mocked hash-response pass-through. Records loaded source SHA256 values, Node/TypeScript versions and source directory.
- `ledger/results.json`: 62 offline observations, two era decoders for each of 31 synthetic fixtures, using the CLI 11.6.0.0 binary shipped with node 11.2.0. Every successful decode compares the returned transaction ID against independent Blake2b-256 of the original body bytes. Records executable checksum, version, command, original working directory and complete output.
- `ledger/*.json` except results: exact text-envelope fixtures. Fake UTxOs, dummy signatures/script bytes and no funding. They test decoding and hashing, not ledger-valid transactions.
- `critical-path.json`: the Ledger-related branch recomputed with the same `dijkstraSite`, `toolStates` and `fixGraph` functions and target-selection rule as `/map/dijkstra`. Includes other prerequisites and the map's incremental fix-order result.
- `manifest.json`: checksums of retained evidence and diagnostic runners.

All expected observations were reproduced. This includes expected failures and silent omission; it is not a readiness pass. No physical Ledger, firmware emulator or new node submission was executed. Prior real-node controls are in the separate [11.2.0 run](../2026-11-01/transactions.log).

Reproduce from the `devx-updates` repository root using an existing checkout at the stated revision and an existing TypeScript installation:

```sh
node scripts/readiness/ledgerjs-dijkstra/dijkstra-host-probe.cjs \
  <ledgerjs-checkout-at-9ce0658> \
  node_modules/typescript

python3 scripts/readiness/ledgerjs-dijkstra/dijkstra-ledger-probe.py \
  --cli <node-11.2.0>/bin/cardano-cli \
  --out <output-dir>
```

The host probe runs source through TypeScript transpilation. It does not run the package's full unit suite or typechecked build. The CLI probe needs only Python's standard library and the already provisioned executable. Neither runner installs dependencies or submits to a network.

The original command paths in the captured CLI output refer to the working clone's `doc/research/dijkstra-ledger-results/`; the same fixture bytes are retained here under `ledger/`. Replays can use any output directory. Fixture bytes and expected outcomes are deterministic; timestamps and absolute paths are not.
