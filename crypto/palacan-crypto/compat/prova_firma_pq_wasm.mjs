// compat/prova_firma_pq_wasm.mjs  [palacan-pq5a]
//
// Prova le firme post-quantum del modulo COMPILATO PER IL BROWSER (pkg/): le stesse funzioni che usera' l'app.
//   - chiavi ML-DSA-65 identiche all'implementazione indipendente di FIPS 204 (tests_vettori_mldsa65.json,
//     dilithium-py);
//   - firma ibrida con un account Olm VERO (ed25519) + ML-DSA-65: andata e ritorno; cade se cade una delle due,
//     se le chiavi sono mescolate o sostituite, se cambiano contesto o messaggio;
//   - semi casuali diversi, firme diverse ogni volta (hedged); errori "PQ.<CODICE>" senza segreti.
// Uso (da crypto/palacan-crypto, dopo wasm-pack build ... --out-dir pkg --out-name palacan_crypto):
//   node compat/prova_firma_pq_wasm.mjs
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import init, * as P from '../pkg/palacan_crypto.js';

const qui = new URL('.', import.meta.url);
const V = JSON.parse(readFileSync(new URL('../tests_vettori_mldsa65.json', qui), 'utf8'));
const b64 = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '');
const daB64 = (t) => Buffer.from(t, 'base64');
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const TOTALE = 5;

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
console.log(P.versione(), '| firme post-quantum ML-DSA-65 + ibride');

// una "persona" come nell'app: account Olm (ed25519) + seme ML-DSA-65
function persona() {
  const conto = new P.Account();
  conto.create();
  const ed = JSON.parse(conto.identity_keys()).ed25519;
  const seme = P.pqfirma_nuovo_seme();
  const pq = P.pqfirma_chiave_pubblica(seme);
  const firma = (contesto, messaggio) => ({
    fe: conto.sign(P.pqfirma_testo_ibrido(contesto, ed, pq, messaggio)),
    fq: P.pqfirma_firma(seme, contesto, ed, messaggio),
  });
  return { conto, ed, seme, pq, firma };
}

prova('chiavi ML-DSA-65 identiche all\'implementazione indipendente di FIPS 204', () => {
  assert.ok(V.vettori.length >= 4);
  for (const v of V.vettori) {
    const pubblica = daB64(P.pqfirma_chiave_pubblica(b64(Buffer.from(v.seme, 'hex'))));
    assert.equal(pubblica.length, 1952);
    assert.equal(sha(pubblica), v.sha256_pubblica);
  }
});

prova('firma ibrida (account Olm vero + ML-DSA-65): andata e ritorno', () => {
  const a = persona();
  const { fe, fq } = a.firma('attestato', 'palacan-attestato-v1|sessione|alice ✓');
  assert.equal(daB64(fq).length, 3309);
  assert.equal(P.pqfirma_verifica_ibrida('attestato', a.ed, a.pq, 'palacan-attestato-v1|sessione|alice ✓', fe, fq), true);
  assert.ok(P.pqfirma_testo_ibrido('attestato', a.ed, a.pq, 'm').startsWith(`palacan-firma-ibrida-v1|attestato|${a.ed}|`));
});

prova('firma ibrida: cade se cade una delle due, con chiavi mescolate o sostituite, contesto o messaggio diversi', () => {
  const a = persona();
  const z = persona();
  const { fe, fq } = a.firma('attestato', 'messaggio');
  const fz = z.firma('attestato', 'messaggio');
  const ok = (c, ed, pq, m, e, q) => P.pqfirma_verifica_ibrida(c, ed, pq, m, e, q);
  assert.equal(ok('attestato', a.ed, a.pq, 'messaggio', fe, fz.fq), false, 'ML-DSA di un altro');
  assert.equal(ok('attestato', a.ed, a.pq, 'messaggio', fz.fe, fq), false, 'ed25519 di un altro');
  assert.equal(ok('attestato', z.ed, a.pq, 'messaggio', fz.fe, fq), false, 'chiavi mescolate');
  const sostituita = P.pqfirma_firma(z.seme, 'attestato', a.ed, 'messaggio');
  assert.equal(ok('attestato', a.ed, z.pq, 'messaggio', fe, sostituita), false, 'chiave ML-DSA sostituita');
  assert.equal(ok('stato-gruppo', a.ed, a.pq, 'messaggio', fe, fq), false, 'contesto spostato');
  assert.equal(ok('attestato', a.ed, a.pq, 'messaggio!', fe, fq), false, 'messaggio cambiato');
  assert.equal(ok('attestato', a.ed, a.pq, 'messaggio', a.conto.sign('messaggio'), fq), false, 'ed25519 del formato vecchio');
  const alterata = daB64(fq);
  alterata[1000] ^= 1;
  assert.equal(ok('attestato', a.ed, a.pq, 'messaggio', fe, b64(alterata)), false, 'ML-DSA alterata');
  assert.equal(ok('attestato', a.ed, a.pq, 'messaggio', fe, ''), false, 'ML-DSA vuota');
  assert.equal(ok('attestato', a.ed, 'non-base64!', 'messaggio', fe, fq), false, 'chiave non valida');
});

prova('semi casuali diversi, firme ML-DSA diverse ogni volta (hedged) e tutte valide', () => {
  const s1 = P.pqfirma_nuovo_seme();
  const s2 = P.pqfirma_nuovo_seme();
  assert.notEqual(s1, s2);
  assert.equal(daB64(s1).length, 32);
  const a = persona();
  const x = a.firma('attestato', 'm');
  const y = a.firma('attestato', 'm');
  assert.notEqual(x.fq, y.fq);
  assert.equal(P.pqfirma_verifica_ibrida('attestato', a.ed, a.pq, 'm', x.fe, x.fq), true);
  assert.equal(P.pqfirma_verifica_ibrida('attestato', a.ed, a.pq, 'm', y.fe, y.fq), true);
});

prova('dati non validi: errore "PQ." senza segreti', () => {
  const a = persona();
  const errorePq = (e) => e instanceof Error && e.message.startsWith('PQ.') && !e.message.includes(a.seme);
  assert.throws(() => P.pqfirma_chiave_pubblica('AAAA'), errorePq);
  assert.throws(() => P.pqfirma_firma(a.seme, 'Contesto Non Valido', a.ed, 'm'), errorePq);
  assert.throws(() => P.pqfirma_firma(a.seme, 'attestato', 'non-base64!', 'm'), errorePq);
  assert.throws(() => P.pqfirma_testo_ibrido('con|barra', a.ed, a.pq, 'm'), errorePq);
  assert.throws(() => P.pqfirma_testo_ibrido('attestato', a.ed, 'AAAA', 'm'), errorePq);
});

console.log(`\n${fatte}/${TOTALE} prove delle firme post-quantum superate`);
if (fatte !== TOTALE) process.exitCode = 1;
