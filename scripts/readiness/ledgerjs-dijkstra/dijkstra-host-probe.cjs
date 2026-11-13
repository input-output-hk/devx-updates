#!/usr/bin/env node
// Runs unmodified upstream parser/serializers; no device, transport or installs.
// Usage: node scripts/diagnostics/dijkstra-host-probe.cjs /path/to/ledgerjs /path/to/typescript
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(process.argv[2] || path.resolve(__dirname, '../..'));
function sourceRevision() {
  const head = fs.readFileSync(path.join(root, '.git/HEAD'), 'utf8').trim();
  if (!head.startsWith('ref: ')) return head;
  const ref = head.slice(5);
  const loose = path.join(root, '.git', ref);
  if (fs.existsSync(loose)) return fs.readFileSync(loose, 'utf8').trim();
  const packed = fs.readFileSync(path.join(root, '.git/packed-refs'), 'utf8');
  const match = packed.split('\n').find(line => line.endsWith(' ' + ref));
  if (!match) throw new Error('Cannot resolve source revision');
  return match.split(' ')[0];
}
const ts = require(process.argv[3] || 'typescript');
const loaded = new Map();
require.extensions['.ts'] = (mod, file) => {
  if (!file.startsWith(root + path.sep)) throw new Error('Unexpected TS source: ' + file);
  const source = fs.readFileSync(file, 'utf8');
  loaded.set(path.relative(root, file), crypto.createHash('sha256').update(source).digest('hex'));
  mod._compile(ts.transpileModule(source, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true},
  }).outputText, file);
};
const T = require(path.join(root, 'src/types/public.ts'));
const {parseSignTransactionRequest} = require(path.join(root, 'src/parsing/transaction.ts'));
const {serializeTransactionRaw, serializeTxInitData} = require(path.join(root, 'src/interactions/v8/serialization/tx.ts'));
const {gatherWitnessPaths} = require(path.join(root, 'src/interactions/common/witnessPaths.ts'));
const {signTransaction} = require(path.join(root, 'src/interactions/v8/signTx.ts'));
const keyPath = [1852 + T.HARDENED, 1815 + T.HARDENED, T.HARDENED, 0, 0];
const stakePath = [...keyPath.slice(0, 3), 2, 0];
const base = {
  network: {networkId: 0, protocolMagic: 42},
  inputs: [{txHashHex: '11'.repeat(32), outputIndex: 0, path: keyPath}],
  outputs: [{destination: {type: T.TxOutputDestinationType.THIRD_PARTY,
    params: {addressHex: '60' + '22'.repeat(28)}}, amount: 2000000}],
  fee: 200000,
};
const results = [];
function serialize(tx, mode = T.TransactionSigningMode.ORDINARY_TRANSACTION, options) {
  const parsed = parseSignTransactionRequest({tx, signingMode: mode, options});
  const witnesses = gatherWitnessPaths(parsed);
  return {parsed, init: serializeTxInitData(parsed, witnesses).toString('hex'),
    raw: serializeTransactionRaw(parsed.tx).toString('hex')};
}
function check(name, fn) {
  try { results.push({name, verified: true, ...fn()}); }
  catch (error) { results.push({name, verified: false, error: String(error)}); }
}
const baseline = serialize(base);
check('ordinary control', () => ({rawBytes: baseline.raw.length / 2, initBytes: baseline.init.length / 2}));
// These names are diagnostic JS properties, not a proposed public Dijkstra API.
const additions = {
  subTransactions: [{body: {inputs: [], outputs: []}, witnesses: {}}],
  requiredTopLevelGuards: [{credential: {type: 'script_hash', hash: '33'.repeat(28)}, datum: null}],
  directDeposits: [{['e0' + '44'.repeat(28)]: 1000000}],
  accountBalanceIntervals: [{['e0' + '44'.repeat(28)]: [0, 2000000]}],
  startingAccountBalanceIntervals: [{['e0' + '44'.repeat(28)]: [0, 2000000]}],
  guards: [{type: 'script_hash', scriptHashHex: '33'.repeat(28)}],
  proposalProcedures: [{diagnostic: true}],
};
for (const mode of [T.TransactionSigningMode.ORDINARY_TRANSACTION, T.TransactionSigningMode.UNRESTRICTED_TRANSACTION]) {
  const control = serialize(base, mode);
  for (const [field, value] of Object.entries(additions)) {
    check(`${mode}: unknown ${field}`, () => {
      const candidate = serialize({...base, [field]: value}, mode);
      assert.deepEqual(candidate.parsed, control.parsed);
      assert.equal(candidate.init, control.init);
      assert.equal(candidate.raw, control.raw);
      return {observation: 'silently discarded; identical parsed request and v8 signing payload'};
    });
  }
}
for (const [name, type, deposit] of [
  ['legacy stake registration', T.CertificateType.STAKE_REGISTRATION],
  ['legacy stake deregistration', T.CertificateType.STAKE_DEREGISTRATION],
  ['deposit stake registration', T.CertificateType.STAKE_REGISTRATION_CONWAY, 2000000],
  ['deposit stake deregistration', T.CertificateType.STAKE_DEREGISTRATION_CONWAY, 2000000],
]) {
  check(name, () => {
    const params = {stakeCredential: {type: T.CredentialParamsType.KEY_PATH, keyPath: stakePath}};
    if (deposit !== undefined) params.deposit = deposit;
    const result = serialize({...base, certificates: [{type, params}]});
    assert.equal(result.parsed.tx.certificates[0].type, type);
    assert.notEqual(result.raw, baseline.raw);
    return {observation: 'accepted by host parser and v8 serializer', certificateType: type, rawHex: result.raw};
  });
}
check('key-hash required signer control', () => {
  const result = serialize({...base, requiredSigners: [{type: T.TxRequiredSignerType.HASH, hashHex: '55'.repeat(28)}]});
  assert.notEqual(result.raw, baseline.raw);
  return {observation: 'accepted and represented in signing payload'};
});
check('pool registration BLS extension', () => {
  const params = {
    poolKey: {type: T.PoolKeyType.THIRD_PARTY, params: {keyHashHex: '55'.repeat(28)}},
    vrfKeyHashHex: '66'.repeat(32), pledge: 0, cost: 170000000,
    margin: {numerator: 1, denominator: 100},
    rewardAccount: {type: T.PoolRewardAccountType.THIRD_PARTY, params: {rewardAccountHex: 'e0' + '44'.repeat(28)}},
    poolOwners: [{type: T.PoolOwnerType.DEVICE_OWNED, params: {stakingPath: stakePath}}],
    relays: [], metadata: null,
  };
  const poolTx = {...base, inputs: [{...base.inputs[0], path: null}],
    certificates: [{type: T.CertificateType.STAKE_POOL_REGISTRATION, params}]};
  const control = serialize(poolTx, T.TransactionSigningMode.POOL_REGISTRATION_AS_OWNER);
  const extended = serialize({...poolTx, certificates: [{...poolTx.certificates[0],
    params: {...params, blsKey: {publicKeyHex: '77'.repeat(96), proofOfPossessionHex: '88'.repeat(48)}}}]},
    T.TransactionSigningMode.POOL_REGISTRATION_AS_OWNER);
  assert.deepEqual(extended, control);
  return {observation: 'unknown BLS property discarded; same pool-owner signing payload. Synthetic BLS bytes, not a valid proof.'};
});
check('script credential in requiredSigners', () => {
  assert.throws(() => serialize({...base, requiredSigners: [{type: 'script_hash', scriptHashHex: '33'.repeat(28)}]}));
  return {observation: 'rejected; existing requiredSigners API cannot express script guard'};
});
check('set tagging option', () => {
  const tagged = serialize(base, undefined, {tagCborSets: true});
  assert.equal(baseline.parsed.options.tagCborSets, false);
  assert.equal(tagged.init.slice(0, 16), '0000000000000001');
  assert.equal(tagged.raw, baseline.raw);
  return {observation: 'supported; tag choice carried in TX_INIT'};
});
check('empty inner token map', () => {
  assert.throws(() => serialize({...base, outputs: [{...base.outputs[0], tokenBundle: [{policyIdHex: '66'.repeat(28), tokens: []}]}]}));
  return {observation: 'already rejected by host parser'};
});
check('empty token bundle control', () => {
  const result = serialize({...base, outputs: [{...base.outputs[0], tokenBundle: []}]});
  assert.equal(result.raw, baseline.raw);
  return {observation: 'normalises to ordinary ADA-only signing payload; firmware CBOR still needs checking'};
});
check('opaque V4 reference script bytes', () => {
  const result = serialize({...base, outputs: [{...base.outputs[0], format: T.TxOutputFormat.MAP_BABBAGE,
    referenceScriptHex: '82044100'}]});
  assert.equal(result.parsed.tx.outputs[0].referenceScriptHex, '82044100');
  return {observation: 'opaque bytes accepted; this is not a valid-script evaluation or device result'};
});
check('device-returned tx hash is passed through', () => {
  const generator = signTransaction({major: 8, minor: 0, patch: 0, flags: {isDebug: false, isAppXS: false}}, baseline.parsed);
  let step = generator.next();
  let exchanges = 0;
  while (!step.done) {
    assert.ok(exchanges++ < 100);
    const response = Buffer.alloc(step.value.expectedResponseLength || 0, 0xaa);
    step = generator.next(response);
  }
  assert.equal(step.value.txHashHex, 'aa'.repeat(32));
  return {observation: 'mock response passed through; caller must compare original transaction-body hash', exchanges};
});
const output = {
  schema: 1, observedAt: new Date().toISOString(), node: process.version, typescript: ts.version,
  sourceDirectory: root,
  sourceRevision: sourceRevision(),
  scope: 'Unmodified host source. Synthetic unsigned fixtures. No device, signatures, node submission or production readiness certification.',
  assertionsPassed: results.filter(x => x.verified).length, assertionsTotal: results.length,
  results, loadedSourceSha256: Object.fromEntries([...loaded].sort()),
};
console.log(JSON.stringify(output, null, 2));
if (results.some(x => !x.verified)) process.exitCode = 1;
