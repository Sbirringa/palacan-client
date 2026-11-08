// compat/prova_pq_wasm.mjs  [palacan-pq1]
//
// Prova il post-quantum del modulo COMPILATO PER IL BROWSER (pkg/): le stesse funzioni che usera' l'app.
//   - ML-KEM-768 identico all'implementazione indipendente di FIPS 203 (tests_vettori_mlkem768.json, kyber-py);
//   - busta: andata e ritorno, non si apre con un altro seme, un altro contesto, se alterata o troncata;
//   - semi casuali diversi; errori "PQ.<CODICE>" senza segreti.
// Uso (da crypto/palacan-crypto, dopo wasm-pack build ... --out-dir pkg --out-name palacan_crypto):
//   node compat/prova_pq_wasm.mjs
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import init, * as P from '../pkg/palacan_crypto.js';

const qui = new URL('.', import.meta.url);
const V = JSON.parse(readFileSync(new URL('../tests_vettori_mlkem768.json', qui), 'utf8'));
const b64 = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '');
const daB64 = (t) => Buffer.from(t, 'base64');
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

let fatte = 0;
const prova = (nome, f) => {
  try {
    f();
    fatte += 1;
    console.log('  ok', nome);
  } catch (e) {
    console.error('  FALLITA', nome, '\n   ', e && e.message ? e.message : e);
    process.exitCode = 1;
  }
};

await init({ module_or_path: readFileSync(new URL('../pkg/palacan_crypto_bg.wasm', qui)) });
console.log(P.versione(), '| post-quantum ML-KEM-768');

prova('chiavi pubbliche identiche all\'implementazione indipendente di FIPS 203', () => {
  for (const v of V.vettori) {
    const pubblica = daB64(P.pq_chiave_pubblica(b64(Buffer.from(v.seme, 'hex'))));
    assert.equal(pubblica.length, 1184);
    assert.equal(sha(pubblica), v.sha256_pubblica);
  }
});

prova('busta: andata e ritorno', () => {
  const seme = P.pq_nuovo_seme();
  const busta = P.pq_sigilla(P.pq_chiave_pubblica(seme), 'alice|bob|stanza', 'chiave di stanza 🔑');
  assert.equal(P.pq_apri(seme, 'alice|bob|stanza', busta), 'chiave di stanza 🔑');
});

prova('busta: altro seme, altro contesto, alterata, troncata -> errore PQ.', () => {
  const seme = P.pq_nuovo_seme();
  const busta = P.pq_sigilla(P.pq_chiave_pubblica(seme), 'c', 'segreto');
  const errorePq = (e) => e instanceof Error && e.message.startsWith('PQ.') && !e.message.includes(seme);
  assert.throws(() => P.pq_apri(P.pq_nuovo_seme(), 'c', busta), errorePq);
  assert.throws(() => P.pq_apri(seme, 'c2', busta), errorePq);
  const byte = daB64(busta);
  byte[600] ^= 1;
  assert.throws(() => P.pq_apri(seme, 'c', b64(byte)), errorePq);
  assert.throws(() => P.pq_apri(seme, 'c', busta.slice(0, 200)), errorePq);
});

prova('semi casuali diversi, buste diverse anche con lo stesso testo', () => {
  const a = P.pq_nuovo_seme();
  const b = P.pq_nuovo_seme();
  assert.notEqual(a, b);
  assert.equal(daB64(a).length, 64);
  const pk = P.pq_chiave_pubblica(a);
  assert.notEqual(P.pq_sigilla(pk, 'c', 'x'), P.pq_sigilla(pk, 'c', 'x'));
});

console.log(`\n${fatte}/4 prove post-quantum superate`);
if (fatte !== 4) process.exitCode = 1;
