// src/utils/segnaliChiamata.js  [palacan-l4e]
//
// Dati per avviare le chiamate cifrati end-to-end (L4e, Chiusura limiti).
//
// Il problema: per avviare una chiamata i due dispositivi si scambiano l'offerta e la risposta SDP (con l'impronta
// DTLS che protegge voce e video) e i candidati ICE (gli indirizzi a cui collegarsi). Passavano dal server IN CHIARO:
// chi controlla il server poteva sostituire l'impronta e mettersi in mezzo alla chiamata, e vedeva se era una
// videochiamata.
//
// La soluzione:
//   - offerta ('invite'), risposta ('answer') e candidati ('ice_candidate') si cifrano con la chiave Megolm della chat
//     (la stessa dei messaggi; arriva solo ai dispositivi firmati del contatto, L4c3). Al server resta una busta
//     { e2e, session_id, ciphertext }: non sa nemmeno se e' una videochiamata;
//   - chi riceve accetta un segnale SOLO se:
//       * si decifra con una chiave di quella chat;
//       * la chiave e' stata creata dal contatto che chiama (registro dei creatori, 3.1, o attestato firmato, N5e),
//         mai da noi: un nostro segnale rimandato indietro si scarta;
//       * dentro c'e' la stessa chat, lo stesso tipo di segnale e lo stesso mittente dichiarati fuori;
//       * non e' gia' stato visto (stesso indice Megolm) e ha meno di VALIDITA_MS (offerte vecchie riusate: scartate);
//   - in chiaro, non decifrabile o falso: scartato. Nessun ripiego in chiaro, ne' in uscita ne' in arrivo;
//   - la chiave della chat puo' arrivare un attimo dopo il segnale: si riprova per qualche secondo (riceviConAttesa).
// 'reject' ed 'end' non portano dati e restano come sono: il server puo' solo far cadere una chiamata (cosa che puo'
// gia' fare non inoltrando i pacchetti). Detto nel registro formale/README.md.

import { leggiCreatore } from './creatoriChiavi';
import { verificaAttestato } from './firmaAutore';

export const VERSIONE_SEGNALE = 'palacan-chiamata-v1';
export const TIPO_CONTENUTO = 'segnale_chiamata';
export const SEGNALI_CIFRATI = Object.freeze(['invite', 'answer', 'ice_candidate']);
// Tolleranza per gli orologi dei telefoni non perfettamente allineati; i doppioni si scartano comunque per indice.
export const VALIDITA_MS = 5 * 60 * 1000;
export const TENTATIVI_ATTESA = 20;
export const INTERVALLO_ATTESA_MS = 500;
const MAX_VISTI = 2000;

const visti = new Map(); // "session_id:indice" -> quando visto
let coda = Promise.resolve();
const condivisioni = new Map(); // [palacan-r1] chat -> quando la chiave e' stata condivisa per una chiamata

const testo = (v) => (v == null ? '' : String(v).trim());
const nome = (v) => testo(v).toLowerCase();

export function segnaleDaCifrare(tipo) {
  return SEGNALI_CIFRATI.includes(tipo);
}

/**
 * Cifra i dati di un segnale con la sessione Megolm di invio della chat. Chi chiama deve salvare la sessione subito
 * dopo, senza pause in mezzo (l'indice e' avanzato).
 */
export function cifraSegnale({ olm, sessione, stanza, tipo, mittente, dati, ora = Date.now() }) {
  if (!segnaleDaCifrare(tipo)) throw new Error(`segnale di chiamata non cifrabile: ${tipo}`);
  if (!sessione || typeof sessione.session_id !== 'function') throw new Error('chiave della chat non disponibile');
  if (!testo(stanza) || !testo(mittente)) throw new Error('chat o mittente mancanti');
  const contenuto = {
    tipo: TIPO_CONTENUTO,
    chiamata: { v: 1, segnale: tipo, stanza: testo(stanza), da: testo(mittente), quando: ora, dati: dati ?? null },
  };
  const ciphertext = olm.encryptGroupMessage(sessione, contenuto);
  if (typeof ciphertext !== 'string' || !ciphertext) throw new Error('cifratura del segnale non riuscita');
  return { e2e: VERSIONE_SEGNALE, session_id: sessione.session_id(), ciphertext };
}

const scartato = (motivo) => ({ stato: 'scartato', motivo });

function ricorda(chiave, ora) {
  if (visti.size >= MAX_VISTI) {
    for (const [k, t] of visti) if (ora - t > 2 * VALIDITA_MS) visti.delete(k);
    for (const k of visti.keys()) {
      if (visti.size < MAX_VISTI / 2) break;
      visti.delete(k); // i piu' vecchi per primi
    }
  }
  visti.set(chiave, ora);
}

/**
 * Apre un segnale arrivato dal server.
 *   { stato: 'ok', dati }            -> da passare al gestore delle chiamate (dati = contenuto decifrato)
 *   { stato: 'manca_chiave' }        -> la chiave della chat non e' ancora arrivata: riprovare tra poco
 *   { stato: 'scartato', motivo }    -> da ignorare
 * normalizza: come l'app scrive l'id di una chat (normalizeRoomId), per confrontarlo con il registro dei creatori.
 */
