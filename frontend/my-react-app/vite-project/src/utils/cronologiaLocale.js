// src/utils/cronologiaLocale.js
//
// Palacan - cronologia cifrata sul dispositivo (passo 1: messaggi; passo 2: dati aggiuntivi come le reazioni).
//
// I messaggi gia' decifrati di ogni chat si salvano sul dispositivo (IndexedDB), CIFRATI con una chiave
// AES-GCM a 256 bit generata dal browser e NON esportabile (nemmeno il codice dell'app puo' leggerla in
// chiaro). Ogni chat e' cifrata con il proprio identificativo come dato autenticato: il contenuto di una chat
// non puo' essere spacciato per quello di un'altra. All'apertura di una chat la cronologia compare subito,
// anche se il server non risponde o la pagina e' stata ricaricata; quella del server, quando arriva, la sostituisce.
//
// Si salvano solo i messaggi confermati dal server (id vero), gli ultimi MAX_PER_CHAT per chat: quelli
// provvisori o non inviati li conserva gia' la coda di uscita (3.4d-ter).
// All'uscita dall'account la cronologia del dispositivo si cancella.
// Qualunque problema (browser senza IndexedDB, dato illeggibile) = "niente cronologia": l'app va avanti come prima.
//
// Protegge dalla lettura dei file del browser e dagli altri siti; non da un programma malevolo che controlla
// il computer mentre l'utente e' collegato.

const PREFISSO = 'palacan_cronologia_';
export const MAX_PER_CHAT = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const codifica = new TextEncoder();
const decodifica = new TextDecoder();

// --- archivio: IndexedDB (sostituibile nei test) --------------------------------------------------------
function archivioIndexedDB(username) {
  const nome = PREFISSO + username;
  const apri = () => new Promise((ok, ko) => {
    const r = indexedDB.open(nome, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('stanze');
      r.result.createObjectStore('chiavi');
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
  const operazione = async (store, modo, fn) => {
    const db = await apri();
    try {
      return await new Promise((ok, ko) => {
        const tx = db.transaction(store, modo);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => ok(req ? req.result : undefined);
        tx.onerror = () => ko(tx.error);
        tx.onabort = () => ko(tx.error);
      });
    } finally {
      db.close();
    }
  };
  return {
    leggi: (store, chiave) => operazione(store, 'readonly', (s) => s.get(chiave)),
    scrivi: (store, chiave, valore) => operazione(store, 'readwrite', (s) => s.put(valore, chiave)),
    cancella: () => new Promise((ok) => {
      const r = indexedDB.deleteDatabase(nome);
      r.onsuccess = () => ok(true);
      r.onerror = () => ok(false);
      r.onblocked = () => ok(false);
    }),
  };
}

let fabbrica = archivioIndexedDB;
const chiaviPerUtente = new Map(); // username -> Promise<CryptoKey>

// Solo per i test: archivio in memoria al posto di IndexedDB.
export function _usaArchivio(nuovaFabbrica) {
  fabbrica = nuovaFabbrica || archivioIndexedDB;
  chiaviPerUtente.clear();
}

function disponibile() {
  return Boolean(globalThis.crypto && globalThis.crypto.subtle)
    && (fabbrica !== archivioIndexedDB || typeof indexedDB !== 'undefined');
}

function chiaveDi(username, archivio) {
  if (!chiaviPerUtente.has(username)) {
    const promessa = (async () => {
      const esistente = await archivio.leggi('chiavi', 'principale');
      if (esistente) return esistente;
      const nuova = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await archivio.scrivi('chiavi', 'principale', nuova);
      return nuova;
    })();
    promessa.catch(() => chiaviPerUtente.delete(username));
    chiaviPerUtente.set(username, promessa);
  }
  return chiaviPerUtente.get(username);
}

// Messaggi da conservare: confermati dal server (id vero), non falliti, gli ultimi MAX_PER_CHAT.
export function daSalvare(messaggi) {
  return (Array.isArray(messaggi) ? messaggi : [])
    .filter((m) => m && UUID.test(String(m.id)) && !m.failed)
    .slice(-MAX_PER_CHAT);
}

// Cifra e scrive un valore con il suo nome come dato autenticato (non si puo' spacciare per un altro).
async function scriviCifrato(username, nome, valore) {
  const archivio = fabbrica(String(username));
  const chiave = await chiaveDi(String(username), archivio);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dati = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: codifica.encode(nome) },
    chiave,
    codifica.encode(JSON.stringify(valore)),
  );
  await archivio.scrivi('stanze', nome, { v: 1, iv, dati });
}

async function leggiCifrato(username, nome) {
  const archivio = fabbrica(String(username));
  const record = await archivio.leggi('stanze', nome);
  if (!record || !record.iv || !record.dati) return null;
  const chiave = await chiaveDi(String(username), archivio);
  const chiaro = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: record.iv, additionalData: codifica.encode(nome) },
    chiave,
    record.dati,
  );
  return JSON.parse(decodifica.decode(chiaro));
}

export async function salvaStanza(username, roomId, messaggi) {
  if (!username || !roomId || !disponibile()) return false;
  const elenco = daSalvare(messaggi);
  if (elenco.length === 0) return false;
  try {
    await scriviCifrato(username, String(roomId), elenco);
    return true;
  } catch (_) {
    return false;
  }
}

export async function leggiStanza(username, roomId) {
  if (!username || !roomId || !disponibile()) return null;
  try {
    const elenco = await leggiCifrato(username, String(roomId));
    return Array.isArray(elenco) ? elenco : null;
  } catch (_) {
    return null;
  }
}

// Dati aggiuntivi della cronologia (es. le reazioni di una chat), con lo stesso archivio e la stessa chiave.
// Il nome e' separato da quello delle chat ("dato:..."): una voce non puo' essere spacciata per una chat.
export async function salvaDato(username, nome, valore) {
  if (!username || !nome || !disponibile()) return false;
  try {
    await scriviCifrato(username, `dato:${nome}`, valore);
    return true;
  } catch (_) {
    return false;
  }
}

export async function leggiDato(username, nome) {
  if (!username || !nome || !disponibile()) return null;
  try {
    const valore = await leggiCifrato(username, `dato:${nome}`);
    return valore === undefined ? null : valore;
  } catch (_) {
    return null;
  }
}

export async function cancellaCronologia(username) {
  if (!username) return false;
  chiaviPerUtente.delete(String(username));
  try {
    return await fabbrica(String(username)).cancella();
  } catch (_) {
    return false;
  }
}

// [palacan-n4] Valori che non si possono mettere in JSON (es. una CryptoKey non esportabile), nello stesso archivio
// del dispositivo dell'utente: si cancellano con la cronologia all'uscita dall'account (cancellaCronologia).
export async function salvaChiaveUtente(username, nome, valore) {
  if (!username || !nome || !disponibile()) return false;
  try {
    await fabbrica(String(username)).scrivi('chiavi', `utente:${nome}`, valore);
    return true;
  } catch (_) {
    return false;
  }
}

export async function leggiChiaveUtente(username, nome) {
  if (!username || !nome || !disponibile()) return null;
  try {
    const valore = await fabbrica(String(username)).leggi('chiavi', `utente:${nome}`);
    return valore === undefined ? null : valore;
  } catch (_) {
    return null;
  }
}
