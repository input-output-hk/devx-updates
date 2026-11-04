"""Offer chosen node-to-client versions to a node socket and print the handshake reply."""
import socket, struct, sys

def uint(major, n):
    if n < 24: return bytes([major << 5 | n])
    if n < 256: return bytes([major << 5 | 24, n])
    if n < 65536: return bytes([major << 5 | 25]) + struct.pack(">H", n)
    return bytes([major << 5 | 26]) + struct.pack(">I", n)

def propose(versions, magic):
    # msgProposeVersions = [0, {version: [networkMagic, query]}]; N2C versions carry bit 15 on the wire.
    body = uint(4, 2) + uint(0, 0) + uint(5, len(versions))
    for v in sorted(versions):
        body += uint(0, v | 0x8000) + uint(4, 2) + uint(0, magic) + b"\xf4"
    return body

def decode(b, i=0):
    ib = b[i]; major, info = ib >> 5, ib & 31; i += 1
    if info < 24: n = info
    elif info == 24: n = b[i]; i += 1
    elif info == 25: n = struct.unpack(">H", b[i:i+2])[0]; i += 2
    elif info == 26: n = struct.unpack(">I", b[i:i+4])[0]; i += 4
    else: raise ValueError(f"unsupported {ib:#x}")
    if major == 0: return n, i
    if major == 1: return -1 - n, i
    if major in (2, 3): return b[i:i+n].decode("utf8", "replace"), i + n
    if major == 4:
        out = []
        for _ in range(n): x, i = decode(b, i); out.append(x)
        return out, i
    if major == 5:
        out = {}
        for _ in range(n): k, i = decode(b, i); v, i = decode(b, i); out[k] = v
        return out, i
    if major == 7: return {20: False, 21: True, 22: None}.get(info, info), i
    raise ValueError(major)

path, magic, versions = sys.argv[1], int(sys.argv[2]), [int(v) for v in sys.argv[3].split(",")]
s = socket.socket(socket.AF_UNIX); s.connect(path)
payload = propose(versions, magic)
s.sendall(struct.pack(">IHH", 0, 0, len(payload)) + payload)
hdr = s.recv(8); _, _, n = struct.unpack(">IHH", hdr)
data = b""
while len(data) < n: data += s.recv(n - len(data))
msg, _ = decode(data)
tags = {1: "accept", 2: "refuse", 3: "queryReply"}
def ver(v): return f"V{v & 0x7fff}" if isinstance(v, int) else v
if msg[0] == 1: print(f"offered V{min(versions)}..V{max(versions)}: accepted {ver(msg[1])} {msg[2]}")
elif msg[0] == 2:
    r = msg[1]
    detail = [ver(v) for v in r[1]] if r[0] == 0 else r[1:]
    print(f"offered V{min(versions)}..V{max(versions)}: refused, reason {['VersionMismatch','HandshakeDecodeError','Refused'][r[0]]} {detail}")
else: print(msg)
