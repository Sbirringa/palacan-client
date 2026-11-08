// src/utils/chiaveDispositivo.js  [palacan-9a]
//
// Chiave del dispositivo. Prima le chiavi Olm salvate nel browser (account, sessioni, Megolm) erano cifrate con
// VITE_PICKLE_KEY, e i dati di accesso (secureStorage) con VITE_STORAGE_KEY: due valori scritti DENTRO il codice
// pubblico del sito, quindi uguali per tutti e leggibili da chiunque. Ora:
//
//   - al primo avvio il browser genera una chiave AES-GCM a 256 bit NON esportabile (nemmeno il codice dell'app
//     puo' leggerla) e la conserva in IndexedDB, una per browser: resta anche all'uscita dall'account, come la
//     busta (busta.js), perche' appartiene al dispositivo e non all'utente;
//   - con quella chiave si cifra un segreto casuale di 32 byte, la nuova chiave dei pickle Olm, che esiste in
//     chiaro solo in memoria;
//   - i dati di accesso (token, nome utente...) si cifrano direttamente con la chiave del dispositivo.
//
// I dati salvati prima con la chiave vecchia si leggono ancora una volta e si riscrivono con quella nuova.
// Il backup delle chiavi sul server resta nel formato di prima (pickle con la chiave vecchia DENTRO la cifratura
// Argon2id + AES-GCM della passphrase): cosi' si recupera su qualunque browser, e i backup gia' fatti valgono.
//
// Tre stati:
//   'dispositivo'  chiave del dispositivo pronta: si usa quella;
//   'riserva'      questo browser non ha mai avuto la chiave e IndexedDB non funziona: si resta come prima
//                  (pickle con la chiave vecchia; dati di accesso con una chiave solo in memoria, che dura una visita);
//   'bloccato'     la chiave c'era ma ora non si legge (errore passeggero): nessun dato si legge o si scrive, cosi'
//                  niente viene cancellato o sovrascritto. Olm non parte e chiede di ricaricare la pagina.
//
// LIMITE ONESTO: la chiave non esportabile protegge da chi legge i file del browser senza saper decodificare
// IndexedDB, dalle estensioni e dagli altri siti; non da un programma malevolo che controlla il computer mentre la
// pagina e' aperta, ne' da un attacco XSS attivo (che usa le chiavi senza doverle esportare).

const NOME_DB = 'palacan_dispositivo';
const VOCE = 'dispositivo';
const SEGNO_USATA = 'palacan_chiave_dispositivo';
const PREFISSO_DISPOSITIVO = 'd1.';
const PREFISSO_RISERVA = 'r1.';
const ETICHETTA_SEGRETO = 'palacan-pickle-v1';
const codifica = new TextEncoder();
const decodifica = new TextDecoder();

// --- archivio: IndexedDB (sostituibile nei test) ----------------------------------------------------------
function archivioIndexedDB() {
  const apri = () => new Promise((ok, ko) => {
    const r = indexedDB.open(NOME_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('chiavi');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
    r.onblocked = () => ko(new Error('IndexedDB bloccato'));
  });
  const operazione = async (modo, fn) => {
    const db = await apri();
    try {
      return await new Promise((ok, ko) => {
        const tx = db.transaction('chiavi', modo);
        let risultato;
        fn(tx.objectStore('chiavi'), (v) => { risultato = v; });
        tx.oncomplete = () => ok(risultato);
        tx.onerror = () => ko(tx.error);
        tx.onabort = () => ko(tx.error);
      });
    } finally {
      db.close();
    }
  };
  return {
    leggi: (voce) => operazione('readonly', (s, fine) => {
      const req = s.get(voce);
      req.onsuccess = () => fine(req.result);
    }),
    // Una sola transazione: se un'altra scheda l'ha appena creata, vince la sua (mai due chiavi diverse).
    prendiOCrea: (voce, nuovo) => operazione('readwrite', (s, fine) => {
      const req = s.get(voce);
      req.onsuccess = () => {
        if (req.result) {
          fine(req.result);
        } else {
          s.put(nuovo, voce);
          fine(nuovo);
        }
      };
    }),
  };
}

let fabbrica = archivioIndexedDB;
let stato = null; // { modo, chiave, segreto }
let preparazione = null;
let chiaveRiserva = null;

// Solo per i test: archivio in memoria al posto di IndexedDB (e stato azzerato, come a un nuovo caricamento).
export function _usaArchivio(nuovaFabbrica) {
  fabbrica = nuovaFabbrica || archivioIndexedDB;
  stato = null;
  preparazione = null;
  chiaveRiserva = null;
}

function base64(byte) {
  let s = '';
  for (let i = 0; i < byte.length; i += 1) s += String.fromCharCode(byte[i]);
  return btoa(s);
}

function daBase64(testo) {
  const s = atob(testo);
  const byte = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) byte[i] = s.charCodeAt(i);
  return byte;
}

