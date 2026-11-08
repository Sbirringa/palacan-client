// src/utils/recapito.js
//
// Palacan - METADATI A4.4c: caselle di recapito nell'app (come Signal).
//
// Ogni utente ha una CHIAVE DI RECAPITO (32 byte casuali, in esadecimale) conservata cifrata sul dispositivo e nel
// backup delle chiavi. Il server ne conosce solo l'impronta (SHA-256, PUT /recapito/impronta). La chiave viaggia
// dentro le chiavi di stanza (cifrate con Olm): chi e' in chat con noi la impara. Dopo un invio sul canale anonimo
// l'app avvisa gli altri membri con POST /recapito/avviso SENZA accesso utente: il server sa solo che "B ha
// novita'", non chi scrive ne' in quale chat.
// Una chiave dichiarata da qualcuno si accetta solo se chi la dichiara e' il creatore della chiave di stanza
// verificato da Olm (registro dei creatori, fase 3.1): nessuno puo' spacciarsi per un altro.
// A4.4c-3: quando si blocca qualcuno la chiave CAMBIA (la vecchia smette di funzionare sul server) e non viene mai
// messa nelle chiavi di stanza destinate a una chat in cui c'e' un bloccato; nelle altre chat private la chiave di
// stanza si rinnova al prossimo messaggio, una volta, e porta con se' la chiave di recapito nuova.

import * as apiService from '../apiService';
import { salvaDato, leggiDato } from './cronologiaLocale';
import { leggiCreatore } from './creatoriChiavi';

const PAUSA_AVVISI_MS = 3000;
const FORMA = /^[0-9a-f]{64}$/;
let utente = null;
let mia = null;
let pubblicata = false;
const note = new Map(); // utente -> sua chiave di recapito
const membri = new Map(); // stanza -> altri membri
const ultimiAvvisi = new Map(); // destinatario -> istante dell'ultimo avviso
const bloccati = new Map(); // id -> nome (da questo dispositivo, copia cifrata A4.3b)
let generazione = 0; // quante volte la chiave e' cambiata
let stanzeAggiornate = {}; // stanza -> generazione gia' distribuita

function esadecimale(bytes) {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

function nomeNormale(nome) {
  return String(nome || '').trim().toLowerCase();
}

export async function improntaRecapito(chiave) {
  return esadecimale(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(chiave)));
}

export async function impostaUtenteRecapito(username) {
  if (!username) return null;
  if (utente !== username) {
    note.clear();
    membri.clear();
    ultimiAvvisi.clear();
    mia = null;
    pubblicata = false;
    bloccati.clear();
    generazione = 0;
    stanzeAggiornate = {};
  }
  utente = username;
  try {
    const salvata = await leggiDato(username, 'recapito_mia');
    mia = salvata && FORMA.test(String(salvata.chiave || '')) ? salvata.chiave : null;
    generazione = Number.isInteger(salvata?.generazione) ? salvata.generazione : 0;
    stanzeAggiornate = salvata && typeof salvata.stanze === 'object' && salvata.stanze ? { ...salvata.stanze } : {};
    if (!mia) {
      mia = esadecimale(crypto.getRandomValues(new Uint8Array(32)));
      await salvaDato(username, 'recapito_mia', { chiave: mia, generazione, stanze: stanzeAggiornate });
    }
    const copiaBloccati = await leggiDato(username, 'specchio_bloccati');
    for (const b of Array.isArray(copiaBloccati?.dati) ? copiaBloccati.dati : []) {
      if (b && b.id != null) bloccati.set(String(b.id), nomeNormale(b.username));
    }
    const contatti = await leggiDato(username, 'recapito_contatti');
    if (contatti && typeof contatti === 'object') {
      for (const [nome, chiave] of Object.entries(contatti)) {
        if (FORMA.test(String(chiave || '')) && !note.has(nome)) note.set(nome, chiave);
      }
    }
  } catch (_) {
    /* senza casella l'app funziona come prima */
  }
  return mia;
}

// Una volta per sessione, quando c'e' un accesso utente a disposizione.
export async function pubblicaImprontaSeServe(token) {
  if (!mia || pubblicata || !token || typeof apiService.setRecapitoImpronta !== 'function') return false;
  try {
    await apiService.setRecapitoImpronta(await improntaRecapito(mia), token);
    pubblicata = true;
    return true;
  } catch (_) {
    return false;
  }
}

