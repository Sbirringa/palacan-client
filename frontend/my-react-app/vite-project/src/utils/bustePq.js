// src/utils/bustePq.js  [palacan-pq4]
//
// Doppia busta delle chiavi di stanza: ML-KEM-768 (post-quantum) DENTRO Olm (X25519). Per leggere una chiave di
// stanza registrata oggi bisognera' rompere X25519 E ML-KEM, anche con un computer quantistico domani.
//
// Invio (olmService, per ogni dispositivo destinatario):
//   - si prelevano UNA volta per destinatario le sue chiavi post-quantum (/keys/pq/claim: una per dispositivo);
//   - si verifica la firma della chiave con la chiave ed25519 di quel dispositivo imparata via Olm (N5e): firma falsa
//     -> a quel dispositivo non si manda niente (il server ha provato a sostituirla); chiave di firma non ancora nota
//     -> si usa lo stesso (protegge comunque da chi registra il traffico: come la prima volta in PQXDH di Signal);
//   - il messaggio (m.room_key, chiavi inoltrate) si chiude in una busta legata a mittente, destinatario e chiavi
//     d'identita' di entrambi; la busta va nel messaggio Olm;
//   - NIENTE DOWNGRADE: verso un dispositivo che ci ha annunciato (dentro Olm) di avere chiavi post-quantum non si
//     manda mai il formato vecchio, nemmeno se il server "non trova" le sue chiavi. Il server non puo' togliere la
//     busta: sta dentro Olm. Prima del primo annuncio il formato vecchio resta possibile (come in Signal).
// Ricezione (olmService.decryptOlmEvent): la busta si apre con il seme di questo dispositivo; il seme usa e getta
// si cancella subito. Il resto dell'app riceve il messaggio originale, come prima.

import Olm from '../crypto/olm.js';
import * as apiService from '../apiService';
import { semePq, consumaSemePq, testoFirmaPq, CONTESTO_PRECHIAVE } from './chiaviPq';  // [palacan-pq5d] CONTESTO_PRECHIAVE
import { chiaveFirmaPerCurva, supportoPqAnnunciato } from './firmaAutore';
import { improntePqFirmaPerCurva, supportoPqIbridoAnnunciato, utenteFirmatario } from './firmaAutore';  // [palacan-pq5d]
import { chiavePqFirma, chiavePqFirmaNota, verificaIbrida } from './firmaPq';  // [palacan-pq5d]

export const TIPO_BUSTA = 'palacan.pq.v1';
const TIPI_PROTETTI = new Set(['m.room_key', 'm.forwarded_room_keys', 'm.forwarded_room_key']);
// [palacan-cl2b] Busta post-quantum OBBLIGATORIA: una chiave di stanza non parte mai senza busta ML-KEM (nemmeno verso
// un dispositivo che non ha mai annunciato chiavi post-quantum: il server potrebbe nasconderle proprio a un dispositivo
// nuovo) e non si accetta se arriva senza. Il dispositivo che non ha ancora chiavi riceve la chiave al giro successivo
// di condivisione, appena le pubblica. L'unica eccezione e' per i test vecchi che non preparano chiavi post-quantum:
// vale SOLO dentro vitest (nella build Vite sostituisce import.meta.env.MODE e il permesso sparisce).
const SOLO_TEST = Boolean(import.meta.env && import.meta.env.MODE === 'test');
let senzaPqNeiTest = null;
const RIFIUTATO = JSON.stringify({ type: 'palacan.pq.non_apribile' });

/** Solo per i test: true = i test vecchi possono mandare chiavi senza busta; false = obbligatoria (come nell'app). */
export function _consentiSenzaPqSoloTest(valore) {
  senzaPqNeiTest = valore;
}

function senzaPqConsentito() {
  if (!SOLO_TEST) return false;
  if (senzaPqNeiTest !== null) return Boolean(senzaPqNeiTest);
  return Boolean(globalThis.__PALACAN_TEST_SENZA_PQ__);
}
const testo = (v) => (v == null ? '' : String(v).trim());

