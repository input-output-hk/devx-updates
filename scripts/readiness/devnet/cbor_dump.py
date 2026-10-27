"""Print the structure of a CBOR item (hex on argv) to a depth, summarising byte strings by length."""
import struct, sys

def item(b, i):
    ib = b[i]; major, info = ib >> 5, ib & 31; i += 1
    if info < 24: n = info
    elif info == 24: n = b[i]; i += 1
    elif info == 25: n = struct.unpack(">H", b[i:i+2])[0]; i += 2
    elif info == 26: n = struct.unpack(">I", b[i:i+4])[0]; i += 4
    elif info == 27: n = struct.unpack(">Q", b[i:i+8])[0]; i += 8
    elif info == 31: n = None
    else: raise ValueError(hex(ib))
    if major == 0: return n, i
    if major == 1: return -1 - n, i
    if major == 2: return ("bytes", n, b[i:i+n]), i + n
    if major == 3: return b[i:i+n].decode(), i + n
    if major == 4:
        out = []
        if n is None:
            while b[i] != 0xff: x, i = item(b, i); out.append(x)
            return out, i + 1
        for _ in range(n): x, i = item(b, i); out.append(x)
        return out, i
    if major == 5:
        out = {}
        for _ in range(n): k, i = item(b, i); v, i = item(b, i); out[k] = v
        return out, i
    if major == 6: x, i = item(b, i); return ("tag", n, x), i
    return {20: False, 21: True, 22: None}.get(info, ("simple", info)), i

def show(x, depth, ind=""):
    if isinstance(x, tuple) and x[0] == "bytes":
        return f"bytes[{x[1]}]" + (f" {x[2].hex()}" if x[1] <= 8 else "")
    if isinstance(x, tuple) and x[0] == "tag":
        return f"tag {x[1]}(" + show(x[2], depth, ind) + ")"
    if isinstance(x, list):
        if depth == 0: return f"array[{len(x)}]"
        return f"array[{len(x)}]\n" + "\n".join(f"{ind}  [{k}] " + show(v, depth - 1, ind + "  ") for k, v in enumerate(x))
    if isinstance(x, dict):
        if depth == 0: return f"map[{len(x)}]"
        return f"map[{len(x)}]\n" + "\n".join(f"{ind}  {{{k}}} " + show(v, depth - 1, ind + "  ") for k, v in x.items())
    return repr(x)

raw = bytes.fromhex(sys.argv[1]); x, end = item(raw, 0)
print(show(x, int(sys.argv[2])), f"\n(consumed {end} of {len(raw)} bytes)")
