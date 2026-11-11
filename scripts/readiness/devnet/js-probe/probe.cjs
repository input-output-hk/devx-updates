// Decode raw transactions from the Dijkstra devnet with @cardano-sdk/core the way wallets and providers do:
// Serialization.Transaction.fromCbor, then toCore(), then a byte-exact re-encode and the transaction id.
//
//   node js-probe/probe.cjs SDK_DIR < LINES   "name hex" per line; SDK_DIR holds node_modules/@cardano-sdk/core
//
// cardano-js-sdk has no block codec, so only transactions are probed.
const { createRequire } = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const sdkDir = process.argv[2];
if (!sdkDir) {
  console.error('usage: node probe.cjs SDK_DIR < LINES');
  process.exit(1);
}
const req = createRequire(path.join(path.resolve(sdkDir), 'package.json'));
const { Serialization, Cardano } = req('@cardano-sdk/core');
// The package's exports map hides package.json, so read it from disk.
const version = JSON.parse(
  fs.readFileSync(path.join(sdkDir, 'node_modules/@cardano-sdk/core/package.json'), 'utf8')
).version;
console.log(`@cardano-sdk/core ${version}`);

const short = (e) => String(e && e.message ? e.message : e).slice(0, 160);

// What the typed reader sees in the Dijkstra-only fields, so an exact round-trip of preserved bytes is not
// mistaken for support. Prints nothing for versions without these accessors.
const size = (v) => {
  if (v === undefined || v === null) return 0;
  if (typeof v.size === 'function') return v.size();
  if (typeof v.toCore === 'function') return size(v.toCore());
  return v.size ?? v.length ?? Object.keys(v).length;
};
function dijkstraFields(tx) {
  const body = tx.body();
  const parts = [];
  for (const field of ['subTransactions', 'directDeposits', 'guards', 'accountBalanceIntervals']) {
    if (typeof body[field] !== 'function') continue;
    try {
      const n = size(body[field]());
      if (n) parts.push(`${field} ${n}`);
    } catch (e) {
      parts.push(`${field} error: ${short(e)}`);
    }
  }
  try {
    for (const out of body.outputs()) {
      const script = out.scriptRef();
      if (!script) continue;
      const core = script.toCore();
      parts.push(`reference script ${core.version === undefined ? core.__type : `Plutus${Cardano.PlutusLanguageVersion[core.version]}`}`);
    }
  } catch (e) {
    parts.push(`outputs error: ${short(e)}`);
  }
  return parts.length ? `; ${parts.join(', ')}` : '';
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const [name, hex] = line.trim().split(' ');
  if (!hex) return;
  let result;
  try {
    const tx = Serialization.Transaction.fromCbor(hex);
    const core = tx.toCore();
    const roundTrip = tx.toCbor() === hex ? 'round-trip exact' : 'round-trip differs';
    result = `decoded, ${core.body.inputs.length} inputs, ${core.body.certificates?.length ?? 0} certificates, ` +
      `isValid ${tx.isValid()}, id ${tx.getId().slice(0, 16)}…, ${roundTrip}${dijkstraFields(tx)}`;
  } catch (e) {
    result = `decode: ${short(e)}`;
  }
  console.log(`${name.padEnd(34)} head ${hex.slice(0, 4)}: ${result}`);
});