function contieneBloccati(destinatari) {
  const nomiBloccati = new Set(Array.from(bloccati.values()).filter(Boolean));
  return (Array.isArray(destinatari) ? destinatari : []).some((d) => nomiBloccati.has(nomeNormale(d?.username || d)));
}

function salvaPropria() {
  if (utente && mia) salvaDato(utente, 'recapito_mia', { chiave: mia, generazione, stanze: stanzeAggiornate }).catch(() => {});
}

// Da mettere dentro la chiave di stanza che mandiamo: mai se tra i destinatari c'e' qualcuno che abbiamo bloccato.
export function recapitoDaCondividere(destinatari = []) {
  if (!utente || !mia || contieneBloccati(destinatari)) return null;
  return { utente: nomeNormale(utente), chiave: mia };
}

// Dopo un cambio di chiave: la chiave di stanza di questa chat va rinnovata una volta (porta la chiave nuova).
// Non nelle chat con un bloccato: li' la chiave di recapito non viaggia comunque.
export function recapitoDaRinnovare(roomId, destinatari = []) {
  const id = String(roomId || '').trim();
  if (!utente || !id || generazione === 0 || contieneBloccati(destinatari)) return false;
  if ((stanzeAggiornate[id] || 0) >= generazione) return false;
  stanzeAggiornate[id] = generazione;
  salvaPropria();
  return true;
}

// Blocco: chiave nuova (la vecchia smette di funzionare sul server) e bloccato ricordato. Mai un'eccezione.
export async function ruotaRecapito(token, bloccato = null) {
  if (!utente) return false;
  if (bloccato && bloccato.id != null) bloccati.set(String(bloccato.id), nomeNormale(bloccato.username));
  mia = esadecimale(crypto.getRandomValues(new Uint8Array(32)));
  generazione += 1;
  pubblicata = false;
  salvaPropria();
  return pubblicaImprontaSeServe(token);
}

// Sblocco: non e' piu' escluso; ricevera' la chiave con la prossima chiave di stanza di una chat in comune.
export function segnaSbloccato(id) {
  if (id != null) bloccati.delete(String(id));
}

// Chiave di recapito arrivata dentro una chiave di stanza: si accetta solo dal creatore verificato di quella chiave.
export function imparaRecapito(sessionId, dichiarato, tentativi = 1) {
  if (!utente || !dichiarato || typeof dichiarato !== 'object') return false;
  const nome = nomeNormale(dichiarato.utente);
  const chiave = String(dichiarato.chiave || '').trim().toLowerCase();
  if (!nome || !FORMA.test(chiave) || nome === nomeNormale(utente)) return false;
  const creatore = sessionId ? leggiCreatore(utente, sessionId) : null;
  if (!creatore) {
    if (tentativi > 0) setTimeout(() => imparaRecapito(sessionId, dichiarato, tentativi - 1), 50);
    return false;
  }
  if (nomeNormale(creatore.utente) !== nome) return false;
  if (note.get(nome) === chiave) return true;
  note.set(nome, chiave);
  salvaDato(utente, 'recapito_contatti', Object.fromEntries(note)).catch(() => {});
  return true;
}

// Membri di una chat, dall'ultima condivisione delle chiavi (noi esclusi).
export function ricordaMembri(roomId, utenti, io) {
  const id = String(roomId || '').trim();
  if (!id || !Array.isArray(utenti)) return;
  const noi = nomeNormale(io);
  membri.set(id, Array.from(new Set(utenti.map((u) => nomeNormale(u?.username || u)).filter((n) => n && n !== noi))));
}

// Dopo un invio sul canale anonimo: avviso vuoto agli altri membri di cui conosciamo la casella.
export function avvisaStanza(roomId) {
  if (!utente || typeof apiService.sendAvvisoRecapito !== 'function') return 0;
  const adesso = Date.now();
  let mandati = 0;
  for (const nome of membri.get(String(roomId || '').trim()) || []) {
    const chiave = note.get(nome);
    if (!chiave || adesso - (ultimiAvvisi.get(nome) || 0) < PAUSA_AVVISI_MS) continue;
    ultimiAvvisi.set(nome, adesso);
    Promise.resolve().then(() => apiService.sendAvvisoRecapito(nome, chiave)).catch(() => {});
    mandati += 1;
  }
  return mandati;
}

export function dimenticaRecapito() {
  utente = null;
  mia = null;
  pubblicata = false;
  note.clear();
  membri.clear();
  ultimiAvvisi.clear();
  bloccati.clear();
  generazione = 0;
  stanzeAggiornate = {};
}
