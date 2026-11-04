// Decode raw transactions and blocks from the Dijkstra devnet with cardano-serialization-lib the way its consumers
// do: Transaction.from_hex and FixedTransaction.from_hex (byte-preserving), Block.from_hex and FixedBlock.from_hex.
//
//   node csl-probe/probe.cjs CSL_DIR txs < LINES      "name hex" per line (labeled mempool lines, envelopes)
//   node csl-probe/probe.cjs CSL_DIR blocks < BLOCKS  "type hex" per line (probe blocks output)
//
// CSL_DIR holds node_modules/@emurgo/cardano-serialization-lib-nodejs.
const { createRequire } = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const [dir, mode] = process.argv.slice(2);
if (!dir || !['txs', 'blocks'].includes(mode)) {
  console.error('usage: node probe.cjs CSL_DIR txs|blocks < LINES');
  process.exit(1);
}
const pkg = path.join(path.resolve(dir), 'node_modules/@emurgo/cardano-serialization-lib-nodejs');
const CSL = createRequire(path.join(path.resolve(dir), 'package.json'))('@emurgo/cardano-serialization-lib-nodejs');
console.log(`cardano-serialization-lib ${JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8')).version}`);

const short = (e) => String(e && e.message ? e.message : e).replace(/\s+/g, ' ').slice(0, 160);
const attempt = (f) => { try { return f(); } catch (e) { return `error: ${short(e)}`; } };
const tally = new Map();
let n = 0;

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const [name, hex] = line.trim().split(' ');
  if (!hex) return;
  n++;
  if (mode === 'txs') {
    const plain = attempt(() => { const tx = CSL.Transaction.from_hex(hex); return `decoded, ${tx.body().inputs().len()} inputs, re-encode ${tx.to_hex() === hex ? 'exact' : 'differs'}`; });
    const fixed = attempt(() => { const tx = CSL.FixedTransaction.from_hex(hex); return `decoded, id ${tx.transaction_hash().to_hex().slice(0, 16)}…`; });
    console.log(`${name.padEnd(36)} head ${hex.slice(0, 4)}: Transaction ${plain}; FixedTransaction ${fixed}`);
  } else {
    const plain = attempt(() => { const b = CSL.Block.from_hex(hex); return `decoded, ${b.transaction_bodies().len()} txs`; });
    const fixed = attempt(() => { CSL.FixedBlock.from_hex(hex); return 'decoded'; });
    const key = `Block ${plain.replace(/\d+ txs/, 'n txs')}; FixedBlock ${fixed}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
}).on('close', () => {
  if (mode === 'blocks') {
    console.log(`${n} blocks (type ${'8 = Dijkstra'}):`);
    for (const [k, v] of tally) console.log(`${String(v).padStart(5)}  ${k}`);
  }
});
