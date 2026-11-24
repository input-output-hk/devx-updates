// The Ogmios calls a wallet or dApp backend makes with a Dijkstra transaction, against a live devnet.
// Usage: node api.mjs ws://127.0.0.1:1337 payment.hex [guard.hex]
//   payment.hex: a signed Dijkstra payment not yet submitted. It is evaluated, submitted, watched in the mempool and
//   submitted again (which the node must reject).
//   guard.hex: optionally, a signed transaction with a PlutusV4 guard; only evaluated, never submitted.
// Prints one line per call with Ogmios's reply, or "connection dropped" when the server closes the socket instead of
// replying. Exits 0 unless the connection cannot be opened.
import { readFileSync } from "node:fs";

const [url, paymentFile, guardFile] = process.argv.slice(2);
const read = (f) => readFileSync(f, "utf8").trim();
let ws, next = 0;
const pending = new Map();
const connect = () => new Promise((resolve, reject) => {
  ws = new WebSocket(url);
  ws.onopen = resolve;
  ws.onerror = reject;
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    const done = Number.isInteger(m?.id) ? pending.get(m.id) : undefined;
    if (typeof done !== "function") return;
    pending.delete(m.id);
    done(m);
  };
  ws.onclose = () => { for (const done of pending.values()) done({ dropped: true }); pending.clear(); };
});
const rpc = (method, params) => new Promise((resolve) => {
  if (ws.readyState !== WebSocket.OPEN) return resolve({ dropped: true });
  const id = next++;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ jsonrpc: "2.0", method, params, id }));
  setTimeout(() => { if (pending.delete(id)) resolve({ timeout: true }); }, 15000);
});
const show = (label, m) => {
  const text = m.dropped ? "connection dropped, no reply" : m.timeout ? "no reply within 15 s"
    : m.error ? `ERROR ${JSON.stringify(m.error).slice(0, 400)}` : `ok ${JSON.stringify(m.result).slice(0, 400)}`;
  console.log(`${label}: ${text}`);
  return m;
};
const call = async (label, method, params) => {
  if (ws.readyState !== WebSocket.OPEN) await connect();
  return show(label, await rpc(method, params));
};

await connect();
const payment = read(paymentFile);
await call("evaluateTransaction (payment)", "evaluateTransaction", { transaction: { cbor: payment } });
if (guardFile) await call("evaluateTransaction (PlutusV4 guard)", "evaluateTransaction", { transaction: { cbor: read(guardFile) } });
await call("submitTransaction (payment)", "submitTransaction", { transaction: { cbor: payment } });
await call("acquireMempool", "acquireMempool");
await call("sizeOfMempool", "sizeOfMempool");
await call("nextTransaction", "nextTransaction", { fields: "all" });
await call("releaseMempool", "releaseMempool");
await call("submitTransaction (same payment again)", "submitTransaction", { transaction: { cbor: payment } });
ws.close();
