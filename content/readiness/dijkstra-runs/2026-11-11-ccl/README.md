# cardano-client-lib on a Dijkstra devnet: 2026-11-11

Target: official node **11.2.0**, commit `dac0d7ab2dfdee1f9eda901589e3c6ac8eaa1899`, on a fresh one-pool devnet
(`DEVNET_DIR=/tmp/dj-ccl`, `start.sh`, then `hardfork.sh 11` and `hardfork.sh 12`), protocol version **12.0**.
Transactions were submitted as raw CBOR to `cardano-submit-api` from the same release, the path Blockfrost's
`/tx/submit` uses. UTxOs and protocol parameters came from `cardano-cli dijkstra query`. The analysis is in
[`docs/CCL-DIJKSTRA-DIAGNOSTIC.md`](../../../../docs/CCL-DIJKSTRA-DIAGNOSTIC.md).

| Library build | Revision | Source |
| --- | --- | --- |
| 0.7.3 (stable line) | `f1130177b02761ea15b93a92e385ae0739d27096` | Maven Central |
| 0.8.0-pre7 (newest release) | `9a5d6072718adcf35d25ed9f96aa75d812bbd3ee` | Maven Central |
| `feat/ledger-cbor` (PR #748, unmerged) | `d3324ec367615ed46ea9fc9904f9b73da78bc8fc` | built locally with JDK 21 |
| master (for source reading) | `5ca123ea004f8a4acdb3f61ef829c65cb5113200` | not built |

## Files

- `e2e-0.8.0-pre7.log`, `e2e-0.7.3.log`: QuickTx cases built, signed and submitted by each release
  (`jvm-probe/ccl-e2e/E2E.java`). The first block of `e2e-0.8.0-pre7.log` has two harness errors, corrected in the
  second block: `reg-new` was submitted without the stake key witness that a Conway registration certificate needs,
  and `spend-v3` used CCL's test script `49480100002221200101`, which does not return unit and so fails as Plutus V3.
  Both were rerun with the stake signer and the script `46450101002499` from `advanced.sh`.
- `e2e-dups.log`: the same key added twice as a signer, and two script outputs sharing a datum hash spent together.
- `branch-decode.log`: the 2026-11-09 corpus (`../2026-11-09/transactions-labeled.txt`) read by the branch era-less
  and with `Era.Dijkstra`, each id compared with `../2026-11-09/transaction-ids.json`.
- `branch-build.log`: transactions built with the branch's Dijkstra models, written with `serialize(Era.Dijkstra)`
  and submitted. `body kept` means signing left the body bytes unchanged.
- `branch-tests.log`: the branch's own `common-spec`, `ledger-cbor`, `transaction-spec` and `plutus` test tasks.
- `submitted/`: the CBOR of each submitted transaction (the last attempt of each case).

The test account's mnemonic and the devnet keys are not retained. Transaction ids, slots and keys are specific to this
devnet and are not reproducible; accept/reject outcomes and ledger error constructors are.

## Reproduce

```sh
cd scripts/readiness/devnet
export DEVNET_DIR=/tmp/dj-ccl
./start.sh &                       # then ./hardfork.sh 11 and ./hardfork.sh 12 <txid of the first>
$DEVNET_DIR/node/bin/cardano-submit-api --config <submit config> --testnet-magic 42 \
  --socket-path $DEVNET_DIR/env/socket/node1/sock --port 8191 &
cd jvm-probe/ccl-e2e               # nix shell nixpkgs#jdk21 nixpkgs#maven
./cp.sh 0.8.0-pre7 cp.txt && javac -cp "$(cat cp.txt)" -d cls E2E.java
java -cp "cls:$(cat cp.txt)" E2E 0.8.0-pre7 $DEVNET_DIR/ccl/0.8.0-pre7 init
# fund the printed address, then:
java -cp "cls:$(cat cp.txt)" E2E 0.8.0-pre7 $DEVNET_DIR/ccl/0.8.0-pre7 pay meta reg-legacy reg-new lock-v3 spend-v3 dereg-legacy dereg-new
```

The submit-api of node 11.2.0 reads the new `TraceOptions` configuration; the preview
`share/preview/submit-api-config.json` from the node archive with `RequiresNetworkMagic: RequiresMagic` works.
For the branch, add a Gradle subproject depending on `:quicktx`, `:core`, `:transaction-spec` and `:ledger-cbor`,
build the module jars, and compile `E2E.java` and `BranchProbe.java` against its runtime classpath.
