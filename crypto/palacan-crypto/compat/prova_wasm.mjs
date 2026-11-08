// compat/prova_wasm.mjs  [palacan-vodozemac]
//
// Prova il modulo COMPILATO PER IL BROWSER (pkg/, prodotto da wasm-pack) attraverso le sue classi JavaScript, le
// stesse che usera' olmService.js, contro la libolm VERA 3.2.15:
//   - dati e messaggi di libolm (tests_vettori_libolm.json) letti e convertiti dal modulo;
//   - messaggi, chiavi e firme del modulo letti dalla libolm (direzione opposta);
//   - forma delle risposte identica a libolm ({type, body}, {plaintext, message_index}), errori "OLM.<CODICE>",
//     chiave di pickle stringa o Uint8Array, free().
// Uso (da crypto/palacan-crypto):
//   wasm-pack build --release --target web --out-dir pkg --out-name palacan_crypto
//   cd compat && npm install && cd ..
//   node compat/prova_wasm.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import init, * as P from '../pkg/palacan_crypto.js';

const require = createRequire(import.meta.url);
const Olm = require('@matrix-org/olm');
const qui = new URL('.', import.meta.url);
const V = JSON.parse(readFileSync(new URL('../tests_vettori_libolm.json', qui), 'utf8'));

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
await Olm.init();
const K = V.chiave_pickle;
console.log(P.versione(), '| libolm', Olm.get_library_version().join('.'));

prova('Account libolm convertito: stesse chiavi, segnalato come convertito', () => {
  const a = new P.Account();
  a.unpickle(K, V.bob_pickle);
  assert.equal(a.ultimo_unpickle_convertito(), true);
  assert.deepEqual(JSON.parse(a.identity_keys()), V.bob_identita);
  assert.deepEqual(JSON.parse(a.one_time_keys()), V.bob_otk);
  const nuovo = a.pickle(K);
  assert.ok(nuovo.startsWith('vz1:'));
  const b = new P.Account();
  b.unpickle(K, nuovo);
  assert.equal(b.ultimo_unpickle_convertito(), false);
  assert.equal(b.identity_keys(), a.identity_keys());
  a.free();
  b.free();
});

prova('chiave di pickle come Uint8Array, come in libolm', () => {
  const a = new P.Account();
  a.unpickle(new TextEncoder().encode(K), V.bob_pickle);
  assert.deepEqual(JSON.parse(a.identity_keys()), V.bob_identita);
});

prova('Session: create_inbound + decrypt dei messaggi di libolm, poi risposta letta da libolm', () => {
  const bob = new P.Account();
  bob.unpickle(K, V.bob_pickle);
  const s = new P.Session();
  s.create_inbound(bob, V.prekey_1.body);
  assert.equal(s.session_id(), V.sessione_alice_id);
  assert.equal(s.matches_inbound(V.prekey_1.body), true);
  assert.equal(s.matches_inbound_from(V.alice_identita.curve25519, V.prekey_1.body), true);
  assert.equal(s.decrypt(0, V.prekey_1.body), 'ciao Bob, sono Alice (libolm)');
  assert.equal(s.decrypt(0, V.prekey_2.body), 'secondo messaggio prima della risposta');
  bob.remove_one_time_keys(s);
  assert.equal(Object.keys(JSON.parse(bob.one_time_keys()).curve25519).length, 2);
  const r = s.encrypt('risposta dal modulo wasm');
  assert.deepEqual(Object.keys(r).sort(), ['body', 'type']);
  assert.equal(r.type, 1);
  const alice = new Olm.Session();
  alice.unpickle(K, V.sessione_alice_pickle);
  assert.equal(alice.decrypt(r.type, r.body), 'risposta dal modulo wasm');
});

