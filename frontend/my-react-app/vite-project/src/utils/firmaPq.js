// src/utils/firmaPq.js  [palacan-pq5b]
//
// Chiave di FIRMA post-quantum (ML-DSA-65, FIPS 204) di questo account, accanto alla chiave ed25519 dell'account Olm.
// Da PQ5c le firme di Palacan (attestati d'autore, chiavi post-quantum, stato dei gruppi) diventano IBRIDE: valgono
// solo se reggono ed25519 E ML-DSA-65 (crypto/palacan-crypto/src/firma_pq.rs). Questo file prepara la chiave:
//
//   - seme di 32 byte generato qui e legato alla chiave ed25519 dell'account (account nuovo -> seme nuovo); sul
//     dispositivo e' cifrato con la chiave del dispositivo (chiaveDispositivo.js); nel backup delle chiavi viaggia
//     INSIEME all'account Olm, con la stessa protezione (la passphrase): ripristinando l'account torna anche la sua
//     chiave di firma post-quantum, e le firme passate restano verificabili;
//   - la chiave pubblica (1952 byte) si pubblica sul server con la PROVA DI LEGAME: firma ibrida del testo
//     "palacan-pqfirma-legame-v1|<utente>|<curva>" (ed25519 firma l'impronta della chiave ML-DSA e ML-DSA firma la
//     chiave ed25519: le due chiavi si riconoscono a vicenda);
//   - nei messaggi Olm viaggia solo l'IMPRONTA della chiave (SHA-256 esadecimale), dentro la parte cifrata
//     (firmaAutore: "pqf"); chi la impara scarica la chiave per impronta e la accetta solo se l'impronta coincide e il
//     legame regge con la chiave ed25519 imparata via Olm (N5e). Il server puo' solo rifiutarsi di dare la chiave,
//     mai sostituirla.

import Olm from '../crypto/olm.js';
import * as apiService from '../apiService';
import { cifraConDispositivo, decifraConDispositivo } from './chiaveDispositivo';
import { segnaPqFirmaPronta, impostaIbrido, riprovaInAttesa } from './firmaAutore';  // [palacan-pq5c] impostaIbrido, riprovaInAttesa

export const CONTESTO_LEGAME = 'legame';
export const RIPUBBLICA_MS = 24 * 3600 * 1000; // ripubblicata ogni giorno (idempotente): se il server l'ha persa, torna
const MAX_NOTE = 100;
const IMPRONTA = /^[0-9a-f]{64}$/;
const t = (v) => (v == null ? '' : String(v).trim());
const archivio = (io) => `palacan_pqfirma_${t(io)}`;
const etichetta = (io) => `palacan-pqfirma:${t(io)}`;
const archivioNote = (io) => `palacan_pqfirma_note_${t(io)}`;
const archivioSegno = (io) => `palacan_pqfirma_pubblicata_${t(io)}`;
export const CHIAVE_ARCHIVIO_PQFIRMA = archivio;

let mia = null; // { io, ed, seme, pubblica, impronta }
let daRipristinare = null; // { io, ed, seme } arrivato dal backup
const inCorso = new Map(); // "io|impronta" -> Promise (una sola richiesta per chiave)
let coda = Promise.resolve();

/** Testo della prova di legame tra la chiave ed25519 e la chiave ML-DSA-65 di un dispositivo. */
export function testoLegame(utente, curva) {
  return `palacan-pqfirma-legame-v1|${t(utente)}|${t(curva)}`;
}

