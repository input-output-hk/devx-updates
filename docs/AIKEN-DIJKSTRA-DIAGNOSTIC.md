# Aiken Dijkstra diagnostic guide

Assessment date: 2026-10-30. Target: cardano-node **11.2.0**, with a local
network actually running Dijkstra at **protocol version 12**.

Existing Aiken V3 validators are not invalidated simply because Dijkstra adds
V4. The immediate diagnostic priorities are **transaction decoding, evaluator
agreement with the ledger, and execution budgets for existing scripts**. V4
compilation and the new transaction features are an additional compatibility
track. A green `aiken check` does not establish either track on its own.

This guide follows [ADR-2 and ADR-3](ARCHITECTURE.md): keep reviewable evidence
in the repository and distinguish an observation from a readiness verdict.
The readiness registers retain their original historical target; this guide
does not relabel old devnet results as tagged-release results.

## Versions to keep separate

| Item | Examined version | Consequence |
| --- | --- | --- |
| Installed Aiken executable | `v1.1.24+bacbeb3`; source commit `bacbeb35fbc9f1db93cd2e1e93fb1d93053acb4a` | The executed smoke results below belong to this binary. |
| Local `~/iog/aiken` checkout | Clean at `2a0475328be2fc361251be864b825c936fefb63b`, workspace version 1.1.24 | Source findings refer to this later commit; rebuild to attach runtime results to it. |
| Aiken's Pallas dependencies | Manifest `0.35.0`, lockfile `0.35.1` | Test the resolved version; a manifest bound is not the installed library version. |
| Previous readiness devnet | Node integration commit `34ae34db891105d2d17ad9b2704cb56423103da6` | Existing runtime failures require replay against the tag. |
| Tagged node | `11.2.0`, `dac0d7ab2dfdee1f9eda901589e3c6ac8eaa1899` | Published October 28 as a prerelease; binary installation is not hard-fork activation. |

