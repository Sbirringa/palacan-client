// src/utils/statoGruppo.js
//
// Palacan - METADATI A4.2b: stato del gruppo cifrato e firmato (membri, nome, creatore).
//
// Lo stato di una chat privata e' un piccolo documento che il server conserva SENZA saperlo leggere
// (GET/PUT /rooms/{id}/stato con il gettone di stanza, A4.2a):
//   cifratura: chiave AES-GCM derivata dal segreto di stanza (HKDF-SHA256, info "palacan-stato-v1"),
//              dati autenticati "palacan-stato-v1:<stanza>" (uno stato non si puo' spostare su un'altra stanza)
//   firma:     chiave Ed25519 dell'account Olm di chi lo modifica, sul testo canonico (chiavi ordinate) di tutto
//              tranne la firma; la chiave dichiarata deve essere quella PUBBLICATA per l'autore (come le buste A2.4)
// Regole (le fa rispettare l'app di ciascun membro, non il server):
//   - rinominare e togliere altri membri: solo il creatore;  - uscire: ciascuno per se';
//   - aggiungere membri: qualunque membro;  - il creatore non cambia;  - la versione cresce sempre.
// In questo passo lo stato si costruisce IN PARALLELO: l'app lo usera' per condividere le chiavi dall'A4.4.

import Olm from '../crypto/olm.js';  // [palacan-vodozemac]
import * as apiService from '../apiService';
import { gettoneDa, segretoConfermato } from './segretiStanze';
import { imparaNomeStanza } from './nomiStanze';
import { chiaveFirmaPerQuestoAccount } from './firmaAutore';  // [palacan-n5e]
import { improntePqFirmaPerChiave } from './firmaAutore';  // [palacan-pq5c]
import { firmaIbrida, firmaIbridaPronta, verificaIbrida, chiavePqFirmaNota } from './firmaPq';  // [palacan-pq5c]

const INFO = new TextEncoder().encode('palacan-stato-v1');
const stati = new Map(); // stanza -> ultimo stato valido (in memoria; sul dispositivo dall'A4.3)

function base64(bytes) {
  let testo = '';
  for (const b of new Uint8Array(bytes)) testo += String.fromCharCode(b);
  return btoa(testo);
}

function daBase64(testo) {
  return Uint8Array.from(atob(String(testo || '')), (c) => c.charCodeAt(0));
}

// JSON con le chiavi in ordine: lo stesso contenuto da' sempre lo stesso testo da firmare.
export function canonico(valore) {
  if (Array.isArray(valore)) return `[${valore.map(canonico).join(',')}]`;
  if (valore && typeof valore === 'object') {
    return `{${Object.keys(valore).sort().map((k) => `${JSON.stringify(k)}:${canonico(valore[k])}`).join(',')}}`;
  }
  return JSON.stringify(valore === undefined ? null : valore);
}

async function chiaveStato(segreto) {
  const materiale = await crypto.subtle.importKey('raw', daBase64(segreto), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: INFO },
    materiale, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

function datiAutenticati(roomId) {
  return new TextEncoder().encode(`palacan-stato-v1:${roomId}`);
}

export async function cifraStato(segreto, roomId, contenuto) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const cifrato = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: datiAutenticati(roomId) },
    await chiaveStato(segreto), new TextEncoder().encode(JSON.stringify(contenuto)),
  ));
  const uscita = new Uint8Array(12 + cifrato.length);
  uscita.set(nonce, 0);
  uscita.set(cifrato, 12);
  return base64(uscita);
}

export async function decifraStato(segreto, roomId, blob) {
  const dati = daBase64(blob);
  const chiaro = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: dati.slice(0, 12), additionalData: datiAutenticati(roomId) },
    await chiaveStato(segreto), dati.slice(12),
  );
  return JSON.parse(new TextDecoder().decode(chiaro));
}

function verificaOlm(chiave, testo, firma) {
  const utilita = new Olm.Utility();
  try {
    utilita.ed25519_verify(chiave, testo, firma);
    return true;
  } catch (_) {
    return false;
  } finally {
    utilita.free();
  }
}

function senzaFirma(contenuto) {
  const { firma, firma_pq, ...resto } = contenuto;  // [palacan-pq5c] firma_pq copre lo stesso testo della firma ed25519
  return resto;
}

// [palacan-pq5c] Stanze in cui si e' gia' visto uno stato con firma ibrida valida: da li' in poi uno stato con la sola
// ed25519 di un autore che ha una chiave ML-DSA-65 non vale piu' (niente downgrade). Sul dispositivo, per utente.
const archivioIbride = (io) => `palacan_stato_ibrido_${String(io || '').trim()}`;

function stanzeIbride(io) {
  try {
    const o = JSON.parse(localStorage.getItem(archivioIbride(io)) || '[]');
    return Array.isArray(o) ? o : [];
  } catch (_) {
    return [];
  }
}

