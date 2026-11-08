// src/utils/segretiStanze.js
//
// Palacan - METADATI A4.1b: segreto di stanza (la "stanza a chiave") sul dispositivo.
//
// Ogni chat privata ha un segreto di 32 byte che conoscono solo i membri: viaggia cifrato dentro le chiavi di
// stanza (come il nome dell'A3.1) ed e' conservato cifrato nella cronologia del dispositivo. Dal segreto l'app
// ricava da sola il gettone del canale anonimo, senza chiederlo al server (la richiesta GET /room-token rivelava
// che chi la fa e' membro). Formule identiche al backend (A4.1a):
//   gettone      = HMAC-SHA256(segreto, "palacan-accesso-v1") in esadecimale
//   verificatore = SHA-256(gettone in esadecimale) in esadecimale   (l'unica cosa che conserva il server)
// Un segreto si usa e si condivide solo se CONFERMATO: il suo verificatore coincide con quello della stanza
// (quello accettato dal server). Se due membri generano un segreto insieme vince il primo; l'altro lo scarta.

import { salvaDato, leggiDato } from './cronologiaLocale';

const ETICHETTA = new TextEncoder().encode('palacan-accesso-v1');
const segreti = new Map(); // stanza -> { segreto (base64), confermato }
const stanze = new Map(); // stanza -> { privata, verificatore }
let utente = null;
let attesa = null;

function base64(bytes) {
  let testo = '';
  for (const b of new Uint8Array(bytes)) testo += String.fromCharCode(b);
  return btoa(testo);
}

function daBase64(testo) {
  return Uint8Array.from(atob(String(testo || '')), (c) => c.charCodeAt(0));
}

function esadecimale(bytes) {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

function segretoValido(segreto) {
  try {
    return daBase64(segreto).length === 32;
  } catch (_) {
    return false;
  }
}

export function nuovoSegretoStanza() {
  return base64(crypto.getRandomValues(new Uint8Array(32)));
}

export async function gettoneDa(segreto) {
  const chiave = await crypto.subtle.importKey('raw', daBase64(segreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return esadecimale(await crypto.subtle.sign('HMAC', chiave, ETICHETTA));
}

export async function verificatoreDa(segreto) {
  const gettone = await gettoneDa(segreto);
  return esadecimale(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(gettone)));
}

function salva() {
  if (!utente) return;
  const perChi = utente;
  clearTimeout(attesa);
  attesa = setTimeout(() => { salvaDato(perChi, 'segreti_stanze', Object.fromEntries(segreti)); }, 300);
}

// Confronta il segreto conosciuto con il verificatore della stanza: se coincide lo conferma, se no lo scarta.
async function controlla(id) {
  const voce = segreti.get(id);
  const info = stanze.get(id);
  if (!voce || !info || !info.verificatore) return;
  const verificatore = await verificatoreDa(voce.segreto);
  const attuale = segreti.get(id);
  if (!attuale || attuale.segreto !== voce.segreto) return;
  if (verificatore === info.verificatore) {
    if (!attuale.confermato) {
      segreti.set(id, { segreto: voce.segreto, confermato: true });
      salva();
    }
  } else {
    segreti.delete(id);
    salva();
  }
}

// Dall'elenco delle stanze (normalizeRoom): tipo di stanza e verificatore attuale.
export function registraStanzaSegreto(roomId, room) {
  const id = String(roomId || '').trim();
  if (!id || !room || typeof room !== 'object') return;
  stanze.set(id, {
    privata: !(room.is_corporate || room.isCorporate),
    verificatore: room.verificatore_accesso ?? room.verificatoreAccesso ?? null,
  });
  controlla(id).catch(() => {});
}

// Segreto ricevuto dentro una chiave di stanza: si conserva, e si usa solo quando coincide col verificatore.
export async function imparaSegretoStanza(roomId, segreto) {
  const id = String(roomId || '').trim();
  if (!id || !segretoValido(segreto)) return false;
  const gia = segreti.get(id);
  if (gia && gia.segreto === segreto) return false;
  if (gia && gia.confermato) return false;
  segreti.set(id, { segreto, confermato: false });
  await controlla(id);
  return true;
}

export function segretoConfermato(roomId) {
  const voce = segreti.get(String(roomId || '').trim());
  return voce && voce.confermato ? voce.segreto : null;
}

// Il segreto da mettere dentro la chiave di stanza: solo se confermato.
export const segretoDaCondividere = segretoConfermato;

// Stanza privata conosciuta, senza verificatore e senza un segreto nostro: tocca a noi generarlo.
export function daGenerare(roomId) {
  const id = String(roomId || '').trim();
  const info = stanze.get(id);
  return Boolean(info && info.privata && !info.verificatore && !segreti.has(id));
}

// Il server ha accettato il nostro verificatore.
export function confermaSegreto(roomId, segreto, verificatore) {
  const id = String(roomId || '').trim();
  segreti.set(id, { segreto, confermato: true, daCondividere: true });  // [palacan-correzioni-prove] da portare a tutti
  stanze.set(id, { ...(stanze.get(id) || { privata: true }), verificatore });
  salva();
}

// Il server ha gia' un verificatore diverso (ha vinto un altro membro): niente nuovi tentativi finche' l'elenco
// delle stanze non porta il verificatore vero, e il segreto arrivera' con le chiavi.
export function segnaVerificatoreOccupato(roomId) {
  const id = String(roomId || '').trim();
  stanze.set(id, { ...(stanze.get(id) || { privata: true }), verificatore: stanze.get(id)?.verificatore || 'occupato' });
}

export async function impostaUtenteSegreti(username) {
  if (!username) return;
  if (utente && utente !== username) segreti.clear();
  utente = username;
  const salvati = await leggiDato(username, 'segreti_stanze');
  if (salvati && typeof salvati === 'object') {
    for (const [id, voce] of Object.entries(salvati)) {
      if (voce && segretoValido(voce.segreto) && !segreti.has(id)) segreti.set(id, { segreto: voce.segreto, confermato: Boolean(voce.confermato), daCondividere: Boolean(voce.daCondividere) });  // [palacan-correzioni-prove]
    }
  }
  for (const id of segreti.keys()) controlla(id).catch(() => {});
}

export function dimenticaSegreti() {
  clearTimeout(attesa);
  segreti.clear();
  stanze.clear();
  utente = null;
}

// [palacan-metadati-a4.4b] gettone di stanza gia' calcolato, da usare senza attese (autenticazione del WebSocket). La prima
// richiesta per una chat avvia il calcolo e restituisce null; da li' in poi il gettone e' pronto.
const gettoniCalcolati = new Map(); // stanza -> { segreto, gettone }
export function gettoneInMemoria(roomId) {
  const id = String(roomId || '').trim();
  const segreto = segretoConfermato(id);
  if (!segreto) return null;
  const voce = gettoniCalcolati.get(id);
  if (voce && voce.segreto === segreto) return voce.gettone;
  gettoneDa(segreto).then((gettone) => gettoniCalcolati.set(id, { segreto, gettone })).catch(() => {});
  return null;
}

// [palacan-correzioni-prove] segreto appena generato e confermato da noi: la chiave di stanza di quella chat va rinnovata una volta,
// cosi' il segreto (che viaggia nella chiave) arriva anche a chi l'aveva gia' ricevuta prima. Vero una volta sola.
export function segretoDaRinnovare(roomId) {
  const id = String(roomId || '').trim();
  const voce = segreti.get(id);
  if (!voce || !voce.confermato || !voce.daCondividere) return false;
  segreti.set(id, { segreto: voce.segreto, confermato: true });
  salva();
  return true;
}