The release keeps **cardano-ledger-dijkstra 0.4.0.0 at `54e24ba4`** and
**plutus-ledger-api 1.71.0.0 at `261766ad`**, the same revisions used by our
change register. Those source readings remain relevant. It advances
cardano-api to 11.11.0.0, cardano-cli to 11.6.0.0, consensus to 5.2.0.0 and
network to 2.0.0.0. The old runtime evidence cannot establish their behavior.
[Release and dependency table](https://github.com/IntersectMBO/cardano-node/releases/tag/11.2.0).

Keep **ledger language** (V1–V4), **UPLC program version** (for example 1.1.0
or 1.2.0), **protocol major version** (10/11/12), and **node software version**
separate in every result. Dijkstra activation is PV12; selected later features
belong to PV13. [Official scope](https://github.com/IntersectMBO/cardano-node/issues/6634).

## What existing checks establish

| Existing evidence | What it establishes | What it does not establish |
| --- | --- | --- |
| [boundary.json](../content/readiness/dijkstra/boundary.json), Aiken entry | V4 enum and Guarding handler/context gaps, from source. | Failure of all deployed V3 contracts. |
| [leads.json](../content/readiness/dijkstra/leads.json), Aiken through Pallas | Simulator uses explicit old-era transaction decoding; Pallas block decoding is not reached. | That simulator decoding supports Dijkstra, or that a dependency bump alone fixes it. |
| [devnet.json](../content/readiness/dijkstra/devnet.json) | 14 checks, 42 results against the integration node, including codec/service failures and basic transaction controls. | Aiken evaluator conformance, execution-budget parity, or existing validator survival on 11.2.0. There is no Aiken runtime check here. |
| [transactions.sh](../scripts/readiness/devnet/transactions.sh) | Payment, registration, signer and metadata submission examples. | Script spending/minting, V4, guards, nested scripts, or script-context equality. |
| Aiken's own conformance tests | V2 results at PV11; V3 results and budgets at PV11. | PV12 or V4 conformance. V2 budget comparison is explicitly disabled because its fixtures mix upstream revisions. |

`node --import tsx scripts/readiness/cli.ts check-devnet` passed register
validation during this assessment. It checks recorded subjects, recipes and
evidence links; it does **not** rerun the devnet. In this sandbox the equivalent
`npm run readiness -- check-devnet` hit a tsx IPC permission error; the direct
Node invocation avoids that wrapper.

## What breaks and what should continue working

| Capability | Finding | Classification |
| --- | --- | --- |
| Existing V3 source compilation, ordinary UPLC arithmetic | Local controls pass. Existing V3 ledger contexts remain supported upstream. | Expected to continue for compatible transactions; deployed-script node replay is still required. |
| V4 project target | `plutus = "v4"` is rejected. | Missing new-language authoring support. |
| Guard purpose | Compiler and transaction context only have the six existing purposes. | Missing new-purpose support; adding a handler name alone is insufficient. |
| Dijkstra transaction simulation | Three-element outer transaction arrays fail the CLI's Conway decoder. | Concrete tooling failure before script evaluation. |
| Arrays | `lengthOfArray` crashes the installed text parser; array builtin tags 89–91 and array Flat types are absent in examined source. | Existing PV11 coverage gap that also affects PV12, not a V4-only feature. |
| UPLC 1.2 constructor Data-case | Valid `Data.Constr` case probe fails locally; upstream enables it at PV12 with PLC 1.2. | Missing PV12 evaluator behavior. |
| Protocol-aware evaluation | Rust APIs exist, but every PV >= 11 selects D/E; upstream PV12 selects F/G. | Source-confirmed selection gap; specific behavioral differences require differential fixtures. |
| Native Value builtins | Already substantially implemented; source restricts them to V3, unlike upstream batch availability for V1/V2 too. | Availability mismatch, not blanket missing Value support. |
| Execution-unit estimates | CLI uses embedded defaults without protocol/cost-model selection. | Cannot certify agreement with a network's actual costs. |
| Old scripts combined with new transaction fields | Several combinations deliberately fail ledger context translation. | Transaction construction restrictions; do not diagnose these as compiler regressions. |
| Pallas block decoding and node handshake | Not the shipped Aiken compiler/simulator path examined here. | Diagnose the application/provider that reaches them separately. |

Legacy languages are explicitly supported by the
[Dijkstra translator](https://github.com/IntersectMBO/cardano-ledger/blob/54e24ba4858b5f5cb4c5f6f0adfa3d7cae669b7a/eras/dijkstra/impl/src/Cardano/Ledger/Dijkstra/TxInfo.hs#L309).
Builtin and PLC availability come from the released
[Plutus version tables](https://github.com/IntersectMBO/plutus/blob/261766ad1d582bce8c86bad1af7a3b0e5355b21c/plutus-ledger-api/src/PlutusLedgerApi/Common/Versions.hs#L291).

## Run the small reproductions first

The [offline runner](../scripts/readiness/aiken-dijkstra-smoke.py) creates fresh
temporary projects and fixtures, records the executable hash, commands, exit
codes and complete output, and leaves the Aiken checkout untouched. It needs
Python 3 and an Aiken executable; it does not start or submit to a node.

```sh
cd ~/projects/devx-updates
python3 scripts/readiness/aiken-dijkstra-smoke.py --source ~/iog/aiken
```

Use `--aiken /absolute/path/to/aiken` to test a newly built binary. `--source`
records a checkout identity; it does not prove that the executable came from
that checkout. The runner reports observations and does not turn expected
negative cases into a single readiness score.

Observed on `v1.1.24+bacbeb3`:

| Probe | Actual result | Meaning |
| --- | --- | --- |
| Build V3 `else(_) { True }` | Exit 0; blueprint generated | Compiler control. |
| Build identical project with `plutus = "v4"` | Exit 1; unknown variant `v4` | Configuration does not support V4. |
| Declare `guard(...)` handler | Exit 1; unknown purpose | Existing purpose vocabulary; this is a diagnostic spelling, not a proposed final V4 API. |
| Conway structural transaction, with/without metadata | Exit 0, `[]` | Decoder control; no scripts were evaluated. |
| Corresponding Dijkstra structural transaction | Exit 1, during context parsing | New outer shape cannot pass the CLI decoder. |
| UPLC `addInteger 2 3` | Exit 0, integer 5 | Evaluator control. |
| Bare `lengthOfArray` builtin | Exit 101; parser `unwrap()` panic, function not found | Parser failure, not a ledger rejection or a complete runtime array test. |
| Data constructor case below | Exit 1; non-constructor scrutinee error | Missing constructor Data-case support. |
| `shiftByteString #01 1` | Exit 0, `#02` | Bytestring control. |
| Shift/rotate count `2^63` | Exit 1 | **Expected upstream failure too**: count must fit Int64. |
| Case over integer Data | Exit 1 | **Expected upstream failure too**: Data-case supports constructor-shaped Data only. |

The decoder pair is deliberately minimal:

```text
Conway:  84a3008001800200a0f5f6
Dijkstra:83a3008001800200a0f6
Inputs:  80
Outputs: 80
```

Both carry body `{0: [], 1: [], 2: 0}` and empty witnesses; the Dijkstra form
omits the outer `is_valid` boolean. Empty inputs/outputs and zero fee make
these **structural probes, not ledger-valid transactions**. Follow them with
actual node-produced CBOR and resolved UTxOs. Metadata variants are included
because a decoder may mishandle the third field rather than reject all forms.

The positive constructor Data-case fixture is:

```text
(program 1.2.0
  (case (con data (Constr 0 []))
    (lam fields (con integer 7))))
```

At PV12/PLC 1.2 the reference evaluator should select branch zero, pass the
fields as one list argument, and return 7. This expectation is source-derived;
the reference evaluator was not executed in this assessment. Pair it with
PV11/PLC 1.2 and PV12/PLC 1.1 negative gates, nonzero constructor tags, nested
fields, and a missing branch. Do not substitute `(I 7)` as a positive case.
[Data-case implementation](https://github.com/IntersectMBO/plutus/blob/261766ad1d582bce8c86bad1af7a3b0e5355b21c/plutus-core/plutus-core/src/PlutusCore/Default/Universe.hs#L1040),
[activation gates](https://github.com/IntersectMBO/plutus/blob/261766ad1d582bce8c86bad1af7a3b0e5355b21c/plutus-ledger-api/src/PlutusLedgerApi/Common/Eval.hs#L145).

## Establish the source baseline in Aiken

Use a disposable checkout for tests that generate blueprints and acceptance
artifacts. This preserves your working checkout and gives each result an exact
revision. The current manifest requires Rust 1.94.1; the cargo/rustc shims in
this session failed to find their executable, so **source tests were not run**.
Resolve the toolchain before interpreting any build failure as Dijkstra-related.

```sh
export AIKEN_SRC="$HOME/iog/aiken"
export AIKEN_DIAG=$(mktemp -d /tmp/aiken-source-diagnostic.XXXXXX)
git clone --no-hardlinks "$AIKEN_SRC" "$AIKEN_DIAG/repo"
cd "$AIKEN_DIAG/repo"
git checkout --detach 2a0475328be2fc361251be864b825c936fefb63b
git rev-parse HEAD
rustc --version
cargo --version
cargo tree --locked -p uplc > "$AIKEN_DIAG/dependencies.txt"
cargo build --locked -p aiken

python3 "$HOME/projects/devx-updates/scripts/readiness/aiken-dijkstra-smoke.py" \
  --aiken "$AIKEN_DIAG/repo/target/debug/aiken" \
  --source "$AIKEN_DIAG/repo" --out "$AIKEN_DIAG/smoke"

cargo test --locked -p uplc --lib
cargo test --locked -p uplc --test conformance -- --nocapture
cargo test --locked -p aiken-lang
cargo test --locked -p aiken-project
```

For regression completion, run `cargo test --locked --workspace`, the
`hello_world`, `gift_card` and `monorepo` examples, then `bash ci` from
`examples/acceptance_tests` in that disposable checkout. The acceptance driver
needs `jq` and `cbor-diag` (`cbor-diag-cli`). These are the repository's
[existing CI paths](https://github.com/aiken-lang/aiken/blob/2a0475328be2fc361251be864b825c936fefb63b/.github/workflows/tests.yml#L38).

Useful focused filters, each in its own `cargo test --locked -p uplc FILTER`
invocation, are `protocol_versions_select_ledger_semantics`,
`plutus_v3_350_entry_cost_model_parses_pv11_tail`,
`flat_rejects_malformed_value_payloads`, and `tx::`. The existing
`value_builtins_unavailable_before_van_rossem_or_outside_v3` test encodes the
V3-only assumption: compare it with upstream before treating its pass as proof.

## Where to inspect and extend the main repository

Paths below are relative to `~/iog/aiken`, at the examined source revision.

| Surface | Starting points | Required check |
| --- | --- | --- |
| Target and blueprint | `crates/aiken-lang/src/plutus_version.rs:6`; `crates/aiken-project/src/config.rs:436`; `crates/aiken-lang/src/gen_uplc.rs:422` | V4 enum/config, correct PLC version, blueprint language, envelope type and script hash; preserve old V3 output. |
| Purpose dispatch | `crates/aiken-lang/src/ast.rs:35`; `tipo/infer.rs:280`; `crates/uplc/src/tx/script_context.rs:51` | Guard parser/typechecker/codegen, redeemer discovery/indexing, script info and handler arguments. |
| Protocol semantics | `crates/uplc/src/machine/runtime.rs:49` | Add and test PV12 F/G selection; retain the pre-fork expectations. Passing `12` currently selects D/E. |
| Program well-formedness | `crates/uplc/src/ast.rs:1735`; `flat.rs`; `machine.rs:433` | Distinguish generic parsing from ledger-valid language/PV/PLC combinations; evaluator entry points discard the program version. |
| Builtins and constant types | `crates/uplc/src/builtins.rs:134`; `parser.rs`; `flat.rs:659`; `machine/runtime.rs` | Arrays through every layer, Value availability across languages, malformed inputs and Flat IDs. Array cost names already exist. |
| Costs | `crates/uplc/src/machine/cost_model.rs:2825`; `crates/uplc/src/tx/eval.rs` | Network coefficients, order, exact CPU/memory, remaining-budget enforcement and default/explicit-cost paths. |
| Transaction decode | `crates/aiken/src/cmd/tx/simulate.rs:107`; `crates/uplc/src/tx.rs:265` | CLI and library paths separately; new envelope, body fields, witnesses, script references and era types. |
| Context translation | `crates/uplc/src/tx/script_context.rs`; `to_plutus_data.rs` | Exact serialized Data against ledger-generated contexts, all purposes, V4 layout and old-language restrictions. |
| Governance baseline hazard | `crates/uplc/src/tx/to_plutus_data.rs:1038` | A proposal containing cost-model updates reaches `unimplemented!`; add a fixture alongside the existing `...no_cost_models` snapshot. |
| Test coverage | `crates/uplc/tests/conformance.rs`; `crates/uplc/src/tx/tests.rs`; acceptance script-context fixtures | Separate PV11/PV12 fixtures and coefficients; add V1/V4 coverage and restore coherent V2 budget comparisons. |

[Pinned Aiken source](https://github.com/aiken-lang/aiken/tree/2a0475328be2fc361251be864b825c936fefb63b).

### Differential evaluator tests

Use the **released Plutus revision `261766ad` as the reference**, not an
unrelated latest `uplc` executable. For each vector compare the normalized
result or failure stage, logs, CPU and memory. Run the same exact script bytes
and arguments under language × protocol × PLC-version combinations, including
combinations the ledger must reject.

Use Aiken's Rust `Program::eval_as_with_protocol` with explicit cost parameters
and budget. For transaction fixtures use `tx::eval_phase_two_with_protocol`
with explicit `CostModels`, resolved inputs, slot configuration and budget.
These APIs still need fixes; their value is exposing the variables to the test.
The current `aiken uplc eval` and `aiken tx simulate` commands lack the controls
needed for this comparison. Also test reference ledger deserialization and
well-formedness, since a CEK machine result alone bypasses availability checks.

| Test family | Positive cases | Negative or boundary cases |
| --- | --- | --- |
| Existing scripts | Saved production/test V3 bytes; spending, minting, withdrawal, certificate, vote and proposal handlers | Wrong datum/redeemer, missing signer, unexpected purpose, deliberate validation failure; classify final Unit/Bool/Integer results using the ledger's language-specific success rule. |
| PV12 semantics | Correct F for V1/V2 and G for V3/V4 | Preserve D/E at PV11; check changed integer restrictions against the reference, not assumptions about all integer bounds disappearing. |
| Arrays | Fully forced/applied list-to-array, length and index; Flat round trip; typed empty arrays | Invalid index, wrong element types, malformed Flat, unavailable-version gates. Bare builtin parsing is only the first test. |
| Value | Existing 98 imported cases plus V1/V2 availability | Duplicate/noncanonical assets, overflows, invalid policy/name lengths, unavailable protocol; keep language and PLC gates distinct. |
| Data-case | Constructor zero/nonzero, empty/nested fields, correct list argument | Missing branch; non-constructor Data; pre-PV12 and pre-PLC1.2 gates. |
| Costs and limits | Exact node-queried coefficients, each builtin, multiple redeemers | One unit below/at/above required budget; malformed/short/extra cost arrays; exhausted cumulative transaction budget. |
| Numeric and crypto controls | Signed division/modulo, byte boundaries, existing BLS/expMod vectors | Shift/rotate outside Int64 remain failures; independently verify expMod and MSM limits, malformed points and negative cases. |

Upstream batches 1–6, including arrays and Value, are available to V1–V3 from
PV11 and V4 from PV12. Batch 7 is future-only, so do not require it for this
diagnostic. [Availability and Flat IDs](https://github.com/IntersectMBO/plutus/blob/261766ad1d582bce8c86bad1af7a3b0e5355b21c/plutus-ledger-api/src/PlutusLedgerApi/Common/Versions.hs#L291).
The F/G selection is explicit in the
[V1](https://github.com/IntersectMBO/plutus/blob/261766ad1d582bce8c86bad1af7a3b0e5355b21c/plutus-ledger-api/src/PlutusLedgerApi/V1/EvaluationContext.hs#L58)
and [V3](https://github.com/IntersectMBO/plutus/blob/261766ad1d582bce8c86bad1af7a3b0e5355b21c/plutus-ledger-api/src/PlutusLedgerApi/V3/EvaluationContext.hs#L51)
evaluation contexts.

The current Aiken cost-name tables have 332/332/350 entries for V1/V2/V3.
Initialization zips names to values, supplies sentinel values for absent
parameters, and ignores an extra tail. Test that behavior against the exact
ledger model and its compatibility rules; do not assume it panics, or that a
successfully loaded array proves correct costing. The CLI's embedded defaults
are not evidence of enacted network parameters.

### V4 context and encoding tests

Create golden contexts from the reference ledger and compare exact PlutusData,
not just pretty-printed field names. V4 changes **TxInfo and ScriptContext to
Data lists**, adds the own script hash to ScriptContext, changes field ordering
and types, adds subtransaction index/deposits/balance intervals/guards, and
omits the fee field. Guarding is a new purpose. Simply changing a V3 blueprint's
version label does not migrate its context decoder.
[V4 context definitions and encodings](https://github.com/IntersectMBO/plutus/blob/261766ad1d582bce8c86bad1af7a3b0e5355b21c/plutus-ledger-api/src/PlutusLedgerApi/V4/Contexts.hs#L349).

Check V4 language/cost-model key 3, script namespace tag 4, witness key 8 and
auxiliary-data key 5 across blueprint, hashing, inline/reference script paths,
witness discovery and script integrity hash. Reuse the six old purposes as
controls; add Guarding and mixed-purpose redeemer ordering.
[Dijkstra CDDL](https://github.com/IntersectMBO/cardano-ledger/blob/54e24ba4858b5f5cb4c5f6f0adfa3d7cae669b7a/eras/dijkstra/impl/cddl/data/dijkstra.cddl).

## Replay against the tagged node

The existing [devnet recipe](../scripts/readiness/devnet/README.md) is a useful
starting point, but **its `env.sh` assigns the old revision and tarball
unconditionally**. An exported `NODE_REVISION` does not retarget it. Copy the
recipe and edit both constants in the copy; use a fresh short `DEVNET_DIR` so
an old binary or chain cannot be reused accidentally.

```sh
export DIJKSTRA_RECIPE=$(mktemp -d /tmp/dijkstra-11.2-recipe.XXXXXX)
cp -R "$HOME/projects/devx-updates/scripts/readiness/devnet/." "$DIJKSTRA_RECIPE/"
export DEVNET_DIR=$(mktemp -d /tmp/dj112.XXXXXX)

python3 - <<'PY'
import os
from pathlib import Path
p = Path(os.environ['DIJKSTRA_RECIPE']) / 'env.sh'
s = p.read_text()
s = s.replace('NODE_REVISION=34ae34db891105d2d17ad9b2704cb56423103da6',
              'NODE_REVISION=dac0d7ab2dfdee1f9eda901589e3c6ac8eaa1899')
s = s.replace('NODE_TARBALL=https://ci.iog.io/build/15172667/download/1/cardano-node-11.1.1-linux.tar.gz',
              'NODE_TARBALL=https://github.com/IntersectMBO/cardano-node/releases/download/11.2.0/cardano-node-11.2.0-linux-amd64.tar.gz')
p.write_text(s)
PY

cd "$DIJKSTRA_RECIPE"
bash start.sh
```

This is an adaptation recipe, **not an executed 11.2.0 devnet result**. It uses
the official Linux amd64 asset. Its published SHA256 is
`8b287e300ffb2063522fc33d50da6ecee8fa10fc7445c906fae0ca9783db8e03`.
For another architecture select its release asset. Before accepting results,
record all three binary versions (`cardano-node`, `cardano-cli`,
`cardano-testnet`) and review generated configuration/genesis and CLI help.
The release changed configuration envelopes and Dijkstra CLI options; fix
harness errors before classifying Aiken. The older recipe's download comment
will also need updating if you retain the copy.

In another Bash terminal, set the **same** `DEVNET_DIR` and recipe path. Run
`bash hardfork.sh 11`, then `bash hardfork.sh 12 PREVIOUS_ACTION_TXID` using the
first action's printed ID, **if queries show those transitions are needed**.
The previous test trigger changed the era while leaving protocol version 10.
Do not infer PV12 from the era name or elapsed time.

```sh
source "$DIJKSTRA_RECIPE/env.sh"
"$B/cardano-node" --version
"$B/cardano-cli" --version
"$B/cardano-testnet" --version
cli query tip "${M[@]}" > "$DEVNET_DIR/tip.json"
cli query protocol-parameters "${M[@]}" > "$DEVNET_DIR/pparams.json"
jq -e '.protocolVersion.major == 12' "$DEVNET_DIR/pparams.json"
```

Save complete parameter JSON and exact ordered arrays for each language;
lexicographically sorting cost-model names is not a valid way to reconstruct
the ledger's parameter order. Record model lengths and hashes. Derive
simulation slot length/zero-slot/zero-time from this devnet: Aiken's defaults
are mainnet values, while this recipe uses short slots.

For each script transaction, use explicit `cardano-cli dijkstra` commands.
Check `transaction build --help` and `transaction submit --help` for this
version. Build/evaluate with the node, submit and confirm the resulting UTxO,
then replay the same captured script/context/cost inputs through Aiken. Save
both total budgets and each redeemer's budget. A successful submission alone
does not show a script succeeded: confirm its on-chain validity and intended
outputs, particularly when testing intentional phase-two failures.

Run two controls before new features: a plain payment and an ordinary V3
spend with unchanged, previously compiled bytes. Also preserve pre-fork
spendable outputs and spend them after the fork, including reference scripts.
Recompiling first would obscure whether existing deployed bytes remain usable.

### Ledger transaction matrix

Every negative test needs a valid positive control differing in one feature.
Use independent funded inputs so a previous submission does not create an
unrelated double-spend error. Build complete witnesses/collateral and adequate
fees before judging the feature under test.

| Case | Expected outcome or question |
| --- | --- |
| Existing V3, ordinary spend/mint/withdraw/publish/vote/propose | Positive controls with correct existing contexts; compare node and Aiken budgets. |
| Inline datum, datum hash, reference input, reference script, metadata and multiple redeemers | Positive supported cases; compare context bytes, script selection and redeemer indexes. |
| Conway-built transaction after fork | Test actual contents; payments may work while removed encodings fail. Also capture Dijkstra-produced three-element bytes. |
| Legacy V1–V3 script executed inside a subtransaction | Reject with `UnsupportedScriptInSubTx`. |
| Top-level legacy script plus direct deposits | Reject with `DirectDepositsNotSupported`. |
| Top-level legacy script plus account balance intervals | Reject with `AccountBalanceIntervalsNotSupported`. |
| Top-level legacy script plus script credentials in guards | Reject with `GuardScriptHashesNotSupported`; key-only guards provide a control. |
| Top-level legacy script plus required top-level guards | Reject with `RequiredTopLevelGuardsNotSupported`. |
| Top-level V3 plus no-script/V4 subtransaction | Positive candidate if other rules hold; the top level must self-balance in legacy mode. A subtransaction funding the parent can trigger `ValueNotConservedInLegacyMode`. |
| Starting account balance intervals | Test separately from ordinary account balance intervals; the cited legacy compatibility guard does not blanket-reject this field. |
| Pointer addresses in V4 inputs, reference inputs or outputs | Reject through V4 context translation. |
| Pointer address in collateral return | Rejected by the Dijkstra UTxO rule, independently of script language. |
| Pointer address in ordinary legacy V3 context | Compare with pre-fork control; do not predict failure from the V4 translator. |
| Legacy certificate types 0/1, array-encoded redeemers and other removed CBOR forms | Expected new-era rejection; distinguish builder/codec failure from Aiken script execution. |
| V4 spend/guard, nested V4 scripts, account features | Positive new-feature fixtures from a V4-capable reference toolchain; Aiken currently cannot author them. |
| Protocol-parameter proposal containing cost models | Test an existing V3-compatible case too; isolates the current Aiken context-conversion panic from Dijkstra changes. |
| Required result, script failure, missing/extraneous redeemer and cumulative budget exhaustion | Confirm Aiken never reports successful validation where ledger validation fails. |

Exact legacy error fixtures are in
[TxInfoSpec](https://github.com/IntersectMBO/cardano-ledger/blob/54e24ba4858b5f5cb4c5f6f0adfa3d7cae669b7a/eras/dijkstra/impl/testlib/Test/Cardano/Ledger/Dijkstra/TxInfoSpec.hs#L269),
with restrictions in
[TxInfo](https://github.com/IntersectMBO/cardano-ledger/blob/54e24ba4858b5f5cb4c5f6f0adfa3d7cae669b7a/eras/dijkstra/impl/src/Cardano/Ledger/Dijkstra/TxInfo.hs#L486).
Mixed-transaction balancing and collateral-return pointer checks are in
[UTxO rules](https://github.com/IntersectMBO/cardano-ledger/blob/54e24ba4858b5f5cb4c5f6f0adfa3d7cae669b7a/eras/dijkstra/impl/src/Cardano/Ledger/Dijkstra/Rules/Utxo.hs#L245).

**Correction to existing register prose:** `plutus-legacy-mode` currently says
legacy scripts fail when any output contains a pointer stake reference. Its
cited `PointerPresentInOutput` constructor does not establish that claim: the
check is in the
[V4 translator](https://github.com/IntersectMBO/cardano-ledger/blob/54e24ba4858b5f5cb4c5f6f0adfa3d7cae669b7a/eras/dijkstra/impl/src/Cardano/Ledger/Dijkstra/TxInfo.hs#L636).
Keep V4 context pointers, legacy context pointers and collateral-return
pointers as separate tests before updating that register.

## Application checks and the completion criteria

Finally run one real application through its normal SDK/provider path using
the same pinned validator. Verify fresh tip/UTxO and parameter responses,
evaluation, submission and confirmed effects. The existing devnet showed
some indexers stopping at the fork while their API still served old data.
Compare provider tip to node tip; an HTTP 200 is not proof of Dijkstra support.
Do this only for providers actually used by the application. A block decoder
failure in a provider is not a failure of Aiken compilation.

For each result keep:

- Node/CLI/Aiken/Pallas/stdlib revisions; executable and dependency hashes.
- Network/era/PV/PLC/language; configuration, genesis and slot conversion.
- Exact compiled bytes and hash; transaction CBOR, resolved UTxOs, datum,
  redeemers and expected context Data.
- Full protocol parameters, ordered cost arrays/hash, budget and limit settings.
- Command, exit code, normalized result/error stage, logs, CPU/memory and
  confirmed transaction effect. Store positive and negative controls together.

Use separate verdicts for **existing deployed-script compatibility**, **local
evaluation and cost accuracy**, **Dijkstra transaction handling**, and **V4
authoring/context support**. Mark a failure as pre-existing, introduced at the
fork, an intended ledger rejection, or a harness/provider problem. A Pallas
upgrade cannot close gaps in Aiken's own enums, decoder choices or evaluator.

The practical order is:

1. Rebuild the exact Aiken revision and repeat the offline probes.
2. Establish ordinary V3 spends and exact budgets on the tagged PV12 devnet.
3. Add reference differential tests for protocol selection, arrays, Value
   availability and constructor Data-case; retain deliberate failure controls.
4. Test Dijkstra transaction/context handling and legacy/new-feature boundaries.
5. Complete V4 authoring and real-application/provider checks.

Only then add Aiken-specific executed checks to `devnet.json`, attach them to
the appropriate boundary surfaces, and refresh affected leads. Replacing the
old target metadata and changing readiness without those results would erase
the distinction between source findings and tested compatibility.
