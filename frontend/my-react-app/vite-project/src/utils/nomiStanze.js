// src/utils/nomiStanze.js
//
// Palacan - METADATI A3.1: nomi dei gruppi privati conservati sul dispositivo.
//
// Obiettivo (A3.2-A3.3): il server non conosce piu' i nomi dei gruppi PRIVATI. Il nome viaggia dentro la chiave
// di stanza (cifrata con Olm, e in busta sigillata dall'A2), e ogni dispositivo lo conserva cifrato nella propria
// cronologia (cronologiaLocale). Questo modulo impara i nomi in due modi:
//   - dal server, finche' li ha (cosi' i gruppi esistenti hanno gia' il nome quando il server lo dimentichera');
//   - dalle chiavi di stanza ricevute (il canale del futuro: arriva anche a chi entra dopo).
// Le chat dirette e le stanze aziendali non sono toccate (i nomi aziendali restano sul server: dichiarato).
// Quando un nome cambia si chiede di ricaricare l'elenco delle stanze ('palacan:stanze-cambiate', A1).

import { salvaDato, leggiDato } from './cronologiaLocale';

const nomi = new Map(); // stanza -> { nome, ordine }
let utente = null;
let attesa = null;
const LUNGHEZZA_MASSIMA = 100;

export function eGruppoPrivato(room) {
  if (!room || typeof room !== 'object') return false;
  const tipo = room.room_kind ?? room.roomKind ?? null;
  return tipo !== 'direct' && !room.is_corporate && !room.isCorporate;
}

function avvisa() {
  try {
    window.dispatchEvent(new CustomEvent('palacan:stanze-cambiate'));
  } catch (_) {
    /* ambiente senza window (test) */
  }
}

function salva() {
  if (!utente) return;
  const perChi = utente;
  clearTimeout(attesa);
  attesa = setTimeout(() => { salvaDato(perChi, 'nomi_stanze', Object.fromEntries(nomi)); }, 500);
}

// All'accesso: carica i nomi conservati (unendoli a quelli gia' imparati in questa sessione).
export async function impostaUtenteNomi(username) {
  if (!username) return;
  if (utente && utente !== username) nomi.clear();
  utente = username;
  const salvati = await leggiDato(username, 'nomi_stanze');
  let cambiati = false;
  if (salvati && typeof salvati === 'object') {
    for (const [id, voce] of Object.entries(salvati)) {
      if (!voce || !voce.nome) continue;
      const gia = nomi.get(id);
      if (!gia || (voce.ordine || 0) > (gia.ordine || 0)) {
        nomi.set(id, { nome: String(voce.nome), ordine: voce.ordine || 0 });
        cambiati = true;
      }
    }
  }
  if (nomi.size) salva();
  if (cambiati) avvisa();
}

export function imparaNomeStanza(roomId, nome, ordine = Date.now()) {
  const id = String(roomId || '').trim();
  const pulito = String(nome || '').trim().slice(0, LUNGHEZZA_MASSIMA);
  if (!id || !pulito) return false;
  const gia = nomi.get(id);
  if (gia && gia.nome === pulito) return false;
  if (gia && (gia.ordine || 0) > ordine) return false;
  nomi.set(id, { nome: pulito, ordine });
  salva();
  avvisa();
  return true;
}

export function nomeLocale(roomId) {
  const voce = nomi.get(String(roomId || '').trim());
  return voce ? voce.nome : null;
}

// Il nome da mettere dentro la chiave di stanza (solo se e' un gruppo privato di cui conosciamo il nome).
export function nomeDaCondividere(roomId) {
  return nomeLocale(roomId);
}

// All'uscita dall'account (la cronologia del dispositivo, nomi compresi, la cancella gia' performLogout).
export function dimenticaNomi() {
  clearTimeout(attesa);
  nomi.clear();
  utente = null;
}

// [palacan-metadati-a3.2b2] l'utente di cui si conservano i nomi (per aprire le buste degli inviti)
export function utenteCorrenteNomi() {
  return utente;
}
