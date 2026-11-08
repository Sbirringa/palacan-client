// src/utils/busteSigillate.js
//
// Palacan - METADATI A2.2-A2.4: scambio delle chiavi di stanza in busta sigillata.
//
// Chi manda una chiave di stanza a un altro utente la chiude nella "busta" del destinatario (A2.1):
// mittente, chiave d'identita' del mittente, identificativo e contenuto Olm stanno DENTRO. Il server vede solo
// il destinatario. Schema del sigillo: chiave X25519 usa e getta + HKDF-SHA256 (sale = pubblica usa e getta ||
// pubblica del destinatario, info "palacan-busta-v1") + AES-256-GCM (dati autenticati "palacan-busta-v1").
// Formato (base64): 0x01 | pubblica usa e getta (32) | nonce (12) | cifrato + tag (16).
//
// SICUREZZA: il nome del mittente dentro la busta lo scrive il mittente stesso. Chi riceve verifica che la
// chiave d'identita' usata sia quella PUBBLICATA per quel nome (/keys/query, che non consuma chiavi usa e
// getta): altrimenti un utente potrebbe dichiararsi qualcun altro e fargli attribuire dei messaggi (3.1).
// L'identificativo dentro la busta e' un codice casuale (quello di sempre rivela stanza e nomi): questo modulo
// lo ricorda e traduce la conferma di ricezione nell'identificativo di sempre.
// Senza busta del destinatario, o verso i propri dispositivi, o se qualcosa va storto: il modo di oggi.

import { sendToDevice, sendMessage } from '../wsClient';
import * as apiService from '../apiService';
import { bustaSupportata, bustaPubblica, chiavePrivataBusta } from './busta';

const ETICHETTA = new TextEncoder().encode('palacan-busta-v1');
const VERSIONE = 1;
// La busta di un destinatario si ricorda pochi secondi (giusto un giro di invii): se lui la cambia
// (browser nuovo, dati cancellati), chi gli manda chiavi deve usare subito quella nuova, o lui non potrebbe aprirle.
const DURATA_BUSTA = 15 * 1000;
const DURATA_SENZA_BUSTA = 60 * 1000;
const MASSIMO_CONFERME = 2000;

const cacheBuste = new Map(); // destinatario -> { chiave | null, scade }
const verificati = new Map(); // `${utente}|${chiave}` -> true
const conferme = new Map(); // codice casuale -> identificativo di sempre

// Solo per i test: dimentica le buste dei destinatari e le verifiche gia' fatte.
export function _azzeraCache() {
  cacheBuste.clear();
  verificati.clear();
}

function base64(bytes) {
  let testo = '';
  for (const b of bytes) testo += String.fromCharCode(b);
  return btoa(testo);
}

function daBase64(testo) {
  return Uint8Array.from(atob(String(testo || '')), (c) => c.charCodeAt(0));
}

async function chiaveSimmetrica(condiviso, pubblicaUsaEGetta, pubblicaDestinatario) {
  const materiale = await crypto.subtle.importKey('raw', condiviso, 'HKDF', false, ['deriveKey']);
  const sale = new Uint8Array(64);
  sale.set(pubblicaUsaEGetta, 0);
  sale.set(pubblicaDestinatario, 32);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: sale, info: ETICHETTA },
    materiale,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function sigilla(pubblicaDestinatarioB64, oggetto) {
  const pubblicaDestinatario = daBase64(pubblicaDestinatarioB64);
  if (pubblicaDestinatario.length !== 32) throw new Error('busta del destinatario non valida');
  const destinatario = await crypto.subtle.importKey('raw', pubblicaDestinatario, { name: 'X25519' }, false, []);
  const usaEGetta = await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
  const pubblicaUsaEGetta = new Uint8Array(await crypto.subtle.exportKey('raw', usaEGetta.publicKey));
  const condiviso = await crypto.subtle.deriveBits({ name: 'X25519', public: destinatario }, usaEGetta.privateKey, 256);
  const chiave = await chiaveSimmetrica(condiviso, pubblicaUsaEGetta, pubblicaDestinatario);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const cifrato = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: ETICHETTA },
    chiave,
    new TextEncoder().encode(JSON.stringify(oggetto)),
  ));
  const uscita = new Uint8Array(1 + 32 + 12 + cifrato.length);
  uscita[0] = VERSIONE;
  uscita.set(pubblicaUsaEGetta, 1);
  uscita.set(nonce, 33);
  uscita.set(cifrato, 45);
  return base64(uscita);
}