prova('Session: create_outbound verso un account libolm', () => {
  const carla = new P.Account();
  carla.create();
  const bobL = new Olm.Account();
  bobL.unpickle(K, V.bob_pickle);
  const otk = Object.values(V.bob_otk.curve25519)[2];
  const s = new P.Session();
  s.create_outbound(carla, V.bob_identita.curve25519, otk);
  const m = s.encrypt('dal wasm a libolm');
  assert.equal(m.type, 0);
  const r = new Olm.Session();
  r.create_inbound_from(bobL, JSON.parse(carla.identity_keys()).curve25519, m.body);
  assert.equal(r.decrypt(0, m.body), 'dal wasm a libolm');
});

prova('Megolm: libolm -> modulo e modulo -> libolm, export/import e indice', () => {
  const ing = new P.InboundGroupSession();
  ing.create(V.gruppo_chiave);
  const d = ing.decrypt(V.gruppo_messaggi[2]);
  assert.deepEqual(d, { plaintext: 'terzo 🎉 àèìòù', message_index: 2 });
  assert.equal(ing.first_known_index(), 0);

  const out = new P.OutboundGroupSession();
  out.create();
  const chiave0 = out.session_key(); // presa PRIMA di cifrare: parte dall'indice 0 (come si condivide nell'app)
  const m0 = out.encrypt('dal gruppo wasm');
  assert.equal(out.message_index(), 1);
  const lib = new Olm.InboundGroupSession();
  lib.create(chiave0);
  assert.equal(lib.session_id(), out.session_id());
  assert.deepEqual(lib.decrypt(m0), { plaintext: 'dal gruppo wasm', message_index: 0 });
  // chiave presa DOPO: parte dall'indice 1, il messaggio 0 resta illeggibile (stesso comportamento di libolm)
  const tardi = new Olm.InboundGroupSession();
  tardi.create(out.session_key());
  assert.equal(tardi.first_known_index(), 1);
  assert.throws(() => tardi.decrypt(m0), /UNKNOWN_MESSAGE_INDEX/);

  const imp = new P.InboundGroupSession();
  imp.import_session(V.gruppo_esportata_1);
  assert.equal(imp.first_known_index(), 1);
  const esportata = imp.export_session(1);
  const lib2 = new Olm.InboundGroupSession();
  lib2.import_session(esportata);
  assert.equal(lib2.decrypt(V.gruppo_messaggi[1]).plaintext, 'secondo nel gruppo');
});

prova('pickle libolm delle sessioni di gruppo convertiti', () => {
  const u = new P.OutboundGroupSession();
  u.unpickle(K, V.gruppo_uscente_pickle);
  assert.equal(u.ultimo_unpickle_convertito(), true);
  assert.equal(u.session_id(), V.gruppo_id);
  const e = new P.InboundGroupSession();
  e.unpickle(K, V.gruppo_entrante_pickle);
  assert.equal(e.decrypt(u.encrypt('dopo la conversione')).plaintext, 'dopo la conversione');
});

prova('errori come libolm: Error con "OLM.<CODICE>"', () => {
  const imp = new P.InboundGroupSession();
  imp.import_session(V.gruppo_esportata_1);
  assert.throws(() => imp.decrypt(V.gruppo_messaggi[0]), (e) => e instanceof Error && e.message.startsWith('OLM.UNKNOWN_MESSAGE_INDEX'));
  assert.throws(() => new P.Account().unpickle('sbagliata', V.bob_pickle), (e) => e.message.startsWith('OLM.BAD_ACCOUNT_KEY'));
  assert.throws(() => new P.Account().identity_keys(), (e) => e.message.startsWith('OLM.'));
  const u = new P.Utility();
  u.ed25519_verify(V.alice_identita.ed25519, V.firma_messaggio, V.firma);
  assert.throws(() => u.ed25519_verify(V.alice_identita.ed25519, 'altro', V.firma), (e) => e.message.startsWith('OLM.BAD_MESSAGE_MAC'));
});

prova('firma del modulo verificata da libolm', () => {
  const a = new P.Account();
  a.create();
  const f = a.sign('testo da firmare');
  new Olm.Utility().ed25519_verify(JSON.parse(a.identity_keys()).ed25519, 'testo da firmare', f);
});

console.log(`\n${fatte}/8 prove superate`);
