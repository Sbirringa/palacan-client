// sicurezza/rilascio.mjs  [palacan-l1c]
//
// L1c (Chiusura limiti): elenco delle impronte FIRMATO. L1b permette di scoprire un sito cambiato; con L1c chi
// controlla il server puo' ancora cambiare i file, ma non puo' produrre una firma valida per l'elenco.
//   - chiave di rilascio IBRIDA (stessa forma della chiave principale, L4c): ed25519 (account Olm dedicato) +
//     ML-DSA-65 (seme), con il motore dell'app (palacan-crypto, pqfirma_*). La parte privata sta solo sul PC di chi
//     pubblica, cifrata con una passphrase (scrypt + AES-256-GCM); nel repository va solo la parte pubblica
//     (sicurezza/chiave-rilascio-pubblica.json);
//   - a ogni pubblicazione si firma "palacan-rilascio-v1|<SHA-256 di palacan-impronte.json>|<commit>|<numero>|<quando>"
//     (contesto "rilascio"); la firma vale solo se reggono ENTRAMBE le parti;
//   - il numero cresce a ogni pubblicazione (secondi dal 1970): chi verifica rifiuta un numero piu' basso di quello
//     gia' visto (nessuno puo' rimettere online una versione vecchia, anche se firmata).
// Le funzioni ricevono il motore (il modulo palacan-crypto gia' avviato): nel browser, nei test e in Node.

import crypto from 'node:crypto';

export const CONTESTO_RILASCIO = 'rilascio';
export const VERSIONE = 1;
const t = (v) => (v == null ? '' : String(v).trim());
const b64 = (u8) => Buffer.from(u8).toString('base64');
const daB64 = (s) => new Uint8Array(Buffer.from(t(s), 'base64'));
const sha256 = (dati) => crypto.createHash('sha256').update(dati).digest('hex');

export function testoRilascio({ impronta, commit, numero, quando }) {
  return `palacan-rilascio-v1|${t(impronta)}|${t(commit)}|${Number(numero)}|${t(quando)}`;
}

/** Materiale nuovo: account Olm dedicato (ed25519) + seme ML-DSA-65. Restituisce { privata, pubblica }. */
export function nuovaChiaveRilascio(motore, ora = new Date()) {
  const a = new motore.Account();
  try {
    a.create();
    const chiavePickle = crypto.randomBytes(32);
    const ed = JSON.parse(a.identity_keys()).ed25519;
    const seme = motore.pqfirma_nuovo_seme();
    const pq = motore.pqfirma_chiave_pubblica(seme);
    const pubblica = { v: VERSIONE, ed, pq, impronta_pq: sha256(daB64(pq)), creata: ora.toISOString() };
    return { privata: { v: VERSIONE, ed, pq, seme, pickle: a.pickle(new Uint8Array(chiavePickle)), chiavePickle: b64(chiavePickle) }, pubblica };
  } finally {
    try { a.free(); } catch (_) { /* gia' liberato */ }
  }
}

/** Firma il rilascio: impronta = SHA-256 esadecimale del file palacan-impronte.json (i suoi byte esatti). */
export function firmaRilascio(motore, privata, { impronta, commit, numero, quando }) {
  if (!/^[0-9a-f]{64}$/.test(t(impronta))) throw new Error('impronta dell\'elenco non valida');
  if (!/^[0-9a-f]{7,40}$/.test(t(commit))) throw new Error('commit non valido');
  if (!Number.isSafeInteger(Number(numero)) || Number(numero) <= 0) throw new Error('numero non valido');
  const messaggio = testoRilascio({ impronta, commit, numero, quando });
  const a = new motore.Account();
  try {
    a.unpickle(daB64(privata.chiavePickle), privata.pickle);
    if (JSON.parse(a.identity_keys()).ed25519 !== privata.ed) throw new Error('chiave di rilascio danneggiata');
    const firma_ed = a.sign(motore.pqfirma_testo_ibrido(CONTESTO_RILASCIO, privata.ed, privata.pq, messaggio));
    const firma_pq = motore.pqfirma_firma(privata.seme, CONTESTO_RILASCIO, privata.ed, messaggio);
    return {
      v: VERSIONE, contesto: CONTESTO_RILASCIO, impronta_elenco: t(impronta), commit: t(commit), numero: Number(numero),
      quando: t(quando), chiave_ed: privata.ed, chiave_pq_impronta: sha256(daB64(privata.pq)), firma_ed, firma_pq,
    };
  } finally {
    try { a.free(); } catch (_) { /* gia' liberato */ }
  }
}

