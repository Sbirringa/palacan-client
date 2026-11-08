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
import Olm from '../crypto/olm.js';  // [palacan-cl2f] ML-KEM-768 per la busta ibrida
import { firmaBusta } from './bustaFirmata';  // [palacan-cl2g]
import { EVENTO_STATO_DISPOSITIVO } from './chiavePrincipale';  // [palacan-cl2g]

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
const semi = new Map(); // [palacan-cl2f] username -> Promise<seme ML-KEM-768>
const pubblicate = new Map(); // [palacan-cl2g] username -> true se pubblicata con la firma della chiave principale

// Solo per i test: archivio in memoria al posto di IndexedDB.
export function _usaArchivio(nuova) {
  fabbrica = nuova || archivioIndexedDB;
  coppie.clear();
  semi.clear();
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

// [palacan-cl2f] Busta IBRIDA: oltre alla coppia X25519, un seme ML-KEM-768 (64 byte) di questo dispositivo. Il seme si
// conserva CIFRATO (AES-256-GCM) con una chiave del browser NON esportabile, nello stesso archivio della coppia: il
// codice dell'app lo decifra solo per aprire una busta, e chi copia l'archivio non lo legge senza quella chiave.
const ETICHETTA_SEME = new TextEncoder().encode('palacan-busta-seme-pq-v1');

async function semeSalvato(archivio, chiave) {
  const salvato = await archivio.leggi('seme_pq');
  if (!chiave || !salvato || !salvato.iv || !salvato.dati) return null;
  try {
    const chiaro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: salvato.iv, additionalData: ETICHETTA_SEME }, chiave, salvato.dati);
    return new TextDecoder().decode(chiaro);
  } catch (_) {
    return null; // non decifrabile (archivio rovinato): se ne crea uno nuovo e lo si ripubblica
  }
}

function semeDi(username) {
  if (!semi.has(username)) {
    const promessa = (async () => {
      const archivio = fabbrica(username);
      let chiave = await archivio.leggi('chiave_seme_pq');
      const esistente = await semeSalvato(archivio, chiave);
      if (esistente) return esistente;
      await Olm.init();
      const seme = Olm.pq_nuovo_seme();
      if (!chiave) {
        chiave = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        await archivio.scrivi('chiave_seme_pq', chiave);
      }
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const dati = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: ETICHETTA_SEME }, chiave, new TextEncoder().encode(seme));
      await archivio.scrivi('seme_pq', { v: 1, iv, dati });
      return seme;
    })();
    promessa.catch(() => semi.delete(username));
    semi.set(username, promessa);
  }
  return semi.get(username);
}

/** [palacan-cl2f] Seme ML-KEM-768 della busta di questo dispositivo (per aprire le buste v2 ricevute). */
export async function semeBustaPq(username) {
  return semeDi(String(username));
}

/** [palacan-cl2f] Chiave pubblica ML-KEM-768 della busta (1184 byte, base64). */
export async function bustaPqPubblica(username) {
  const seme = await semeDi(String(username));
  await Olm.init();
  return Olm.pq_chiave_pubblica(seme);
}

// Pubblica la busta una volta per sessione. Mai un errore: se qualcosa non va, lo scambio resta quello di oggi.
// [palacan-cl2f] insieme alla chiave X25519 si pubblica quella ML-KEM-768 (busta ibrida). Se ML-KEM non e' pronto si
// pubblica solo la X25519 e il server toglie quella ML-KEM vecchia: chi scrive usa la busta v1.
// [palacan-cl2g] con la FIRMA della chiave principale, se questo dispositivo la possiede. Pubblicata senza firma (chiave
// principale non ancora pronta all'accesso), si ripubblica firmata appena lo e' (evento di chiavePrincipale.js).
let ultimaRichiesta = null;  // [palacan-cl2g]
export async function pubblicaBustaSeServe(username, token, invia = (pubblica, t, pq, firma) => apiService.publishBustaKeys(pubblica, pq, t, firma)) {
  if (!username || !token) return false;
  const nome = String(username);
  ultimaRichiesta = { username: nome, token, invia };  // [palacan-cl2g]
  if (pubblicate.get(nome) === true) return false;
  try {
    if (!(await bustaSupportata())) return false;
    const pubblica = await bustaPubblica(username);
    let pq = null;
    try {
      pq = await bustaPqPubblica(username);
    } catch (_) {
      pq = null;
    }
    let firma = firmaBusta(nome, pubblica, pq);  // [palacan-cl2g]
    if (pubblicate.has(nome) && !firma) return false;  // gia' pubblicata senza firma e ancora niente chiave principale
    try {
      await invia(pubblica, token, pq, firma);
    } catch (e) {
      // [palacan-cl2f2] chiave ML-KEM rifiutata (server vecchio o formato diverso): mai restare senza busta, si
      // pubblica la sola X25519 (chi scrive usa la busta v1) e lo si segnala
      if (!pq) throw e;
      console.warn('[busta] chiave ML-KEM della busta non accettata dal server: pubblicata la sola X25519');
      pq = null;
      firma = firmaBusta(nome, pubblica, null);  // [palacan-cl2g] la firma copre anche la chiave ML-KEM: si rifa'
      await invia(pubblica, token, null, firma);
    }
    pubblicate.set(nome, Boolean(firma));  // [palacan-cl2g]
    return true;
  } catch (_) {
    return false;
  }
}

// [palacan-cl2g] questo dispositivo ha appena la chiave principale (stato 'firmato'): la busta si ripubblica firmata
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener(EVENTO_STATO_DISPOSITIVO, (e) => {
    if (!e || !e.detail || e.detail.stato !== 'firmato' || !ultimaRichiesta) return;
    const { username, token, invia } = ultimaRichiesta;
    pubblicaBustaSeServe(username, token, invia).catch(() => {});
  });
}