// [palacan-cl2h] Data delle chiavi ML-KEM. Ogni chiave porta il momento di creazione, firmato dal dispositivo (testo v2):
// chi scrive rifiuta le chiavi piu' vecchie di 21 giorni (tre rinnovi, CL2c) e quelle datate nel futuro. Cosi' un server
// complice di chi ha rubato lo stato non puo' riproporre per sempre una chiave vecchia rubata (modello formale 6).
// Le chiavi senza data (formato v1, di prima) si accettano fino al 10 dicembre 2026, poi mai piu': alla prima apertura
// ogni dispositivo le ripubblica con la data. Un dispositivo spento piu' a lungo riceve le chiavi di stanza quando si
// riapre (le chiede ai membri, N5). Nei test vecchi (dentro vitest) i controlli sulla data restano spenti.
export const ETA_MAX_PRECHIAVE_MS = 21 * 24 * 3600 * 1000;
export const ANTICIPO_MAX_PRECHIAVE_MS = 24 * 3600 * 1000;
export const FINE_PRECHIAVI_V1_MS = Date.UTC(2026, 11, 10);
let fineV1 = SOLO_TEST ? Infinity : FINE_PRECHIAVI_V1_MS;
let controlloEta = !SOLO_TEST;

/** Solo per i test: { fineV1, controlloEta } come nell'app (FINE_PRECHIAVI_V1_MS, true). */
export function _prechiaviSoloTest({ fineV1: f, controlloEta: c } = {}) {
  if (f !== undefined) fineV1 = f;
  if (c !== undefined) controlloEta = Boolean(c);
}

/** Testo firmato che chi scrive verifica per questa chiave (v2 con la data, oppure v1 nel periodo di passaggio). */
export function testoFirmatoDellaVoce(destinatario, voce, adesso) {
  if (voce.creata == null) {
    if (adesso >= fineV1) {
      throw new Error(`PQ: chiave post-quantum di ${destinatario} senza data (formato vecchio): non si usa piu'`);
    }
    return testoFirmaPq(destinatario, voce.device_id, voce.key_id, voce.tipo, voce.chiave);
  }
  const creata = Number(voce.creata);
  if (!Number.isFinite(creata) || creata <= 0) throw new Error(`PQ: chiave post-quantum di ${destinatario} con una data non valida`);
  if (controlloEta && adesso - creata > ETA_MAX_PRECHIAVE_MS) {
    throw new Error(`PQ: chiave post-quantum di ${destinatario} troppo vecchia: non si manda niente a quel dispositivo`);
  }
  if (controlloEta && creata - adesso > ANTICIPO_MAX_PRECHIAVE_MS) {
    throw new Error(`PQ: chiave post-quantum di ${destinatario} datata nel futuro: non si manda niente a quel dispositivo`);
  }
  return testoFirmaPq(destinatario, voce.device_id, voce.key_id, voce.tipo, voce.chiave, creata);
}

export function contestoBusta(mittente, curvaMittente, destinatario, curvaDestinatario) {
  return `palacan-pq-chiave-v1|${testo(mittente)}|${testo(curvaMittente)}|${testo(destinatario)}|${testo(curvaDestinatario)}`;
}

function verificaFirma(chiave, messaggio, firma) {
  const u = new Olm.Utility();
  try {
    u.ed25519_verify(chiave, messaggio, firma);
    return true;
  } catch (_) {
    return false;
  } finally {
    try { u.free(); } catch (_) { /* gia' liberata */ }
  }
}

/** Chiavi post-quantum del destinatario, una per dispositivo: Map(curva25519 -> voce). Mai un'eccezione. */
export async function chiaviPqPer(destinatario, token, api = apiService) {
  const mappa = new Map();
  if (!destinatario || !token) return mappa;
  try {
    // dentro il try anche il controllo: nei test con apiService finto la funzione puo' non esistere
    if (typeof api.claimPqKeys !== 'function') return mappa;
    for (const v of await api.claimPqKeys(destinatario, token)) {
      if (v && v.identity_key && v.chiave && v.key_id) mappa.set(String(v.identity_key), v);
    }
  } catch (e) {
    console.warn('[PQ] chiavi post-quantum del destinatario non disponibili:', e && (e.status || e.message));
  }
  // [palacan-pq5d] dispositivi che hanno annunciato chiavi ML-KEM con firma ibrida: la loro chiave ML-DSA-65 si scarica
  // (una volta, verificata con impronta e legame) prima di chiudere le buste
  const io = utenteFirmatario();
  if (io) {
    await Promise.all(Array.from(mappa.entries()).map(async ([curva, v]) => {
      const fi = v && v.firma_ibrida && typeof v.firma_ibrida === 'object' ? v.firma_ibrida : null;
      const ed = chiaveFirmaPerCurva(io, destinatario, curva);
      if (!fi || !fi.q || !ed || !supportoPqIbridoAnnunciato(io, destinatario, curva)) return;
      await chiavePqFirma({ io, utente: destinatario, curva, ed, impronta: fi.q, token, api });
    }));
  }
  return mappa;
}