function segnaStanzaIbrida(io, roomId) {
  if (!io) return;
  const elenco = stanzeIbride(io);
  if (elenco.includes(String(roomId))) return;
  try {
    localStorage.setItem(archivioIbride(io), JSON.stringify(elenco.concat(String(roomId)).slice(-2000)));
  } catch (_) { /* archivio pieno: si risegna al prossimo stato */ }
}

/**
 * [palacan-pq5c] Firma ibrida dello stato, per chi legge "io": 'valida' (ed25519 E ML-DSA-65 reggono), 'ammessa'
 * (autore senza chiave ML-DSA-65: come prima), 'da_aggiornare' (stato scritto prima della chiave ML-DSA-65: valido,
 * da riscrivere con la firma ibrida) o 'rifiutata' (parte ibrida falsa, chiave non ancora scaricata, o sola ed25519
 * dove si e' gia' visto uno stato ibrido).
 */
export function esitoIbridoStato({ io, contenuto, testo }) {
  const impronte = io ? improntePqFirmaPerChiave(io, contenuto.autore, contenuto.chiave_firma) : [];
  const fp = contenuto.firma_pq && typeof contenuto.firma_pq === 'object' ? contenuto.firma_pq : null;
  if (fp && impronte.includes(String(fp.q || ''))) {
    const pubblica = chiavePqFirmaNota(io, fp.q);
    if (!pubblica) return 'rifiutata'; // si riprova alla prossima sincronizzazione (la chiave si scarica da sola)
    return verificaIbrida({ contesto: 'stato-gruppo', ed: contenuto.chiave_firma, pubblica, messaggio: testo, fe: fp.fe, fq: fp.fq })
      ? 'valida' : 'rifiutata';
  }
  if (!impronte.length) return 'ammessa';
  return stanzeIbride(io).includes(String(contenuto.stanza)) ? 'rifiutata' : 'da_aggiornare';
}

function elenco(membri) {
  return Array.from(new Set((membri || []).map((m) => String(m)))).sort();
}

// Regole della modifica (la firma si controlla a parte).
export function transizioneValida(precedente, nuovo, roomId) {
  if (!nuovo || nuovo.v !== 1 || String(nuovo.stanza) !== String(roomId)) return false;
  if (!Array.isArray(nuovo.membri) || !nuovo.creatore || !nuovo.autore || !Number.isInteger(nuovo.versione)) return false;
  if (!precedente) return nuovo.membri.includes(nuovo.autore);
  if (nuovo.versione <= precedente.versione || nuovo.creatore !== precedente.creatore) return false;
  const eCreatore = nuovo.autore === precedente.creatore;
  if (!eCreatore && !precedente.membri.includes(nuovo.autore)) return false;
  const tolti = precedente.membri.filter((m) => !nuovo.membri.includes(m));
  if (tolti.length && !eCreatore && !(tolti.length === 1 && tolti[0] === nuovo.autore)) return false;
  if ((nuovo.nome ?? null) !== (precedente.nome ?? null) && !eCreatore) return false;
  return true;
}

// Firma valida, chiave pubblicata per l'autore, modifica permessa.
export async function statoValido(contenuto, precedente, roomId, { verifica = verificaOlm, chiavePubblicata, io = null, ibrido = esitoIbridoStato }) {
  if (!contenuto || !contenuto.firma || !contenuto.chiave_firma) return false;
  const testoFirmato = canonico(senzaFirma(contenuto));
  if (!verifica(contenuto.chiave_firma, testoFirmato, contenuto.firma)) return false;
  if (!(await chiavePubblicata(contenuto.autore, contenuto.chiave_firma))) return false;
  if (ibrido({ io, contenuto, testo: testoFirmato }) === 'rifiutata') return false;  // [palacan-pq5c]
  return transizioneValida(precedente, contenuto, roomId);
}

function applica(roomId, contenuto) {
  stati.set(String(roomId), contenuto);
  if (contenuto.nome) imparaNomeStanza(roomId, contenuto.nome, Date.parse(contenuto.modificato_il) || 0);
}

async function leggiEVerifica(roomId, segreto, gettone, dip) {
  const { stato, versione } = await dip.leggi(roomId, gettone);
  if (!stato) return { versione: Number(versione) || 0, contenuto: null };
  const contenuto = await decifraStato(segreto, roomId, stato);
  const precedente = stati.get(String(roomId)) || null;
  const valido = contenuto.versione === Number(versione)
    && (precedente && precedente.versione === contenuto.versione
      ? canonico(precedente) === canonico(contenuto)
      : await statoValido(contenuto, precedente, roomId, dip));
  if (valido) applica(roomId, contenuto);
  // [palacan-pq5c] stato con firma ibrida valida: stanza segnata (da qui niente stati con la sola ed25519);
  // stato scritto prima della chiave ML-DSA-65: valido, da riscrivere con la firma ibrida
  const esitoPq = valido && dip.io ? esitoIbridoStato({ io: dip.io, contenuto, testo: canonico(senzaFirma(contenuto)) }) : null;
  if (esitoPq === 'valida') segnaStanzaIbrida(dip.io, roomId);
  return { versione: Number(versione) || 0, contenuto: valido ? contenuto : null, rifiutato: !valido, daAggiornare: esitoPq === 'da_aggiornare' };
}