export async function apriSigillo(username, testo) {
  const dati = daBase64(testo);
  if (dati[0] !== VERSIONE || dati.length < 1 + 32 + 12 + 16) throw new Error('formato della busta non riconosciuto');
  const pubblicaUsaEGetta = dati.slice(1, 33);
  const nonce = dati.slice(33, 45);
  const cifrato = dati.slice(45);
  const privata = await chiavePrivataBusta(username);
  const pubblicaMia = daBase64(await bustaPubblica(username));
  const usaEGetta = await crypto.subtle.importKey('raw', pubblicaUsaEGetta, { name: 'X25519' }, false, []);
  const condiviso = await crypto.subtle.deriveBits({ name: 'X25519', public: usaEGetta }, privata, 256);
  const chiave = await chiaveSimmetrica(condiviso, pubblicaUsaEGetta, pubblicaMia);
  const chiaro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, additionalData: ETICHETTA }, chiave, cifrato);
  return JSON.parse(new TextDecoder().decode(chiaro));
}

async function bustaDi(destinatario, token) {
  const voce = cacheBuste.get(destinatario);
  if (voce && voce.scade > Date.now()) return voce.chiave;
  const chiave = await apiService.getBustaKey(destinatario, token);
  cacheBuste.set(destinatario, { chiave: chiave || null, scade: Date.now() + (chiave ? DURATA_BUSTA : DURATA_SENZA_BUSTA) });
  return chiave || null;
}

function codiceCasuale() {
  return `k-${Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

// Conferma di ricezione: dal codice casuale all'identificativo di sempre (una sola volta). null se non e' nostro.
export function idOriginaleConferma(id) {
  if (!id || !conferme.has(String(id))) return null;
  const originale = conferme.get(String(id));
  conferme.delete(String(id));
  return originale;
}

// Al posto di sendToDevice per le chiavi di stanza verso ALTRI utenti.
export async function inviaChiaveDiStanza(mittente, token, parametri) {
  try {
    if (parametri && parametri.eventType === 'm.room_key' && mittente && token
        && parametri.targetUsername && parametri.targetUsername !== mittente && (await bustaSupportata())) {
      const chiave = await bustaDi(parametri.targetUsername, token);
      if (chiave) {
        const codice = codiceCasuale();
        const busta = await sigilla(chiave, {
          v: 1,
          sender: mittente,
          sender_key: parametri.senderKey || parametri.content?.sender_key || null,
          event_type: 'm.room_key',
          client_msg_id: codice,
          algorithm: parametri.algorithm || null,
          content: parametri.content,
        });
        conferme.set(codice, parametri.clientMsgId || null);
        while (conferme.size > MASSIMO_CONFERME) conferme.delete(conferme.keys().next().value);
        return sendMessage({
          type: 'to_device',
          event_type: 'm.sealed',
          eventType: 'm.sealed',
          target_username: parametri.targetUsername,
          targetUsername: parametri.targetUsername,
          content: { busta },
        });
      }
    }
  } catch (_) {
    /* qualunque problema: il modo di oggi */
  }
  return sendToDevice(parametri);
}

async function mittenteVerificato(utente, chiaveIdentita, token) {
  const voce = `${utente}|${chiaveIdentita}`;
  if (verificati.has(voce)) return true;
  const risposta = await apiService.queryMatrixKeys(utente, token);
  const ok = Boolean(chiaveIdentita) && JSON.stringify(risposta || {}).includes(String(chiaveIdentita));
  if (ok) verificati.set(voce, true);
  return ok;
}

// Apre una busta ricevuta e verifica il mittente dichiarato. Restituisce l'evento come quelli di sempre, o null.
export async function apriBustaRicevuta(username, token, data) {
  try {
    const busta = data?.content?.busta;
    if (!busta || !username) return null;
    const interno = await apriSigillo(username, busta);
    if (!interno || interno.event_type !== 'm.room_key' || !interno.sender || !interno.sender_key) return null;
    if (interno.sender === username) return null;
    if (!(await mittenteVerificato(interno.sender, interno.sender_key, token))) {
      console.warn('Busta scartata: la chiave del mittente non corrisponde a quella pubblicata');
      return null;
    }
    return {
      ...data,
      type: 'to_device',
      event_type: 'm.room_key',
      eventType: 'm.room_key',
      sender: interno.sender,
      sender_username: interno.sender,
      senderUsername: interno.sender,
      sender_key: interno.sender_key,
      senderKey: interno.sender_key,
      algorithm: interno.algorithm || null,
      client_msg_id: interno.client_msg_id || null,
      clientMsgId: interno.client_msg_id || null,
      room_id: null,
      roomId: null,
      content: interno.content,
      _sigillata: true,
    };
  } catch (_) {
    return null;
  }
}
