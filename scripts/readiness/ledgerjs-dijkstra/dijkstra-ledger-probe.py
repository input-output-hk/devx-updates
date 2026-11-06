#!/usr/bin/env python3
"""Offline CLI decoding pairs, not valid/funded transactions or node submission.

Python stdlib only. Leaves every synthetic text envelope and complete CLI result.
Usage: python3 scripts/readiness/ledgerjs-dijkstra/dijkstra-ledger-probe.py --cli /path/cardano-cli --out <output-dir>
"""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess


class Tag:
    def __init__(self, number, value):
        self.number, self.value = number, value


class Pairs:
    def __init__(self, pairs):
        self.pairs = pairs


def head(major, number):
    if number < 24:
        return bytes([major * 32 + number])
    for width, additional in [(1, 24), (2, 25), (4, 26), (8, 27)]:
        if number < 1 << (8 * width):
            return bytes([major * 32 + additional]) + number.to_bytes(width, "big")
    raise ValueError("integer too large")


def cbor(value):
    """Encode only the finite fixture vocabulary; not a general Cardano codec."""
    if value is None:
        return b"\xf6"
    if isinstance(value, bool):
        return b"\xf5" if value else b"\xf4"
    if isinstance(value, int):
        return head(0, value) if value >= 0 else head(1, -value - 1)
    if isinstance(value, bytes):
        return head(2, len(value)) + value
    if isinstance(value, list):
        return head(4, len(value)) + b"".join(map(cbor, value))
    if isinstance(value, Tag):
        return head(6, value.number) + cbor(value.value)
    if isinstance(value, (dict, Pairs)):
        pairs = list(value.items()) if isinstance(value, dict) else value.pairs
        pairs = sorted(((cbor(k), cbor(v)) for k, v in pairs), key=lambda p: (len(p[0]), p[0]))
        return head(5, len(pairs)) + b"".join(k + v for k, v in pairs)
    raise TypeError(type(value))


