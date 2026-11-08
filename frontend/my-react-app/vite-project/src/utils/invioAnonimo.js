// src/utils/invioAnonimo.js
//
// Palacan - invio sul canale anonimo per le chat private (metadati fasi 3.4c, 3.4d, 3.4d-bis, 3.4d-ter e 3.6).
//
// - Gettone di stanza: uguale per tutti i membri (il server non sa chi lo usa). Tenuto in memoria;
//   se il server risponde 403 (e' cambiato chi e' nella stanza) si richiede e si riprova una volta.
// - Segreto di cancellazione: generato per ogni messaggio; al server va solo l'impronta SHA-256, il
//   segreto resta sul dispositivo e serve per "elimina per tutti" (il server non sa chi e' l'autore).
// - Attivazione: alla prima volta in una stanza si crea una nuova chiave di stanza, cosi' ogni
//   messaggio anonimo ha un creatore registrato (mittente verificato, 3.1).

import * as apiService from '../apiService';
import { segretoConfermato, daGenerare, nuovoSegretoStanza, verificatoreDa, confermaSegreto, segnaVerificatoreOccupato, gettoneDa } from './segretiStanze';  // [palacan-metadati-a4.1b]
import { avvisaStanza } from './recapito';  // [palacan-metadati-a4.4c]

const gettoni = new Map();
const chiaveSegreti = (username) => `palacan_segreti_cancellazione_${String(username || '').trim()}`;
const chiaveAttivazioni = (username) => `palacan_canale_anonimo_attivo_${String(username || '').trim()}`;
const MAX_SEGRETI = 5000;

function leggiJson(chiave, riserva) {
  try {
    const valore = JSON.parse(localStorage.getItem(chiave) || 'null');
    return valore == null ? riserva : valore;
  } catch (_) {
    return riserva;
  }
}

function scriviJson(chiave, valore) {
  try {
    localStorage.setItem(chiave, JSON.stringify(valore));
  } catch (_) {
    /* archivio pieno o non disponibile: non blocca l'invio */
  }
}

// Chat privata = nessuna azienda. Le chat aziendali usano il canale identificato (fase 3.5).
export function stanzaPrivata(stanza) {
  return Boolean(stanza) && !stanza.workspace_id && !stanza.workspaceId && !stanza.is_corporate && !stanza.isCorporate;
}