function daBase64(testo) {
  const s = t(testo);
  return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

/** SHA-256 esadecimale dei byte di una chiave pubblica in base64 (lo stesso calcolo del server e del modulo Rust). */
export async function improntaDi(pubblicaB64) {
  const h = await crypto.subtle.digest('SHA-256', daBase64(pubblicaB64));
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Una sola operazione alla volta sul seme (anche tra schede, se il browser ha Web Locks).
function inEsclusiva(io, fn) {
  if (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function') {
    return navigator.locks.request(`palacan-pqfirma-${io}`, fn);
  }
  const prossimo = coda.then(fn, fn);
  coda = prossimo.catch(() => {});
  return prossimo;
}

async function leggiSeme(io) {
  let grezzo = null;
  try {
    grezzo = localStorage.getItem(archivio(io));
  } catch (_) {
    return null;
  }
  if (!grezzo) return null;
  const dati = JSON.parse(await decifraConDispositivo(grezzo, etichetta(io))); // CHIAVE_BLOCCATA: si propaga
  return dati && t(dati.seme) && t(dati.ed) ? dati : null;
}

async function scriviSeme(io, dati) {
  localStorage.setItem(archivio(io), await cifraConDispositivo(JSON.stringify(dati), etichetta(io)));
}

function leggiJson(chiave) {
  try {
    const o = JSON.parse(localStorage.getItem(chiave) || 'null');
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch (_) {
    return null;
  }
}

function scriviJson(chiave, valore) {
  try {
    localStorage.setItem(chiave, JSON.stringify(valore));
  } catch (_) { /* archivio pieno: si riscarica la prossima volta */ }
}

function ricorda(io, impronta, pubblica) {
  const note = leggiJson(archivioNote(io)) || {};
  note[impronta] = { chiave: pubblica, vista: Date.now() };
  const ordinate = Object.entries(note).sort((a, b) => (b[1].vista || 0) - (a[1].vista || 0)).slice(0, MAX_NOTE);
  scriviJson(archivioNote(io), Object.fromEntries(ordinate));
}

/**
 * Prepara la chiave di firma post-quantum di questo account e la pubblica (con la prova di legame) se serve; poi la
 * annuncia nei messaggi Olm (solo l'impronta). Il dispositivo deve essere gia' registrato (assicuraChiaviPq).
 * Non lancia mai: restituisce { impronta, pubblicata } oppure { errore }.
 */
export function assicuraFirmaPq({ io, token, dispositivo, ed, curva, firmaEd, api = apiService, ora = () => Date.now() }) {
  const me = t(io);
  if (!me || !token || !dispositivo || !t(ed) || !t(curva) || typeof firmaEd !== 'function') {
    return Promise.resolve({ errore: 'dati mancanti' });
  }
  return inEsclusiva(me, async () => {
    try {
      let dati = await leggiSeme(me);
      const ripristino = daRipristinare && daRipristinare.io === me && daRipristinare.ed === t(ed) ? daRipristinare : null;
      if (ripristino && (!dati || dati.ed !== t(ed) || dati.seme !== ripristino.seme)) {
        dati = { seme: ripristino.seme, ed: t(ed), creata: ora() }; // la chiave dell'account, dal backup
        await scriviSeme(me, dati);
      } else if (!dati || dati.ed !== t(ed)) {
        dati = { seme: Olm.pqfirma_nuovo_seme(), ed: t(ed), creata: ora() }; // account nuovo: chiave nuova
        await scriviSeme(me, dati);
      }
      daRipristinare = null;
      const pubblica = Olm.pqfirma_chiave_pubblica(dati.seme);
      const impronta = await improntaDi(pubblica);
      mia = { io: me, ed: t(ed), seme: dati.seme, pubblica, impronta };
      ricorda(me, impronta, pubblica);

      const segno = leggiJson(archivioSegno(me));
      const firmaSegno = `${t(dispositivo)}|${t(curva)}|${impronta}`;
      let pubblicata = false;
      if (!segno || segno.per !== firmaSegno || ora() - (Number(segno.quando) || 0) > RIPUBBLICA_MS) {
        const messaggio = testoLegame(me, curva);
        const legameEd = firmaEd(Olm.pqfirma_testo_ibrido(CONTESTO_LEGAME, t(ed), pubblica, messaggio));
        const legamePq = Olm.pqfirma_firma(dati.seme, CONTESTO_LEGAME, t(ed), messaggio);
        await api.putPqFirma({ deviceId: dispositivo, chiave: pubblica, legameEd, legamePq }, token);
        scriviJson(archivioSegno(me), { per: firmaSegno, quando: ora() });
        pubblicata = true;
        console.log('🛡️ [PQ] chiave di firma post-quantum (ML-DSA-65) pubblicata');
      }
      segnaPqFirmaPronta(me, impronta); // solo ora: chi la impara la trova gia' sul server
      return { impronta, pubblicata };
    } catch (e) {
      console.warn('[PQ] chiave di firma post-quantum non pronta (si riprova piu\' tardi):', e && (e.codice || e.message));
      return { errore: (e && (e.codice || e.message)) || 'errore' };
    }
  });
}

/** Firma ibrida di questo account su "messaggio": { q (impronta), fe, fq } oppure null se la chiave non e' pronta. */
export function firmaIbrida({ io, contesto, messaggio, firmaEd }) {
  if (!mia || mia.io !== t(io) || typeof firmaEd !== 'function') return null;
  const fe = firmaEd(Olm.pqfirma_testo_ibrido(contesto, mia.ed, mia.pubblica, messaggio));
  const fq = Olm.pqfirma_firma(mia.seme, contesto, mia.ed, messaggio);
  return fe && fq ? { q: mia.impronta, fe, fq } : null;
}

/** Vero solo se reggono entrambe le firme (ed25519 E ML-DSA-65) sullo stesso testo legato alle due chiavi. */
export function verificaIbrida({ contesto, ed, pubblica, messaggio, fe, fq }) {
  try {
    return Olm.pqfirma_verifica_ibrida(t(contesto), t(ed), t(pubblica), String(messaggio ?? ''), t(fe), t(fq)) === true;
  } catch (_) {
    return false;
  }
}

/** Chiave pubblica ML-DSA-65 gia' scaricata e verificata (o la propria) con quell'impronta, oppure null. */
export function chiavePqFirmaNota(io, impronta) {
  const me = t(io);
  const i = t(impronta);
  if (mia && mia.io === me && mia.impronta === i) return mia.pubblica;
  const voce = (leggiJson(archivioNote(me)) || {})[i];
  return voce && voce.chiave ? voce.chiave : null;
}

/**
 * Scarica (una volta) la chiave ML-DSA-65 di "utente" con "impronta", imparata via Olm per il suo dispositivo
 * "curva" con chiave ed25519 "ed". La accetta solo se l'impronta coincide e la prova di legame regge.
 * Restituisce la chiave pubblica oppure null. Non lancia mai.
 */
export function chiavePqFirma({ io, utente, curva, ed, impronta, token, api = apiService }) {
  const me = t(io);
  const i = t(impronta);
  if (!me || !t(utente) || !t(curva) || !t(ed) || !IMPRONTA.test(i)) return Promise.resolve(null);
  const nota = chiavePqFirmaNota(me, i);
  if (nota) return Promise.resolve(nota);
  if (!token || typeof api.getPqFirma !== 'function') return Promise.resolve(null);
  const chiaveCorsa = `${me}|${i}`;
  if (inCorso.has(chiaveCorsa)) return inCorso.get(chiaveCorsa);
  const corsa = (async () => {
    try {
      const v = await api.getPqFirma(t(utente), i, token);
      if (!v || !t(v.chiave)) return null;
      if ((await improntaDi(v.chiave)) !== i) {
        console.warn(`⚠️ [PQ] chiave di firma di ${utente} diversa dall'impronta imparata via Olm: rifiutata`);
        return null;
      }
      const legame = verificaIbrida({
        contesto: CONTESTO_LEGAME, ed, pubblica: v.chiave, messaggio: testoLegame(utente, curva), fe: v.legame_ed, fq: v.legame_pq,
      });
      if (!legame) {
        console.warn(`⚠️ [PQ] chiave di firma di ${utente} senza una prova di legame valida: rifiutata`);
        return null;
      }
      ricorda(me, i, t(v.chiave));
      riprovaInAttesa(utente);  // [palacan-pq5c] i messaggi che aspettavano questa chiave
      return t(v.chiave);
    } catch (e) {
      console.warn(`[PQ] chiave di firma di ${utente} non disponibile:`, e && (e.status || e.message));
      return null;
    } finally {
      inCorso.delete(chiaveCorsa);
    }
  })();
  inCorso.set(chiaveCorsa, corsa);
  return corsa;
}

/** Per il backup delle chiavi (con l'account Olm): { seme, ed } oppure null se non ancora pronta in questa visita. */
export function firmaPqPerBackup(io) {
  return mia && mia.io === t(io) ? { seme: mia.seme, ed: mia.ed } : null;
}

/** Dal backup: la chiave si adotta al prossimo assicuraFirmaPq, solo se e' legata alla stessa chiave ed25519. */
export function ripristinaFirmaPqDaBackup(io, voce) {
  if (voce && typeof voce === 'object' && t(voce.seme) && t(voce.ed) && t(io)) {
    daRipristinare = { io: t(io), seme: t(voce.seme), ed: t(voce.ed) };
  }
}

/** [palacan-pq5d] Impronta della chiave ML-DSA-65 di questo account (pronta in questa visita), oppure null. */
export function improntaFirmaPq(io) {
  return mia && mia.io === t(io) ? mia.impronta : null;
}

/** [palacan-pq5c] Questo account puo' gia' firmare in modo ibrido (chiave ML-DSA-65 pronta in questa visita)? */
export function firmaIbridaPronta(io) {
  return Boolean(mia && mia.io === t(io));
}

// [palacan-pq5c] firmaAutore usa la firma ibrida per gli attestati d'autore (senza importare questo file: niente cicli)
impostaIbrido({ firma: firmaIbrida, verifica: verificaIbrida, chiaveNota: chiavePqFirmaNota });

// Solo per i test.
export function _azzeraFirmaPq() {
  mia = null;
  daRipristinare = null;
  inCorso.clear();
  coda = Promise.resolve();
}