function giaUsata() {
  try {
    return localStorage.getItem(SEGNO_USATA) === '1';
  } catch (_) {
    return false;
  }
}

function segnaUsata() {
  try {
    localStorage.setItem(SEGNO_USATA, '1');
  } catch (_) {
    /* senza localStorage non c'e' comunque niente da proteggere */
  }
}

async function nuovoRecord() {
  const chiave = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const segreto = base64(crypto.getRandomValues(new Uint8Array(32)));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dati = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: codifica.encode(ETICHETTA_SEGRETO) },
    chiave,
    codifica.encode(segreto),
  );
  return { v: 1, chiave, iv, dati };
}

async function apriRecord(record) {
  const chiaro = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: record.iv, additionalData: codifica.encode(ETICHETTA_SEGRETO) },
    record.chiave,
    record.dati,
  );
  return decodifica.decode(chiaro);
}

/** Prepara la chiave del dispositivo (una volta per pagina). Non fallisce mai: restituisce lo stato. */
export function preparaChiaveDispositivo() {
  if (!preparazione) {
    preparazione = (async () => {
      try {
        if (!globalThis.crypto || !globalThis.crypto.subtle) throw new Error('WebCrypto assente');
        if (fabbrica === archivioIndexedDB && typeof indexedDB === 'undefined') throw new Error('IndexedDB assente');
        const archivio = fabbrica();
        let record = await archivio.leggi(VOCE);
        if (!record) record = await archivio.prendiOCrea(VOCE, await nuovoRecord());
        const segreto = await apriRecord(record);
        stato = { modo: 'dispositivo', chiave: record.chiave, segreto };
        segnaUsata();
      } catch (e) {
        const modo = giaUsata() ? 'bloccato' : 'riserva';
        stato = { modo, chiave: null, segreto: null };
        console.warn(
          modo === 'bloccato'
            ? '⚠️ Chiave del dispositivo non leggibile in questo momento: ricarica la pagina.'
            : '⚠️ Questo browser non conserva la chiave del dispositivo: si usa la protezione di prima.',
          e && e.message,
        );
      }
      return stato.modo;
    })();
  }
  return preparazione;
}

/** Stato attuale: 'dispositivo' | 'riserva' | 'bloccato' | null (non ancora preparata). */
export function statoChiaveDispositivo() {
  return stato ? stato.modo : null;
}

function erroreBloccata() {
  return Object.assign(new Error('Chiave del dispositivo non leggibile: ricarica la pagina.'), { codice: 'CHIAVE_BLOCCATA' });
}

async function chiaveDiRiserva() {
  if (!chiaveRiserva) {
    chiaveRiserva = crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  return chiaveRiserva;
}

/** Cifra un testo per il salvataggio nel browser. L'etichetta lega il dato al suo posto (non si puo' spostare). */
export async function cifraConDispositivo(testo, etichetta) {
  const modo = await preparaChiaveDispositivo();
  if (modo === 'bloccato') throw erroreBloccata();
  const chiave = modo === 'dispositivo' ? stato.chiave : await chiaveDiRiserva();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dati = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: codifica.encode(String(etichetta)) },
    chiave,
    codifica.encode(String(testo)),
  ));
  const insieme = new Uint8Array(12 + dati.length);
  insieme.set(iv, 0);
  insieme.set(dati, 12);
  return (modo === 'dispositivo' ? PREFISSO_DISPOSITIVO : PREFISSO_RISERVA) + base64(insieme);
}

/** True se il valore e' nel formato di questo modulo (altrimenti e' un formato vecchio). */
export function formatoDispositivo(valore) {
  const s = String(valore || '');
  return s.startsWith(PREFISSO_DISPOSITIVO) || s.startsWith(PREFISSO_RISERVA);
}

/** Decifra un testo salvato con cifraConDispositivo. Errore con codice CHIAVE_BLOCCATA se la chiave non si legge. */
export async function decifraConDispositivo(valore, etichetta) {
  const modo = await preparaChiaveDispositivo();
  const s = String(valore || '');
  let chiave;
  if (s.startsWith(PREFISSO_DISPOSITIVO)) {
    if (modo === 'bloccato') throw erroreBloccata();
    if (modo !== 'dispositivo') throw new Error('valore cifrato con una chiave del dispositivo che non c\'e\' piu\'');
    chiave = stato.chiave;
  } else if (s.startsWith(PREFISSO_RISERVA)) {
    if (!chiaveRiserva) throw new Error('valore di una visita precedente (chiave solo in memoria)');
    chiave = await chiaveRiserva;
  } else {
    throw new Error('formato vecchio');
  }
  const insieme = daBase64(s.slice(3));
  const chiaro = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: insieme.slice(0, 12), additionalData: codifica.encode(String(etichetta)) },
    chiave,
    insieme.slice(12),
  );
  return decodifica.decode(chiaro);
}

