"""Print a transaction's top-level shape, body keys, and the raw hex of witness-set entries (hex file on argv)."""
import sys


def head(b, i):
    ib = b[i]; mj, info = ib >> 5, ib & 31; i += 1
    if info < 24: n = info
    elif info in (24, 25, 26, 27):
        k = 1 << (info - 24); n = int.from_bytes(b[i:i + k], "big"); i += k
    elif info == 31: n = None
    else: raise ValueError(hex(ib))
    return mj, n, i


def skip(b, i):
    mj, n, j = head(b, i)
    if mj in (0, 1, 7): return j
    if mj in (2, 3):
        if n is None:
            while b[j] != 0xff: j = skip(b, j)
            return j + 1
        return j + n
    if mj == 6: return skip(b, j)
    cnt = n if n is not None else None
    per = 2 if mj == 5 else 1
    if cnt is None:
        while b[j] != 0xff: j = skip(b, j)
        return j + 1
    for _ in range(cnt * per): j = skip(b, j)
    return j


def entries(b, i):
    mj, n, j = head(b, i)
    assert mj == 5, mj
    out = []
    for _ in range(n):
        k0 = j; j = skip(b, j); v0 = j; j = skip(b, j)
        out.append((b[k0:v0], b[v0:j]))
    return out


b = bytes.fromhex(open(sys.argv[1]).read().strip())
mj, n, j = head(b, 0)
print("tx array of", n)
body = j; wit = skip(b, body)
print("body keys:", [int.from_bytes(k[1:], "big") if len(k) > 1 else k[0] for k, _ in entries(b, body)])
for k, v in entries(b, wit):
    print("wit", k.hex(), v.hex()[:400])
