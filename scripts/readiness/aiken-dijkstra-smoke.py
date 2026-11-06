#!/usr/bin/env python3
"""Capture isolated Aiken compatibility probes; this is not a ledger readiness test.

Uses only Python's standard library and the selected Aiken binary. Creates fixtures
in a fresh temporary directory by default, runs offline, and preserves all output.
The transaction fixtures isolate CBOR decoding and are not ledger-valid payments.
See docs/AIKEN-DIJKSTRA-DIAGNOSTIC.md for expected results and the node comparison.
"""

import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--aiken", default="aiken", help="Aiken binary to probe")
    parser.add_argument("--source", type=Path, help="Optional source checkout to record")
    parser.add_argument("--out", type=Path, help="New, nonexistent output directory")
    args = parser.parse_args()
    binary = shutil.which(args.aiken)
    if binary is None:
        parser.error(f"Aiken binary not found: {args.aiken}")
    binary = str(Path(binary).resolve())
    if args.out:
        root = args.out.resolve()
        root.mkdir(parents=True, exist_ok=False)
    else:
        root = Path(tempfile.mkdtemp(prefix="aiken-dijkstra-"))

    report = {
        "recordedAt": datetime.now(timezone.utc).isoformat(),
        "binary": binary,
        "binarySha256": hashlib.sha256(Path(binary).read_bytes()).hexdigest(),
        "scope": "Offline probes; transaction fixtures are structural only. No node verdict.",
        "cases": [],
    }

    def run(name, argv, cwd, purpose):
        try:
            result = subprocess.run(
                argv, cwd=cwd, text=True, capture_output=True, timeout=60,
            )
            row = {"exit": result.returncode, "stdout": result.stdout, "stderr": result.stderr}
        except subprocess.TimeoutExpired:
            row = {"exit": None, "stdout": "", "stderr": "Timed out after 60 seconds"}
        row.update(name=name, command=argv, cwd=str(cwd), purpose=purpose)
        report["cases"].append(row)
        (root / "results.json").write_text(json.dumps(report, indent=2) + "\n")
        print(f"{name:26} exit={str(row['exit']):4} {purpose}")

    run("version", [binary, "--version"], root, "Record executable identity")
    if args.source:
        run("source-revision", ["git", "rev-parse", "HEAD"], args.source.resolve(),
            "Source identity; does not prove this binary was built from it")
        run("source-status", ["git", "status", "--short"], args.source.resolve(),
            "Record local source modifications")

    for version in ("v3", "v4"):
        project = root / version
        (project / "validators").mkdir(parents=True)
        (project / "aiken.toml").write_text(
            f'name = "diagnostic/probe"\nversion = "0.0.0"\nplutus = "{version}"\n'
        )
        (project / "validators/probe.ak").write_text(
            "validator probe {\n  else(_) { True }\n}\n"
        )
        run(f"build-{version}", [binary, "build"], project,
            "V3 compilation control" if version == "v3" else "V4 configuration support")

    project = root / "guard"
    (project / "validators").mkdir(parents=True)
    (project / "aiken.toml").write_text(
        'name = "diagnostic/probe"\nversion = "0.0.0"\nplutus = "v3"\n'
    )
    (project / "validators/probe.ak").write_text(
        "validator probe {\n"
        "  guard(_redeemer: Data, _credential: Data, _transaction: Data) { True }\n}\n"
    )
    run("guard-handler", [binary, "check"], project,
        "Current handler vocabulary; hypothetical guard syntax, not a V4 validator")

    tx_dir = root / "transactions"
    tx_dir.mkdir()
    (tx_dir / "inputs.hex").write_text("80\n")
    (tx_dir / "outputs.hex").write_text("80\n")
    for name, raw in {
        "conway-control": "84a3008001800200a0f5f6",
        "conway-metadata-control": "84a3008001800200a0f5a10001",
        "dijkstra-null": "83a3008001800200a0f6",
        "dijkstra-metadata": "83a3008001800200a0a10001",
    }.items():
        (tx_dir / f"{name}.hex").write_text(raw + "\n")
        run(name, [binary, "tx", "simulate", f"{name}.hex", "inputs.hex", "outputs.hex",
                   "--blueprint", str(root / "v3/plutus.json")], tx_dir,
            "CBOR shape only; empty inputs/outputs are not a ledger-valid transaction")

    uplc_dir = root / "uplc"
    uplc_dir.mkdir()
    cases = {
        "add-control": "(program 1.1.0 [[(builtin addInteger) (con integer 2)] (con integer 3)])",
        "array-builtin": "(program 1.1.0 (builtin lengthOfArray))",
        "shift-small": "(program 1.1.0 [[(builtin shiftByteString) (con bytestring #01)] (con integer 1)])",
        "shift-large": "(program 1.1.0 [[(builtin shiftByteString) (con bytestring #01)] (con integer 9223372036854775808)])",
        "rotate-large": "(program 1.1.0 [[(builtin rotateByteString) (con bytestring #01)] (con integer 9223372036854775808)])",
        "data-case": "(program 1.2.0 (case (con data (Constr 0 [])) (lam fields (con integer 7))))",
        "data-integer-negative": "(program 1.2.0 (case (con data (I 7)) (lam fields (con integer 7))))",
    }
    for name, program in cases.items():
        path = uplc_dir / f"{name}.uplc"
        path.write_text(program + "\n")
        run(name, [binary, "uplc", "eval", str(path)], uplc_dir,
            "Local CLI result; compare with explicit ledger language, protocol and costs")

    print(f"\nFixtures, exact commands and output: {root}")
    print("Runner completion is not a compatibility pass. Inspect each case in results.json.")


if __name__ == "__main__":
    main()
