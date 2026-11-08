// src/utils/datiLocaliCifrati.js  [palacan-9a2]
//
// Dati locali cifrati con la chiave del dispositivo (utils/chiaveDispositivo.js): la cache dei testi dei propri
// messaggi inviati (sent_msg_cache_<utente>) e le bozze (chat_drafts_<utente>). Prima erano in chiaro in
// localStorage: chiunque leggesse i file del browser leggeva i testi dei propri messaggi.
//
// Come prima restano in localStorage, sotto le stesse chiavi, e sopravvivono all'uscita dall'account; il valore
// ora e' cifrato (AES-GCM, legato al nome della chiave: un dato non si puo' spostare sotto un altro nome).
// La cifratura e' asincrona, mentre chi li usa li legge in modo immediato: per questo si caricano in memoria
// PRIMA di servire (preparaDatiLocali, all'avvio e all'accesso) e da li' si leggono subito; ogni salvataggio
// aggiorna la memoria subito e scrive la copia cifrata appena puo' (le scritture ravvicinate si accorpano).
// Valori nel formato di prima (JSON in chiaro): letti una volta e riscritti cifrati.
// Chiave del dispositivo momentaneamente illeggibile: niente si legge e NIENTE si sovrascrive.

import { cifraConDispositivo, decifraConDispositivo, formatoDispositivo } from './chiaveDispositivo';

export const chiaviDatiLocali = (username) => [`sent_msg_cache_${username}`, `chat_drafts_${username}`];

const memoria = new Map(); // chiave -> oggetto
const caricamenti = new Map(); // chiave -> Promise (rifiutata se la chiave del dispositivo e' illeggibile)
const scritture = new Map(); // chiave -> Promise della scrittura in corso
const daRifare = new Set();
const etichetta = (chiave) => `palacan-locale:${chiave}`;

function rimuovi(chiave) {
  try {
    localStorage.removeItem(chiave);
  } catch (_) {
    /* archivio non disponibile */
  }
}

function caricamento(chiave) {
  if (!caricamenti.has(chiave)) {
    const promessa = (async () => {
      await null; // la promessa entra nell'elenco prima di ogni altra cosa (scrivi() la ritrova)
      let grezzo = null;
      try {
        grezzo = localStorage.getItem(chiave);
      } catch (_) {
        return;
      }
      if (grezzo === null) return;
      let valore = null;
      const vecchio = !formatoDispositivo(grezzo);
      if (vecchio) {
        try {
          valore = JSON.parse(grezzo);
        } catch (_) {
          valore = null;
        }
      } else {
        try {
          valore = JSON.parse(await decifraConDispositivo(grezzo, etichetta(chiave)));
        } catch (e) {
          if (e && e.codice === 'CHIAVE_BLOCCATA') throw e;
          return; // illeggibile per sempre (es. chiave di una visita precedente): la prossima scrittura lo sostituisce
        }
      }
      if (valore && typeof valore === 'object' && !Array.isArray(valore)) {
        memoria.set(chiave, { ...valore, ...(memoria.get(chiave) || {}) });
      }
      if (vecchio) {
        if (memoria.has(chiave)) scrivi(chiave);
        else rimuovi(chiave);
      }
    })();
    promessa.catch(() => caricamenti.delete(chiave)); // si riprovera' alla prossima occasione
    caricamenti.set(chiave, promessa);
  }
  return caricamenti.get(chiave);
}

function scrivi(chiave) {
  if (scritture.has(chiave)) {
    daRifare.add(chiave);
    return scritture.get(chiave);
  }
  const promessa = (async () => {
    try {
      await caricamento(chiave);
    } catch (_) {
      return; // chiave del dispositivo illeggibile: non si sovrascrive quello che c'e'
    }
    do {
      daRifare.delete(chiave);
      const valore = memoria.get(chiave);
      if (valore === undefined) return;
      try {
        localStorage.setItem(chiave, await cifraConDispositivo(JSON.stringify(valore), etichetta(chiave)));
      } catch (_) {
        /* archivio pieno o chiave illeggibile: il dato resta in memoria per questa visita */
      }
    } while (daRifare.has(chiave));
  })().finally(() => scritture.delete(chiave));
  scritture.set(chiave, promessa);
  return promessa;
}

/** Carica in memoria i dati locali dell'utente (cache inviati e bozze). Non fallisce mai. */
export async function preparaDatiLocali(username) {
  if (!username) return;
  await Promise.all(chiaviDatiLocali(username).map((chiave) => caricamento(chiave).catch(() => {})));
}

/** Lettura immediata dalla memoria (null se non c'e'). */
export function leggiLocale(chiave) {
  const valore = memoria.get(chiave);
  return valore === undefined ? null : valore;
}

/** Salvataggio: memoria subito, copia cifrata appena possibile. */
export function salvaLocale(chiave, valore) {
  if (!chiave || !valore || typeof valore !== 'object') return Promise.resolve();
  memoria.set(chiave, valore);
  return scrivi(chiave);
}

// Solo per i test.
export async function _attendiScritture() {
  while (scritture.size > 0) await Promise.all([...scritture.values()]);
}

export function _azzera() {
  memoria.clear();
  caricamenti.clear();
  daRifare.clear();
}
