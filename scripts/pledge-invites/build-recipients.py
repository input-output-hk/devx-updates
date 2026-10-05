#!/usr/bin/env python3
"""Pick pledge-invite recipients from data/cardano-graph.json -> recipients.tsv.

Teams are ranked by the stars of their live (active/maintenance/experimental) tools, then
maintainers are taken round-robin (every team's first maintainer, then every team's second, ...)
so the list covers as many teams as possible. Signatories and bots are skipped.

Usage: python3 scripts/pledge-invites/build-recipients.py [N]   (default 100)
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
N = int(sys.argv[1]) if len(sys.argv) > 1 else 100
LIVE = {"active", "maintenance", "experimental"}

graph = json.loads((ROOT / "data/cardano-graph.json").read_text())
signed = {m.lower() for m in re.findall(r"github\.com/([A-Za-z0-9-]+)\)", (ROOT / "content/pledge.md").read_text())}

def stars(s):
    s = str(s or "0").lower().replace(",", "")
    try:
        return float(s[:-1]) * 1000 if s.endswith("k") else float(s)
    except ValueError:
        return 0.0

weight = {}
for node in graph["nodes"]:
    if node.get("status") in LIVE:
        weight[node["team"]] = weight.get(node["team"], 0) + stars(node.get("stars"))

teams = sorted((t for t in graph["teams"].items() if t[0] in weight), key=lambda t: -weight[t[0]])
queues = [(name, [m["login"] for m in t.get("maintainers", [])]) for name, t in teams]

picked, seen = [], set()
depth = 0
while len(picked) < N and any(len(q) > depth for _, q in queues):
    for team, q in queues:
        if len(picked) >= N or len(q) <= depth:
            continue
        login = q[depth]
        key = login.lower()
        if key in seen or key in signed or key.endswith("[bot]"):
            continue
        seen.add(key)
        picked.append((login, team))
    depth += 1

out = Path(__file__).with_name("recipients.tsv")
with out.open("w") as f:
    f.write("# login<TAB>display name (optional; blank = GitHub profile name)<TAB># team, for reference only\n")
    for login, team in picked:
        f.write(f"{login}\t\t# {team}\n")
print(f"wrote {len(picked)} recipients to {out.relative_to(ROOT)}")