/**
 * Verifica una firma di rilascio con la chiave pubblica FISSATA (quella del repository, non quella che manda il sito).
 * { valida: true } oppure { valida: false, motivo }.
 */
export function verificaRilascio(motore, pubblica, firma, { improntaElenco, ultimoNumero = 0 } = {}) {
  try {
    if (!firma || firma.v !== VERSIONE || firma.contesto !== CONTESTO_RILASCIO) return { valida: false, motivo: 'formato' };
    if (!pubblica || t(firma.chiave_ed) !== t(pubblica.ed)) return { valida: false, motivo: 'chiave_diversa' };
    if (t(firma.chiave_pq_impronta) !== sha256(daB64(pubblica.pq))) return { valida: false, motivo: 'chiave_diversa' };
    if (improntaElenco !== undefined && t(firma.impronta_elenco) !== t(improntaElenco)) return { valida: false, motivo: 'elenco_diverso' };
    if (!(Number(firma.numero) >= Number(ultimoNumero || 0))) return { valida: false, motivo: 'versione_vecchia' };
    const messaggio = testoRilascio({ impronta: firma.impronta_elenco, commit: firma.commit, numero: firma.numero, quando: firma.quando });
    const ok = motore.pqfirma_verifica_ibrida(CONTESTO_RILASCIO, t(pubblica.ed), t(pubblica.pq), messaggio, t(firma.firma_ed), t(firma.firma_pq)) === true;
    return ok ? { valida: true } : { valida: false, motivo: 'firma_falsa' };
  } catch (_) {
    return { valida: false, motivo: 'firma_falsa' };
  }
}

// --- custodia della parte privata: scrypt + AES-256-GCM -------------------------------------------------------
export const SCRYPT_PREDEFINITO = { N: 2 ** 17, r: 8, p: 1 };

export function cifraPrivata(privata, passphrase, parametri = SCRYPT_PREDEFINITO) {
  if (t(passphrase).length < 16) throw new Error('passphrase troppo corta (almeno 16 caratteri, meglio 5-6 parole)');
  const sale = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const chiave = crypto.scryptSync(passphrase, sale, 32, { ...parametri, maxmem: 512 * 1024 * 1024 });
  const c = crypto.createCipheriv('aes-256-gcm', chiave, iv);
  c.setAAD(Buffer.from('palacan-chiave-rilascio-v1'));
  const cifrato = Buffer.concat([c.update(Buffer.from(JSON.stringify(privata), 'utf8')), c.final()]);
  return {
    v: VERSIONE, kdf: 'scrypt', ...parametri, sale: b64(sale), iv: b64(iv), cifrato: b64(cifrato), tag: b64(c.getAuthTag()),
    pubblica: { ed: privata.ed, pq: privata.pq },
  };
}

export function decifraPrivata(file, passphrase) {
  const chiave = crypto.scryptSync(passphrase, Buffer.from(file.sale, 'base64'), 32,
    { N: file.N, r: file.r, p: file.p, maxmem: 512 * 1024 * 1024 });
  const d = crypto.createDecipheriv('aes-256-gcm', chiave, Buffer.from(file.iv, 'base64'));
  d.setAAD(Buffer.from('palacan-chiave-rilascio-v1'));
  d.setAuthTag(Buffer.from(file.tag, 'base64'));
  let chiaro;
  try {
    chiaro = Buffer.concat([d.update(Buffer.from(file.cifrato, 'base64')), d.final()]);
  } catch (_) {
    throw new Error('passphrase sbagliata (o file della chiave danneggiato)');
  }
  return JSON.parse(chiaro.toString('utf8'));
}
