// src/utils/busta.js
//
// Palacan - METADATI A2.1: chiave "busta" per lo scambio delle chiavi senza mittente.
//
// Ogni utente ha, su questo dispositivo, una coppia X25519 generata dal browser: la chiave privata NON e'
// esportabile (nemmeno il codice dell'app puo' leggerla) e resta nell'archivio del dispositivo; la pubblica
// si pubblica sul server. Chi dovra' mandargli una chiave di stanza la chiudera' in una busta sigillata (A2.2):
// mittente e contenuto dentro, il server vedra' solo il destinatario.
// La busta resta anche dopo l'uscita dall'account, come l'identita' crittografica del dispositivo: le buste in
// viaggio restano apribili. Browser senza X25519: non si pubblica nulla e lo scambio resta quello di oggi.

import * as apiService from '../apiService';

const PREFISSO = 'palacan_busta_';
const ALGORITMO = { name: 'X25519' };

function archivioIndexedDB(username) {
  const nome = PREFISSO + username;
  const apri = () => new Promise((ok, ko) => {
    const r = indexedDB.open(nome, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('chiavi');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
  const operazione = async (modo, fn) => {
    const db = await apri();
    try {
      return await new Promise((ok, ko) => {
        const tx = db.transaction('chiavi', modo);
        const req = fn(tx.objectStore('chiavi'));
        tx.oncomplete = () => ok(req ? req.result : undefined);
        tx.onerror = () => ko(tx.error);
        tx.onabort = () => ko(tx.error);
      });
    } finally {
      db.close();
    }
  };
  return {
    leggi: (chiave) => operazione('readonly', (s) => s.get(chiave)),
    scrivi: (chiave, valore) => operazione('readwrite', (s) => s.put(valore, chiave)),
  };
}

let fabbrica = archivioIndexedDB;
const coppie = new Map(); // username -> Promise<CryptoKeyPair>
const pubblicate = new Set();

// Solo per i test: archivio in memoria al posto di IndexedDB.
export function _usaArchivio(nuova) {
  fabbrica = nuova || archivioIndexedDB;
  coppie.clear();
  pubblicate.clear();
}

let supporto = null;
export async function bustaSupportata() {
  if (supporto === null) {
    try {
      await crypto.subtle.generateKey(ALGORITMO, false, ['deriveBits']);
      supporto = fabbrica !== archivioIndexedDB || typeof indexedDB !== 'undefined';
    } catch (_) {
      supporto = false;
    }
  }
  return supporto;
}

function coppiaDi(username) {
  if (!coppie.has(username)) {
    const promessa = (async () => {
      const archivio = fabbrica(username);
      const esistente = await archivio.leggi('coppia');
      if (esistente && esistente.privateKey && esistente.publicKey) return esistente;
      const nuova = await crypto.subtle.generateKey(ALGORITMO, false, ['deriveBits']);
      await archivio.scrivi('coppia', { privateKey: nuova.privateKey, publicKey: nuova.publicKey });
      return nuova;
    })();
    promessa.catch(() => coppie.delete(username));
    coppie.set(username, promessa);
  }
  return coppie.get(username);
}

function base64(buffer) {
  let testo = '';
  for (const byte of new Uint8Array(buffer)) testo += String.fromCharCode(byte);
  return btoa(testo);
}

// Chiave pubblica della busta (32 byte, base64).
export async function bustaPubblica(username) {
  const coppia = await coppiaDi(String(username));
  return base64(await crypto.subtle.exportKey('raw', coppia.publicKey));
}

// Chiave privata (non esportabile) per aprire le buste ricevute: serve dal passo A2.4.
export async function chiavePrivataBusta(username) {
  return (await coppiaDi(String(username))).privateKey;
}

// Pubblica la busta una volta per sessione. Mai un errore: se qualcosa non va, lo scambio resta quello di oggi.
export async function pubblicaBustaSeServe(username, token, invia = apiService.publishBustaKey) {
  if (!username || !token || pubblicate.has(String(username))) return false;
  try {
    if (!(await bustaSupportata())) return false;
    const pubblica = await bustaPubblica(username);
    await invia(pubblica, token);
    pubblicate.add(String(username));
    return true;
  } catch (_) {
    return false;
  }
}