// --- pickle Olm -------------------------------------------------------------------------------------------

function libera(oggetto) {
  try {
    if (oggetto) oggetto.free();
  } catch (_) {
    /* gia' liberato */
  }
}

/**
 * Strumenti per i pickle Olm, a partire dalla chiave vecchia (VITE_PICKLE_KEY), che ora serve solo a:
 * leggere i dati salvati prima della 9a, il formato del backup, e i browser in stato 'riserva'.
 */
export function creaPickler(chiaveVecchia) {
  const locale = () => {
    if (stato && stato.modo === 'dispositivo') return stato.segreto;
    if (stato && stato.modo === 'riserva') return chiaveVecchia;
    throw erroreBloccata();
  };

  // Apre un pickle con la chiave del dispositivo; se non va, con quella vecchia (migrato: true = da riscrivere).
  const daPickle = (Classe, pickled) => {
    const chiave = locale();
    const primo = new Classe();
    try {
      primo.unpickle(chiave, pickled);
      return { oggetto: primo, migrato: false };
    } catch (errore) {
      libera(primo);
      if (chiave === chiaveVecchia) throw errore;
      const secondo = new Classe();
      try {
        secondo.unpickle(chiaveVecchia, pickled);
        return { oggetto: secondo, migrato: true };
      } catch (_) {
        libera(secondo);
        throw errore;
      }
    }
  };

  // Da come e' salvato qui al formato del backup (chiave vecchia: la protezione vera e' la passphrase).
  const perBackup = (Classe, pickled) => {
    const { oggetto } = daPickle(Classe, pickled);
    try {
      return oggetto.pickle(chiaveVecchia);
    } finally {
      libera(oggetto);
    }
  };

  // Dal formato del backup a come si salva qui.
  const daBackup = (Classe, pickled) => {
    const chiave = locale();
    for (const prova of [chiaveVecchia, chiave]) {
      const oggetto = new Classe();
      try {
        oggetto.unpickle(prova, pickled);
        return oggetto.pickle(chiave);
      } catch (_) {
        /* si prova l'altra chiave */
      } finally {
        libera(oggetto);
      }
    }
    throw new Error('Backup non leggibile: pickle non valido.');
  };

  // Come daBackup, ma un dato che non si converte si scrive com'e' (come prima della 9a): al primo caricamento
  // verra' riconosciuto come rovinato e tolto dalle funzioni di lettura, che sanno gia' farlo.
  const daBackupOppureCosi = (Classe, pickled) => {
    try {
      return daBackup(Classe, pickled);
    } catch (e) {
      console.warn('⚠️ Dato del backup non convertibile, scritto com\'e\':', e && e.message);
      return pickled;
    }
  };

  return { locale, daPickle, perBackup, daBackup, daBackupOppureCosi };
}

// Converte un archivio JSON di pickle ({ id: pickle } oppure { id: [pickle, ...] }) voce per voce.
// Una voce illeggibile si salta; JSON non valido -> null.
function convertiJson(testo, converti) {
  if (!testo) return null;
  let mappa;
  try {
    mappa = JSON.parse(testo);
  } catch (_) {
    return null;
  }
  if (!mappa || typeof mappa !== 'object') return null;
  const uscita = {};
  for (const [id, valore] of Object.entries(mappa)) {
    const lista = Array.isArray(valore) ? valore : [valore];
    const convertiti = [];
    for (const p of lista) {
      try {
        convertiti.push(converti(p));
      } catch (e) {
        console.warn(`⚠️ Voce ${id} saltata nella conversione del backup:`, e && e.message);
      }
    }
    if (convertiti.length > 0) uscita[id] = Array.isArray(valore) ? convertiti : convertiti[0];
  }
  return JSON.stringify(uscita);
}

export function jsonPerBackup(pickler, Classe, testo) {
  return convertiJson(testo, (p) => pickler.perBackup(Classe, p));
}

// Dal backup: le voci che non si convertono restano com'erano (verranno tolte alla lettura, come prima);
// JSON non valido -> il testo com'era.
export function jsonDaBackup(pickler, Classe, testo) {
  if (!testo) return testo;
  return convertiJson(testo, (p) => pickler.daBackupOppureCosi(Classe, p)) || testo;
}