export function nuovoSegreto() {
  const byte = new Uint8Array(32);
  crypto.getRandomValues(byte);
  return Array.from(byte, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function impronta(segreto) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(segreto));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function salvaSegreto(username, identificativi, segreto) {
  if (!username || !segreto) return;
  const mappa = leggiJson(chiaveSegreti(username), {});
  for (const id of identificativi) {
    if (id) mappa[String(id)] = segreto;
  }
  const chiavi = Object.keys(mappa);
  if (chiavi.length > MAX_SEGRETI) {
    for (const vecchia of chiavi.slice(0, chiavi.length - MAX_SEGRETI)) delete mappa[vecchia];
  }
  scriviJson(chiaveSegreti(username), mappa);
}

export function leggiSegreto(username, ...identificativi) {
  const mappa = leggiJson(chiaveSegreti(username), {});
  for (const id of identificativi) {
    if (id && mappa[String(id)]) return mappa[String(id)];
  }
  return null;
}

export function daAttivare(username, roomId) {
  return !leggiJson(chiaveAttivazioni(username), []).includes(String(roomId));
}

export function segnaAttivato(username, roomId) {
  const elenco = leggiJson(chiaveAttivazioni(username), []);
  if (!elenco.includes(String(roomId))) {
    elenco.push(String(roomId));
    scriviJson(chiaveAttivazioni(username), elenco);
  }
}

// [palacan-metadati-a4.1b] gettone calcolato dal segreto di stanza: nessuna richiesta al server (che rivelerebbe chi e' membro).
// Al primo invio in una chat privata senza verificatore: genera il segreto e registra il verificatore; se il
// server ne ha gia' uno (ha vinto un altro membro) si usa il gettone di sempre e il segreto arrivera' con le chiavi.
async function gettoneDalSegreto(roomId, token) {
  try {
    let segreto = segretoConfermato(roomId);
    if (!segreto && daGenerare(roomId) && typeof apiService.setRoomVerifier === 'function') {
      const nuovo = nuovoSegretoStanza();
      const verificatore = await verificatoreDa(nuovo);
      try {
        await apiService.setRoomVerifier(roomId, verificatore, token);
      } catch (errore) {
        segnaVerificatoreOccupato(roomId);
        return null;
      }
      confermaSegreto(roomId, nuovo, verificatore);
      segreto = nuovo;
    }
    return segreto ? await gettoneDa(segreto) : null;
  } catch (_) {
    return null;
  }
}

async function gettoneStanza(roomId, token, rinnova = false) {
  if (!rinnova) { const derivato = await gettoneDalSegreto(roomId, token); if (derivato) return derivato; }  // [palacan-metadati-a4.1b]
  if (!rinnova && gettoni.has(String(roomId))) return gettoni.get(String(roomId));
  const risposta = await apiService.getRoomToken(roomId, token);
  const gettone = risposta && risposta.room_token;
  if (!gettone) throw new Error('gettone di stanza non ricevuto');
  gettoni.set(String(roomId), gettone);
  return gettone;
}

export function dimenticaGettoni() {
  gettoni.clear();
}

// Invia un messaggio gia' cifrato sul canale anonimo. Restituisce { id, seq, client_msg_id }.
// eslint-disable-next-line no-unused-vars
export async function inviaAnonimo({ roomId, token, username, cipherBody, sessionId = null, clientMsgId = null, eventKind = null }) {
  const segreto = nuovoSegreto();
  const corpo = {
    cipher_body: typeof cipherBody === 'string' ? cipherBody : JSON.stringify(cipherBody),
    algorithm: 'm.megolm.v1.aes-sha2',
    // 3.4d: il session_id non si manda piu' (collegherebbe tra loro i messaggi della stessa persona);
    // chi riceve trova la chiave provando quelle della stanza.
    session_id: null,
    client_msg_id: clientMsgId,
    delete_token_hash: await impronta(segreto),
    // 3.6: 'reaction' per le reazioni (il server non le conta nei non letti)
    ...(eventKind ? { event_kind: eventKind } : {}),
  };
  salvaSegreto(username, [clientMsgId], segreto);
  let gettone = await gettoneStanza(roomId, token);
  let risposta;
  try {
    risposta = await apiService.sendAnonMessage(roomId, gettone, corpo);
    avvisaStanza(roomId);  // [palacan-metadati-a4.4c] avviso vuoto agli altri membri
  } catch (errore) {
    if (errore && errore.status === 403) {
      gettone = await gettoneStanza(roomId, token, true);
      risposta = await apiService.sendAnonMessage(roomId, gettone, corpo);
      avvisaStanza(roomId);  // [palacan-metadati-a4.4c] avviso vuoto agli altri membri
    } else {
      throw errore;
    }
  }
  if (risposta && risposta.id) salvaSegreto(username, [risposta.id], segreto);
  return risposta;
}

// 3.4d-bis - nuovi tentativi per gli errori temporanei (rete assente, server che si riavvia, 5xx, 429).
// Nelle chat private NON esiste un canale di riserva identificato: se tutti i tentativi falliscono,
// l'errore risale e il chiamante segna il messaggio come "non inviato".
export const ATTESE_TENTATIVI_MS = [1000, 3000, 7000];

export function erroreTemporaneo(errore) {
  const stato = errore && errore.status;
  return !stato || stato >= 500 || stato === 429;
}

export async function inviaAnonimoConTentativi(parametri, attese = ATTESE_TENTATIVI_MS) {
  let ultimoErrore = null;
  for (let tentativo = 0; tentativo <= attese.length; tentativo += 1) {
    try {
      return await inviaAnonimo(parametri);
    } catch (errore) {
      ultimoErrore = errore;
      if (!erroreTemporaneo(errore) || tentativo === attese.length) break;
      await new Promise((risolvi) => setTimeout(risolvi, attese[tentativo]));
    }
  }
  throw ultimoErrore;
}

// 3.4d-ter - coda di uscita: i messaggi privati che non sono partiti restano sul dispositivo (gia' cifrati),
// ricompaiono come "non inviato" anche dopo un ricaricamento e vengono ritentati da soli o con "Riprova".
const chiaveUscita = (username) => `palacan_coda_uscita_${String(username || '').trim()}`;
const MAX_IN_USCITA = 200;

export function leggiUscita(username) {
  const elenco = leggiJson(chiaveUscita(username), []);
  return Array.isArray(elenco) ? elenco : [];
}

export function mettiInUscita(username, { clientMsgId, roomId, cipherBody = null, creato = Date.now() } = {}) {
  if (!username || !clientMsgId || !roomId) return;
  const elenco = leggiUscita(username).filter((v) => String(v.clientMsgId) !== String(clientMsgId));
  elenco.push({ clientMsgId: String(clientMsgId), roomId: String(roomId), cipherBody, creato });
  scriviJson(chiaveUscita(username), elenco.slice(-MAX_IN_USCITA));
}

export function togliDaUscita(username, clientMsgId) {
  const elenco = leggiUscita(username);
  const rimasti = elenco.filter((v) => String(v.clientMsgId) !== String(clientMsgId));
  if (rimasti.length !== elenco.length) scriviJson(chiaveUscita(username), rimasti);
}
