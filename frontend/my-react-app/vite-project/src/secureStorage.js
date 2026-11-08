// src/secureStorage.js
//
// Cifra i dati di accesso salvati nel browser (token, refresh_token, user_id, username, workspace_id,
// workspace_name, user_role).
//
// [palacan-9a] Prima la chiave era VITE_STORAGE_KEY: un valore scritto dentro il codice pubblico del sito, quindi
// uguale per tutti e leggibile da chiunque scaricasse la pagina; il commento di allora diceva che proteggeva da chi
// legge i file del browser, ma con la chiave pubblica non era vero. Ora si usa la chiave del dispositivo
// (utils/chiaveDispositivo.js): AES-GCM a 256 bit generata dal browser, non esportabile, una per browser. Ogni
// valore e' legato al proprio nome (dato autenticato): un valore non si puo' spostare sotto un altro nome.
//
// Valori nel formato di prima: non si convertono (la vecchia chiave era pubblica, non c'e' niente da salvare),
// si tolgono e si rientra con la password, una volta sola.
//
// LIMITE ONESTO: protegge da chi legge i file del browser, dalle estensioni e dagli altri siti; non da un attacco
// XSS attivo o da un programma che controlla il computer mentre la pagina e' aperta: quelli usano la chiave senza
// doverla esportare, e nessuna cifratura dentro il browser li puo' fermare del tutto.
import { cifraConDispositivo, decifraConDispositivo, formatoDispositivo } from './utils/chiaveDispositivo';

const etichetta = (storageKey) => `palacan-accesso:${storageKey}`;

/** Salva un valore cifrato in localStorage. Sempre una stringa in
 * ingresso (chi chiama serializza prima, se serve JSON.stringify). */
export async function setSecureItem(storageKey, plaintextValue) {
  try {
    const cifrato = await cifraConDispositivo(String(plaintextValue), etichetta(storageKey));
    localStorage.setItem(storageKey, cifrato);
  } catch (e) {
    console.error(`❌ Errore cifratura per la chiave "${storageKey}":`, e);
  }
}

/** Legge e decifra un valore. Restituisce null se assente, illeggibile o nel formato di prima (in quei casi il
 * valore si toglie). Se la chiave del dispositivo e' solo momentaneamente illeggibile, restituisce null SENZA
 * togliere niente: al prossimo caricamento della pagina il valore torna leggibile. */
export async function getSecureItem(storageKey) {
  const valoreGrezzo = localStorage.getItem(storageKey);
  if (valoreGrezzo === null) return null;
  try {
    return await decifraConDispositivo(valoreGrezzo, etichetta(storageKey));
  } catch (e) {
    if (e && e.codice === 'CHIAVE_BLOCCATA') return null;
    console.warn(`⚠️ Impossibile decifrare "${storageKey}" (formato vecchio o non valido) - rimosso.`, e && e.message);
    localStorage.removeItem(storageKey);
    return null;
  }
}

export function removeSecureItem(storageKey) {
  localStorage.removeItem(storageKey);
}

/** All'avvio, per ogni chiave nota, PRIMA di leggerla con getSecureItem(): un valore nel formato di prima (in chiaro,
 * o cifrato con la vecchia chiave pubblica) si toglie. Si rientra con la password, una volta sola. */
export async function migrateLegacyPlaintextKey(storageKey) {
  const valoreGrezzo = localStorage.getItem(storageKey);
  if (valoreGrezzo === null || formatoDispositivo(valoreGrezzo)) return;
  localStorage.removeItem(storageKey);
  console.log(`🔄 "${storageKey}" era nel formato di prima: rimosso (si rientra con la password).`);
}
