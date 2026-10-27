"""Label raw transactions (hex lines on stdin) with their id: blake2b-256 of the body, the array's first item."""
import hashlib, struct, sys

def skip(b, i):
    ib = b[i]; major, info = ib >> 5, ib & 31; i += 1
    if info < 24: n = info
    elif info == 24: n = b[i]; i += 1
    elif info == 25: n = struct.unpack(">H", b[i:i+2])[0]; i += 2
    elif info == 26: n = struct.unpack(">I", b[i:i+4])[0]; i += 4
    elif info == 27: n = struct.unpack(">Q", b[i:i+8])[0]; i += 8
    else: raise ValueError(f"indefinite {ib:#x}")
    if major in (0, 1, 7): return i
    if major in (2, 3): return i + n
    if major == 4:
        for _ in range(n): i = skip(b, i)
        return i
    if major == 5:
        for _ in range(2 * n): i = skip(b, i)
        return i
    return skip(b, i)  # tag: skip the tagged item

for line in sys.stdin:
    raw = bytes.fromhex(line.strip()); end = skip(raw, 1)
    print(hashlib.blake2b(raw[1:end], digest_size=32).hexdigest(), line.strip())
