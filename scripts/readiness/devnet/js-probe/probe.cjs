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
const { Serialization } = req('@cardano-sdk/core');
// The package's exports map hides package.json, so read it from disk.
const version = JSON.parse(
  fs.readFileSync(path.join(sdkDir, 'node_modules/@cardano-sdk/core/package.json'), 'utf8')
).version;
console.log(`@cardano-sdk/core ${version}`);

const short = (e) => String(e && e.message ? e.message : e).slice(0, 160);

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const [name, hex] = line.trim().split(' ');
  if (!hex) return;
  let result;
  try {
    const tx = Serialization.Transaction.fromCbor(hex);
    const core = tx.toCore();
    const roundTrip = tx.toCbor() === hex ? 'round-trip exact' : 'round-trip differs';
    result = `decoded, ${core.body.inputs.length} inputs, ${core.body.certificates?.length ?? 0} certificates, ` +
      `isValid ${tx.isValid()}, id ${tx.getId().slice(0, 16)}…, ${roundTrip}`;
  } catch (e) {
    result = `decode: ${short(e)}`;
  }
  console.log(`${name.padEnd(34)} head ${hex.slice(0, 4)}: ${result}`);
});
