# Dijkstra assessment run: 2026-11-01

Target: official node 11.2.0, commit `dac0d7ab2dfdee1f9eda901589e3c6ac8eaa1899` (tagged prerelease), CLI 11.6.0.0.
The release API response and published component pins are retained here. See `provenance.json` for recipe hashes and limits.

- `comparison.json`: comparison with the complete prior assessment in `../../dijkstra-history/2026-10-26-integration/`.
- `transactions-labeled.txt` and `transaction-ids.json`: 17 envelope/mempool encodings; all eight mempool ids match their envelopes.
- `blocks.txt.gz`: 168 raw, unwrapped Dijkstra blocks for CSL. `blocks-hfc.txt.gz`: HFC-wrapped versions plus one Conway control for CML.
- Probe and service logs: observed results, including failing checks. A log called `*-build` is not proof of runtime success.
- `source-observations.tar.gz`: immutable source files with repo/revision/path indexes, default-branch/release observations and compare responses.
- `build-inputs/`: resolved Rust/npm locks, Go binary module inventories, Python freeze, toolchain versions and image digests.
- `manifest.json`: SHA256 for every retained file. Testnet signing keys, private credentials and chain databases are excluded.

Source releases are not runtime verification. Exact offline fixtures and pinned binaries support deterministic replay;
live network timing and fresh dependency resolution vary. Historical control versions and local tool patches are labelled
in `../../dijkstra/devnet.json`; they are not claims about every currently deployed version. Koios and advanced Dijkstra
transaction bodies were not exercised. The old 11.8 API dependency solves were not rerun against 11.11.