/**
 * Restituisce il testo da cifrare con Olm per il dispositivo "curvaDest" di "destinatario": il payload com'e' se non
 * e' un tipo protetto; altrimenti la busta. Lancia se la chiave post-quantum ha una firma falsa, o se manca ma quel
 * dispositivo ha annunciato di averne (niente downgrade).
 */
export function chiudiPerDispositivo({ payload, io, curvaMia, destinatario, curvaDest, chiaviPq, ora = () => Date.now() }) {  // [palacan-cl2h] ora
  let letto = null;
  try {
    letto = JSON.parse(payload);
  } catch (_) {
    return payload;
  }
  if (!letto || !TIPI_PROTETTI.has(letto.type)) return payload;
  const voce = chiaviPq && curvaDest ? chiaviPq.get(String(curvaDest)) : null;
  if (!voce) {
    if (supportoPqAnnunciato(io, destinatario, curvaDest)) {
      throw new Error(`PQ: il dispositivo di ${destinatario} ha chiavi post-quantum ma il server non le ha date: niente formato vecchio`);
    }
    if (!senzaPqConsentito()) {  // [palacan-cl2b]
      throw new Error(`PQ: nessuna chiave post-quantum per il dispositivo di ${destinatario}: la chiave di stanza non parte senza busta`);
    }
    return payload; // solo nei test vecchi (vedi senzaPqConsentito)
  }
  const messaggioFirmato = testoFirmatoDellaVoce(destinatario, voce, ora());  // [palacan-cl2h] data controllata e firmata
  const ed = chiaveFirmaPerCurva(io, destinatario, curvaDest);
  if (ed && !verificaFirma(ed, messaggioFirmato, voce.firma)) {
    throw new Error(`PQ: chiave post-quantum di ${destinatario} con firma non valida: non si manda niente a quel dispositivo`);
  }
  // [palacan-pq5d] dispositivo che ha annunciato chiavi ML-KEM con firma ibrida: senza una firma ibrida valida non si
  // manda niente (chi sa falsificare la sola ed25519, un domani con un computer quantistico, potrebbe sostituire la chiave)
  if (ed && supportoPqIbridoAnnunciato(io, destinatario, curvaDest)) {
    const fi = voce.firma_ibrida && typeof voce.firma_ibrida === 'object' ? voce.firma_ibrida : null;
    const pubblica = fi && improntePqFirmaPerCurva(io, destinatario, curvaDest).includes(String(fi.q || ''))
      ? chiavePqFirmaNota(io, fi.q) : null;
    const messaggio = messaggioFirmato;  // [palacan-cl2h]
    if (!pubblica || !verificaIbrida({ contesto: CONTESTO_PRECHIAVE, ed, pubblica, messaggio, fe: fi.fe, fq: fi.fq })) {
      throw new Error(`PQ: chiave post-quantum di ${destinatario} senza una firma ibrida valida: non si manda niente a quel dispositivo`);
    }
  }
  const busta = Olm.pq_sigilla(voce.chiave, contestoBusta(io, curvaMia, destinatario, curvaDest), payload);
  return JSON.stringify({ type: TIPO_BUSTA, pq: { key_id: voce.key_id, busta } });
}

/** Dopo la decifratura Olm: se e' una busta post-quantum la apre (e consuma il seme usa e getta). Mai un'eccezione. */
export async function apriSeBusta({ io, mittente, curvaMittente, curvaMia, plaintext }) {
  if (typeof plaintext !== 'string') return plaintext;
  let letto = null;
  try {
    letto = JSON.parse(plaintext);
  } catch (_) {
    return plaintext;
  }
  // [palacan-cl2b] una chiave di stanza arrivata SENZA busta post-quantum non si accetta
  if (letto && TIPI_PROTETTI.has(letto.type) && !senzaPqConsentito()) {
    console.warn(`⚠️ [PQ] chiave di stanza da ${mittente} senza busta post-quantum: rifiutata`);
    return RIFIUTATO;
  }
  if (!letto || letto.type !== TIPO_BUSTA || !letto.pq) return plaintext;
  const rifiutato = RIFIUTATO;
  try {
    const keyId = testo(letto.pq.key_id);
    const seme = await semePq(io, keyId);
    if (!seme) {
      console.warn(`⚠️ [PQ] busta da ${mittente} per una chiave post-quantum che qui non c'e' (${keyId.slice(0, 6)}...)`);
      return rifiutato;
    }
    const interno = Olm.pq_apri(seme, contestoBusta(mittente, curvaMittente, io, curvaMia), letto.pq.busta);
    await consumaSemePq(io, keyId);
    return interno;
  } catch (e) {
    console.warn(`⚠️ [PQ] busta post-quantum da ${mittente} non apribile:`, e && e.message);
    return rifiutato;
  }
}
