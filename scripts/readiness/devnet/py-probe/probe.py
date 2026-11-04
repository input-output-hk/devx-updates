"""Decode raw transactions from the Dijkstra devnet with PyCardano the way its consumers do.

    python3 -I py-probe/probe.py < LINES   "name hex" per line (labeled mempool lines, envelopes)

Transaction.from_cbor, the transaction id, and a re-encode compared byte for byte. PyCardano has no block codec,
so only transactions are probed. Run it with the interpreter of a virtual environment that has pycardano installed.
"""
import sys
from importlib.metadata import version

from pycardano import Transaction

print(f"pycardano {version('pycardano')}")
for line in sys.stdin:
    parts = line.split()
    if len(parts) != 2:
        continue
    name, hexed = parts
    try:
        tx = Transaction.from_cbor(bytes.fromhex(hexed))
        again = tx.to_cbor_hex()
        result = f"decoded, {len(tx.transaction_body.inputs)} inputs, id {str(tx.id)[:16]}…, re-encode {'exact' if again == hexed else 'differs'}"
    except Exception as e:  # report every failure the way a consumer would meet it
        result = f"error: {type(e).__name__}: {' '.join(str(e).split())[:160]}"
    print(f"{name:36} head {hexed[:4]}: {result}")