def run(command):
    result = subprocess.run(command, capture_output=True, text=True, timeout=30)
    return {"command": command, "exitCode": result.returncode, "stdout": result.stdout, "stderr": result.stderr}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cli", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    cli = str(Path(args.cli).resolve())
    addr = bytes.fromhex("60" + "22" * 28)
    reward = bytes.fromhex("e0" + "44" * 28)
    credential = [0, bytes.fromhex("55" * 28)]
    script_credential = [1, bytes.fromhex("33" * 28)]
    body = {0: [[bytes.fromhex("11" * 32), 0]], 1: [[addr, 2000000]], 2: 200000}
    cases = []

    def add(name, changes=None, witnesses=None, legacy=None, conway=True, dijkstra=True):
        candidate = copy.deepcopy(body)
        candidate.update(changes or {})
        cases.append((name, candidate, witnesses or {}, legacy, {"Conway": conway, "Dijkstra": dijkstra}))

    # The target CLI's shared transaction decoder also accepts this in Conway.
    add("ordinary-three-element")
    add("ordinary-four-element-true", legacy=True)
    add("four-element-false", legacy=False, dijkstra=False)
    add("tagged-input-set", {0: Tag(258, body[0])}, legacy=True)
    add("legacy-registration", {4: [[0, credential]]}, legacy=True, dijkstra=False)
    add("legacy-deregistration", {4: [[1, credential]]}, legacy=True, dijkstra=False)
    add("deposit-registration", {4: [[7, credential, 2000000]]}, legacy=True)
    add("deposit-deregistration", {4: [[8, credential, 2000000]]}, legacy=True)
    add("key-hash-required-signer", {14: [credential[1]]}, legacy=True)
    add("key-credential-guard", {14: [credential]}, legacy=True, conway=False)
    add("script-guard", {14: [script_credential]}, legacy=True, conway=False)
    add("direct-deposit", {25: {reward: 1000000}}, legacy=True, conway=False)
    add("account-balance-interval", {26: {reward: [0, 2000000]}}, legacy=True, conway=False)
    add("starting-balance-interval", {27: {reward: [0, 2000000]}}, legacy=True, conway=False)
    add("required-top-level-guard", {24: Pairs([(script_credential, None)])}, legacy=True, conway=False)
    add("nested-transaction", {23: [[{0: [], 1: []}, {}, None]]}, legacy=True, conway=False)
    add("empty-outer-multiasset", {1: [[addr, [2000000, {}]]]}, legacy=True, dijkstra=False)
    add("empty-inner-multiasset", {1: [[addr, [2000000, {b"\x66" * 28: {}}]]]}, legacy=True, conway=False, dijkstra=False)
    add("array-redeemers", witnesses={5: [[0, 0, 0, [1, 1]]]}, legacy=True, dijkstra=False)
    add("map-redeemers", witnesses={5: Pairs([([0, 0], [0, [1, 1]])])}, legacy=True)
    add("v4-script-witness", witnesses={8: [b"\x00"]}, legacy=True, conway=False)
    witness = [b"\x77" * 32, b"\x88" * 64]
    add("duplicate-vkey-witness", witnesses={0: [witness, witness]}, legacy=True, dijkstra=False)
    add("one-vkey-witness", witnesses={0: [witness]}, legacy=True)
    native = [0, b"\x55" * 28]
    add("duplicate-native-script", witnesses={1: [native, native]}, legacy=True, dijkstra=False)
    add("one-native-script", witnesses={1: [native]}, legacy=True)
    add("duplicate-datum", witnesses={4: [0, 0]}, legacy=True, dijkstra=False)
    add("one-datum", witnesses={4: [0]}, legacy=True)
    pool = [3, b"\x55" * 28, b"\x66" * 32, 0, 170000000, Tag(30, [1, 100]), reward, [b"\x55" * 28], [], None]
    add("legacy-pool-registration", {4: [pool]}, legacy=True)
    add("pool-registration-explicit-null-bls", {4: [pool[:3] + [None] + pool[3:]]}, legacy=True, conway=False)
    add("bootstrap-chaincode-31", witnesses={2: [[b"\x77" * 32, b"\x88" * 64, b"\x99" * 31, b"\xa0"]]}, legacy=True, dijkstra=False)
    add("bootstrap-chaincode-32", witnesses={2: [[b"\x77" * 32, b"\x88" * 64, b"\x99" * 32, b"\xa0"]]}, legacy=True)

    observations = []
    for name, candidate, witnesses, legacy, expected in cases:
        transaction = [candidate, witnesses, None] if legacy is None else [candidate, witnesses, legacy, None]
        data = cbor(transaction)
        body_hash = hashlib.blake2b(cbor(candidate), digest_size=32).hexdigest()
        for era in ("Conway", "Dijkstra"):
            file = args.out / f"{name}-{era.lower()}.json"
            file.write_text(json.dumps({"type": f"Tx {era}Era", "description": "Synthetic decoder probe; not a valid signed transaction", "cborHex": data.hex()}, indent=2) + "\n")
            result = run([cli, era.lower(), "transaction", "txid", "--tx-file", str(file), "--output-text"])
            decoded = result["exitCode"] == 0
            hash_match = result["stdout"].strip() == body_hash if decoded else None
            observations.append({"case": name, "era": era, "expectedDecode": expected[era], "decoded": decoded,
                "assertionPassed": decoded == expected[era] and hash_match is not False,
                "fixture": file.name, "fixtureSha256": hashlib.sha256(file.read_bytes()).hexdigest(),
                "bodyHash": body_hash, "hashMatchesOriginalBytes": hash_match, **result})

    with open(cli, "rb") as executable:
        executable_hash = hashlib.file_digest(executable, "sha256").hexdigest()
    output = {"schema": 1, "workingDirectory": os.getcwd(), "scope": "Offline era-specific decoding and body hashing only; no ledger validation, real signatures, device or node submission",
        "cliVersion": run([cli, "--version"]), "cliSha256": executable_hash,
        "assertionsPassed": sum(x["assertionPassed"] for x in observations), "assertionsTotal": len(observations), "results": observations}
    (args.out / "results.json").write_text(json.dumps(output, indent=2) + "\n")
    print(f'{output["assertionsPassed"]}/{len(observations)} expected decoding/hash observations; {args.out / "results.json"}')
    for result in observations:
        if not result["assertionPassed"]:
            print("UNEXPECTED", result["case"], result["era"], result["stderr"], result["stdout"])
    return 0 if all(x["assertionPassed"] for x in observations) else 1


if __name__ == "__main__":
    raise SystemExit(main())