export function apriSegnale({ olm, evento, sessioni, io, ora = Date.now(), normalizza = testo }) {
  const tipo = evento?.signal_type;
  if (!segnaleDaCifrare(tipo)) return { stato: 'ok', dati: evento?.data ?? null };

  const busta = evento?.data;
  if (!busta || typeof busta !== 'object' || busta.e2e !== VERSIONE_SEGNALE
      || typeof busta.ciphertext !== 'string' || !testo(busta.session_id)) {
    return scartato('in_chiaro');
  }
  const sid = testo(busta.session_id);
  const stanza = testo(normalizza(evento.room_id));
  const chiama = nome(evento.from_username);
  if (!stanza || !chiama) return scartato('evento_incompleto');
  if (chiama === nome(io)) return scartato('da_noi');

  const sessione = sessioni ? sessioni[sid] : null;
  if (!sessione) return { stato: 'manca_chiave' };

  let decifrato;
  try {
    decifrato = olm.decryptGroupMessage(sessione, busta.ciphertext);
  } catch (_) {
    return scartato('non_decifrabile');
  }
  let c;
  try {
    c = olm.safeParseOlmPayload(decifrato?.plaintext);
  } catch (_) {
    return scartato('contenuto_non_valido');
  }
  const s = c && typeof c === 'object' && c.tipo === TIPO_CONTENUTO ? c.chiamata : null;
  if (!s || typeof s !== 'object' || s.v !== 1) return scartato('contenuto_non_valido');
  if (s.segnale !== tipo) return scartato('tipo_diverso');
  if (testo(normalizza(s.stanza)) !== stanza) return scartato('altra_chat');
  if (nome(s.da) !== chiama) return scartato('mittente_diverso');

  // Chi ha creato la chiave: deve essere il contatto che chiama (mai noi).
  const attestato = verificaAttestato(io, sid, c.attestato);
  if (attestato === 'falsa') return scartato('firma_falsa');
  const firmatoDalContatto = attestato === 'valida' && nome(c.attestato?.u) === chiama;
  if (attestato === 'valida' && !firmatoDalContatto) return scartato('autore_diverso');
  const creatore = leggiCreatore(io, sid);
  if (creatore) {
    if (creatore.verifica === 'propria' || nome(creatore.utente) === nome(io)) return scartato('chiave_nostra');
    if (nome(creatore.utente) !== chiama) return scartato('autore_diverso');
    if (creatore.stanza && testo(normalizza(creatore.stanza)) !== stanza) return scartato('altra_chat');
  } else if (!firmatoDalContatto) {
    return scartato('autore_sconosciuto');
  }

  const quando = Number(s.quando);
  if (!Number.isFinite(quando) || Math.abs(ora - quando) > VALIDITA_MS) return scartato('scaduto');
  const indice = decifrato?.messageIndex ?? decifrato?.message_index;
  const chiave = `${sid}:${indice ?? busta.ciphertext}`;
  if (visti.has(chiave)) return scartato('ripetuto');
  ricorda(chiave, ora);

  return { stato: 'ok', dati: s.dati ?? null };
}

/** Apre il segnale; se la chiave della chat non e' ancora arrivata riprova (TENTATIVI_ATTESA x INTERVALLO_ATTESA_MS). */
export function riceviConAttesa({ apri, consegna, scarta, tentativi = TENTATIVI_ATTESA, intervallo = INTERVALLO_ATTESA_MS }) {
  let fatti = 0;
  const prova = () => {
    fatti += 1;
    let esito;
    try {
      esito = apri();
    } catch (e) {
      esito = scartato(`errore: ${e?.message || e}`);
    }
    if (esito?.stato === 'ok') {
      consegna(esito.dati);
      return;
    }
    if (esito?.stato === 'manca_chiave' && fatti < tentativi) {
      setTimeout(prova, intervallo);
      return;
    }
    scarta?.(esito?.stato === 'manca_chiave' ? 'chiave_mai_arrivata' : esito?.motivo || 'sconosciuto');
  };
  prova();
}

/** Una cifratura alla volta: condividere la chiave, cifrare e salvare la sessione non si sovrappongono mai. */
export function inCoda(fn) {
  const risultato = coda.then(() => fn());
  coda = risultato.catch(() => {});
  return risultato;
}

// [palacan-r1] L4e-bis: durante una chiamata la chiave della chat si condivide UNA volta ogni CONDIVISIONE_CHIAMATA_MS
// per chat, non a ogni candidato ICE (prima: una richiesta al server per candidato, e la chiamata piu' lenta a
// collegarsi). Se la condivisione fallisce non si ricorda niente: si riprova al segnale dopo.
export const CONDIVISIONE_CHIAMATA_MS = 30 * 1000;

export async function condividiUnaVolta(stanza, condividi, ora = Date.now()) {
  const chiave = testo(stanza);
  const ultima = condivisioni.get(chiave);
  if (ultima !== undefined && ora - ultima < CONDIVISIONE_CHIAMATA_MS) return false;
  await condividi();
  condivisioni.set(chiave, ora);
  return true;
}

// Solo per i test.
export function _azzeraSegnali() {
  visti.clear();
  coda = Promise.resolve();
  condivisioni.clear();
}
