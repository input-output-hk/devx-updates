// Sync every block from origin through Ogmios (JSON-RPC over WebSocket), then run the ledger queries consumers use.
// Usage: node probe.mjs ws://127.0.0.1:1337 transaction-ids.json [named-transactions.json]
// Prints one line per finding: blocks per era, each named test transaction (found, era, the fields Ogmios gives it),
// and each query's outcome. A named transaction can be absent because the node rejected it (conway-legacy-reg is);
// exits 1 only if chain sync fails.
import { readFileSync, writeFileSync } from "node:fs";

const [url, idsFile, dump] = process.argv.slice(2);
const named = Object.entries(JSON.parse(readFileSync(idsFile, "utf8"))).filter(([name]) => !name.startsWith("mempool-"));
const ws = new WebSocket(url);
let next = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  // Only resolve requests this script sent; ignore replies with an unknown or malformed id.
  const resolve = Number.isInteger(m?.id) ? pending.get(m.id) : undefined;
  if (typeof resolve !== "function") return;
  pending.delete(m.id);
  resolve(m);
};
const rpc = (method, params) => new Promise((resolve) => { const id = next++; pending.set(id, resolve); ws.send(JSON.stringify({ jsonrpc: "2.0", method, params, id })); });
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

const tip = (await rpc("queryNetwork/tip")).result;
console.log(`tip slot ${tip.slot}`);
const eras = {}, txs = new Map();
let failure;
const start = await rpc("findIntersection", { points: ["origin"] });
if (start.error) failure = `findIntersection: ${JSON.stringify(start.error)}`;
for (;;) {
  if (failure) break;
  const m = await rpc("nextBlock");
  if (m.error) { failure = `nextBlock: ${JSON.stringify(m.error).slice(0, 400)}`; break; }
  if (m.result.direction !== "forward") continue;
  const b = m.result.block;
  eras[b.era] = (eras[b.era] ?? 0) + 1;
  for (const t of b.transactions ?? []) txs.set(t.id, { era: b.era, height: b.height, keys: Object.keys(t).sort() , tx: t });
  if (b.slot >= tip.slot) break;
}
console.log(`blocks per era ${JSON.stringify(eras)}`);
console.log(failure ? `chain sync FAILED: ${failure}` : "chain sync reached the tip");
for (const [name, id] of named) {
  const t = txs.get(id);
  if (!t) { console.log(`tx ${name}: not on chain`); continue; }
  console.log(`tx ${name}: ${t.era} block ${t.height}; fields ${t.keys.join(",")}`);
}
// Ogmios's JSON for each named transaction, to check which Dijkstra fields it carries.
if (dump) writeFileSync(dump, `${JSON.stringify(Object.fromEntries(named.map(([name, id]) => [name, txs.get(id)?.tx ?? null])), null, 1)}\n`);
for (const [method, params] of [["queryLedgerState/eraSummaries"], ["queryLedgerState/protocolParameters"], ["queryLedgerState/epoch"], ["queryLedgerState/tip"], ["queryNetwork/genesisConfiguration", { era: "shelley" }]]) {
  const m = await rpc(method, params);
  console.log(`${method}: ${m.error ? `ERROR ${JSON.stringify(m.error).slice(0, 300)}` : `ok ${JSON.stringify(m.result).slice(0, 160)}`}`);
}
ws.close();
process.exit(failure ? 1 : 0);