async function scrivi(roomId, segreto, gettone, versioneAttuale, campi, io, dip) {
  const contenuto = {
    v: 1, stanza: String(roomId), versione: versioneAttuale + 1, ...campi,
    membri: elenco(campi.membri), autore: io, chiave_firma: dip.miaChiave, modificato_il: new Date().toISOString(),
  };
  contenuto.firma = dip.firmatore(canonico(senzaFirma(contenuto)));
  const ibrida = firmaIbrida({ io, contesto: 'stato-gruppo', messaggio: canonico(senzaFirma(contenuto)), firmaEd: dip.firmatore });  // [palacan-pq5c]
  if (ibrida) contenuto.firma_pq = ibrida;
  const precedente = stati.get(String(roomId)) || null;
  if (!transizioneValida(precedente, contenuto, roomId)) return false;
  try {
    await dip.scrivi(roomId, gettone, await cifraStato(segreto, roomId, contenuto), versioneAttuale);
  } catch (_) {
    return false; // 409: qualcuno ha scritto prima; si riprova alla prossima sincronizzazione
  }
  applica(roomId, contenuto);
  if (ibrida) segnaStanzaIbrida(io, roomId);  // [palacan-pq5c]
  return true;
}

function dipendenze(token, altre = {}) {
  return {
    leggi: apiService.getRoomState,
    scrivi: apiService.putRoomState,
    // [palacan-n5e] /keys/query non ha mai pubblicato le chiavi di firma: si usano quelle imparate via Olm (mai dal server)
    chiavePubblicata: async (utente, chiave) => chiaveFirmaPerQuestoAccount(utente, chiave),
    ...altre,
  };
}

// Allinea lo stato ai partecipanti attuali (in parallelo alla condivisione delle chiavi). Mai un'eccezione.
export async function sincronizzaStatoGruppo({ roomId, utenti, io, token, firmatore, miaChiave, ...altre }) {
  try {
    const segreto = segretoConfermato(roomId);
    if (!segreto || !io || !firmatore || !miaChiave) return false;
    const dip = dipendenze(token, { firmatore, miaChiave, io, ...altre });  // [palacan-pq5c] io: chi verifica
    const gettone = await gettoneDa(segreto);
    const { versione, contenuto, rifiutato, daAggiornare } = await leggiEVerifica(roomId, segreto, gettone, dip);  // [palacan-pq5c] daAggiornare
    if (rifiutato) return false;
    const presenti = elenco((Array.isArray(utenti) ? utenti : []).map((u) => u?.username || u).filter(Boolean).concat([io]));
    if (!contenuto) {
      if (versione !== 0) return false;
      return scrivi(roomId, segreto, gettone, 0, { creatore: utenti?.creatore || io, membri: presenti, nome: null }, io, dip);
    }
    if (!contenuto.membri.includes(io)) return false;
    let membri = elenco(contenuto.membri.concat(presenti.filter((m) => !contenuto.membri.includes(m))));
    if (io === contenuto.creatore) membri = membri.filter((m) => presenti.includes(m) || m === io);
    if (canonico(membri) === canonico(contenuto.membri) && !(daAggiornare && firmaIbridaPronta(io))) return true;  // [palacan-pq5c]
    return scrivi(roomId, segreto, gettone, versione, { creatore: contenuto.creatore, membri, nome: contenuto.nome ?? null }, io, dip);
  } catch (_) {
    return false;
  }
}

// Il creatore rinomina: il nome nuovo va anche nello stato. Mai un'eccezione.
export async function aggiornaNomeStatoGruppo({ roomId, nome, io, token, firmatore, miaChiave, ...altre }) {
  try {
    const segreto = segretoConfermato(roomId);
    if (!segreto || !io || !firmatore || !miaChiave || !String(nome || '').trim()) return false;
    const dip = dipendenze(token, { firmatore, miaChiave, io, ...altre });  // [palacan-pq5c] io: chi verifica
    const gettone = await gettoneDa(segreto);
    const { versione, contenuto } = await leggiEVerifica(roomId, segreto, gettone, dip);
    if (!contenuto || contenuto.creatore !== io) return false;
    return scrivi(roomId, segreto, gettone, versione,
      { creatore: contenuto.creatore, membri: contenuto.membri, nome: String(nome).trim().slice(0, 100) }, io, dip);
  } catch (_) {
    return false;
  }
}

export function statoConosciuto(roomId) {
  return stati.get(String(roomId)) || null;
}

export function dimenticaStati() {
  stati.clear();
}
