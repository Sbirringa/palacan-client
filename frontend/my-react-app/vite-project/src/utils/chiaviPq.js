// src/utils/chiaviPq.js  [palacan-pq3]
//
// Chiavi post-quantum (ML-KEM-768) di questo dispositivo: generate qui, firmate, pubblicate, ricaricate.
// Da PQ4 ogni chiave di stanza verso un dispositivo viaggera' in una "busta PQ" chiusa con una sua chiave pubblica
// (prelevata dal server, verificata con la firma) DENTRO il messaggio Olm: per leggerla bisognera' rompere X25519
// E ML-KEM. Questo file prepara le chiavi:
//   - usa e getta: il server le consegna una volta sola; il seme si cancella appena usato (nessuno, nemmeno chi
//     ruba il dispositivo dopo, puo' riaprire quella busta);
//   - riserva: una per dispositivo, consegnata quando le usa e getta sono finite; si cambia ogni settimana e la
//     vecchia resta 30 giorni (per le buste gia' partite), poi si cancella.
// Ogni chiave pubblica e' firmata con la chiave ed25519 del dispositivo, sul testo testoFirmaPq(...): chi la usa
// verifica la firma con la chiave di firma imparata via Olm (N5e), quindi il server non puo' sostituirla.
// I semi privati stanno SOLO su questo dispositivo, cifrati con la chiave del dispositivo (chiaveDispositivo.js),
// e MAI nel backup: una chiave post-quantum non si recupera da nessuna parte, per scelta.

import Olm from '../crypto/olm.js';
import * as apiService from '../apiService';
import { cifraConDispositivo, decifraConDispositivo } from './chiaveDispositivo';
import { segnaPqPronto } from './firmaAutore';  // [palacan-pq4]
import { segnaPqIbridoPronto } from './firmaAutore';  // [palacan-pq5d]
import { firmaIbrida, improntaFirmaPq } from './firmaPq';  // [palacan-pq5d]

export const CONTESTO_PRECHIAVE = 'prechiave';  // [palacan-pq5d] contesto della firma ibrida delle chiavi ML-KEM

export const MIN_UNA = 20; // sotto questa soglia sul server si ricarica
export const LOTTO = 50;
export const MAX_SERVER = 100; // lo stesso limite del backend
export const VITA_RISERVA_MS = 7 * 24 * 3600 * 1000;
export const CONSERVA_RISERVA_MS = 30 * 24 * 3600 * 1000;
export const MAX_UNA_LOCALI = 300;
// [palacan-cl2c] Rinnovo periodico delle usa e getta NON usate. Chi ruba questo dispositivo prende anche i semi delle
// chiavi ancora sul server, e finche' restano valide potrebbe aprire le buste future. Ogni VITA_UNA_MS si pubblica un
// lotto nuovo ("sostituisci": il server toglie le vecchie non usate); i semi vecchi restano CONSERVA_UNA_MS (buste gia'
// partite verso un dispositivo spento), poi si cancellano: un furto smette di servire dopo al massimo la loro somma.
export const VITA_UNA_MS = 7 * 24 * 3600 * 1000;
export const CONSERVA_UNA_MS = 30 * 24 * 3600 * 1000;
const archivio = (io) => `palacan_pq_semi_${String(io || '').trim()}`;
const etichetta = (io) => `palacan-pq-semi:${String(io || '').trim()}`;
export const CHIAVE_ARCHIVIO_PQ = archivio;

let coda = Promise.resolve();

/** Testo firmato dal dispositivo per ogni chiave pubblica post-quantum (lo verifica chi la usa). */
export function testoFirmaPq(utente, dispositivo, keyId, tipo, chiave) {
  return `palacan-pq-prechiave-v1|${utente}|${dispositivo}|${keyId}|${tipo}|${chiave}`;
}

function nuovoId() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

// Una sola operazione alla volta sull'archivio dei semi (anche tra schede, se il browser ha Web Locks).
function inEsclusiva(io, fn) {
  if (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function') {
    return navigator.locks.request(`palacan-pq-${io}`, fn);
  }
  const prossimo = coda.then(fn, fn);
  coda = prossimo.catch(() => {});
  return prossimo;
}

async function leggiArchivio(io) {
  const vuoto = { una: {}, riserve: {}, riservaAttuale: null, ibride: null, ibrideV2: null, rinnovoUna: null };  // [palacan-pq5d] ibride [palacan-pq7c] ibrideV2 [palacan-cl2c] rinnovoUna
  let grezzo = null;
  try {
    grezzo = localStorage.getItem(archivio(io));
  } catch (_) {
    return vuoto;
  }
  if (!grezzo) return vuoto;
  const testo = await decifraConDispositivo(grezzo, etichetta(io)); // CHIAVE_BLOCCATA: si propaga (niente si sovrascrive)
  const dati = JSON.parse(testo);
  return {
    una: dati && typeof dati.una === 'object' ? dati.una : {},
    riserve: dati && typeof dati.riserve === 'object' ? dati.riserve : {},
    riservaAttuale: dati ? dati.riservaAttuale || null : null,
    ibride: dati ? dati.ibride || null : null,  // [palacan-pq5d]
    ibrideV2: dati ? dati.ibrideV2 || null : null,  // [palacan-pq7c] il server ha SOLO chiavi con la firma ibrida
    rinnovoUna: dati ? dati.rinnovoUna || null : null,  // [palacan-cl2c] ultimo rinnovo completo delle usa e getta
  };
}

async function scriviArchivio(io, dati) {
  localStorage.setItem(archivio(io), await cifraConDispositivo(JSON.stringify(dati), etichetta(io)));
}

function nuovaChiave({ io, dispositivo, tipo, firma }) {
  const seme = Olm.pq_nuovo_seme();
  const chiave = Olm.pq_chiave_pubblica(seme);
  const keyId = nuovoId();
  const testoFirmato = testoFirmaPq(io, dispositivo, keyId, tipo, chiave);
  const ibrida = firmaIbrida({ io, contesto: CONTESTO_PRECHIAVE, messaggio: testoFirmato, firmaEd: firma });  // [palacan-pq5d]
  return { seme, keyId, uscita: { key_id: keyId, chiave, firma: firma(testoFirmato), ...(ibrida ? { firma_ibrida: ibrida } : {}) } };
}

// [palacan-cl2c] Cancella i semi delle usa e getta ritirate (tolte dal server con "sostituisci") da piu' di
// CONSERVA_UNA_MS. Mai quelle ancora pubblicate, per quanto vecchie: un dispositivo rimasto spento a lungo deve poter
// aprire le buste arrivate nel frattempo. Restituisce quanti semi ha cancellato.
export function togliSemiScaduti(dati, adesso) {
  let tolti = 0;
  for (const [id, v] of Object.entries((dati && dati.una) || {})) {
    if (v && v.ritirata && adesso - v.ritirata > CONSERVA_UNA_MS) {
      delete dati.una[id];
      tolti += 1;
    }
  }
  return tolti;
}

// [palacan-cl2c] Le usa e getta vanno rinnovate? Dopo VITA_UNA_MS dall'ultimo rinnovo. Archivio di prima (senza data):
// si', se la piu' vecchia ha superato VITA_UNA_MS. Dispositivo nuovo (nessuna chiave): no, e' il primo caricamento.
export function usaEGettaDaRinnovare(dati, adesso) {
  if (dati && dati.rinnovoUna) return adesso - dati.rinnovoUna > VITA_UNA_MS;
  const create = Object.values((dati && dati.una) || {}).map((v) => (v && v.creata) || 0);
  return create.length > 0 && adesso - Math.min(...create) > VITA_UNA_MS;
}

/**
 * Controlla le chiavi post-quantum di questo dispositivo sul server e le ricarica se servono.
 * Non lancia mai: restituisce { caricate, riservaNuova } oppure { errore }.
 */
export function assicuraChiaviPq({ io, token, dispositivo, firma, curva = null, soloConFirmaIbrida = false, api = apiService, ora = () => Date.now() }) {  // [palacan-pq4] curva [palacan-pq7g] soloConFirmaIbrida
  if (!io || !token || !dispositivo || typeof firma !== 'function') return Promise.resolve({ errore: 'dati mancanti' });
  return inEsclusiva(io, async () => {
    try {
      const dati = await leggiArchivio(io);
      let stato;
      try {
        stato = await api.getPqCount(dispositivo, token);
      } catch (e) {
        // [palacan-pq4] dispositivo non registrato sul server (accesso dopo un recupero, account vecchi): si registra con
        // la sua chiave d'identita' (la stessa chiamata dell'accesso, la stessa chiave) e si riprova una volta
        const nonTrovato = e && (e.status === 404 || /non trovato|not found|404/i.test(String(e.message || '')));
        if (!nonTrovato || !curva || typeof api.uploadIdentityKey !== 'function') throw e;
        await api.uploadIdentityKey(curva, token, dispositivo);
        console.log('🛡️ [PQ] dispositivo registrato sul server (serve per le chiavi post-quantum)');
        stato = await api.getPqCount(dispositivo, token);
      }
      const sulServer = Number(stato && stato.una) || 0;
      const adesso = ora();
      const attuale = dati.riservaAttuale ? dati.riserve[dati.riservaAttuale] : null;
      const serveRiserva = !(stato && stato.riserva) || !attuale || adesso - (attuale.creata || 0) > VITA_RISERVA_MS;
      // [palacan-pq5d] chiave ML-DSA-65 pronta e chiavi pubblicate firmate con un'altra (o senza): si ripubblica TUTTO
      // con la firma ibrida ("sostituisci": il server toglie le usa e getta vecchie), poi lo si annuncia
      const impronta = improntaFirmaPq(io);
      // [palacan-pq7c] firma ibrida gia' annunciata ma chiave ML-DSA-65 non ancora pronta in questa visita (primo giro
      // all'apertura, prima di assicuraFirmaPq): niente chiavi con la sola ed25519, chi scrive le rifiuterebbe. Si
      // aspetta il giro dopo, che arriva subito dopo assicuraFirmaPq.
      // [palacan-pq7g] anche su un account ripristinato in un browser nuovo (archivio vuoto, nessun segno): l'app chiede
      // soloConFirmaIbrida e senza la chiave ML-DSA-65 pronta non si pubblica niente (il dispositivo e' gia' registrato).
      if (!impronta && (soloConFirmaIbrida || dati.ibride || dati.ibrideV2)) {
        console.log('🛡️ [PQ] chiavi post-quantum: aspetto la chiave di firma ML-DSA-65 (mai chiavi senza firma ibrida)');
        return { caricate: 0, riservaNuova: false, attesa: 'firma ibrida' };
      }
      // [palacan-pq7c] "ibrideV2": archivio scritto prima di questa correzione -> sul server ci possono essere chiavi
      // senza firma ibrida: si ripubblica tutto una volta (sostituisci)
      const daRifirmare = Boolean(impronta) && dati.ibrideV2 !== impronta;
      const sostituisci = daRifirmare || usaEGettaDaRinnovare(dati, adesso);  // [palacan-cl2c] rifirma o rinnovo periodico
      const quante = sostituisci ? LOTTO : (sulServer < MIN_UNA ? Math.min(LOTTO, MAX_SERVER - sulServer) : 0);
      const scaduti = togliSemiScaduti(dati, adesso);  // [palacan-cl2c]
      if (!serveRiserva && !sostituisci && quante <= 0) {
        if (scaduti > 0) await scriviArchivio(io, dati);  // [palacan-cl2c] semi scaduti cancellati anche senza caricare
        segnaPqPronto(io);  // [palacan-pq4] chiavi post-quantum a posto: si annuncia nei messaggi Olm
        if (impronta && dati.ibrideV2 === impronta) segnaPqIbridoPronto(io);  // [palacan-pq5d] [palacan-pq7c]
        return { caricate: 0, riservaNuova: false };
      }

      const una = [];
      for (let i = 0; i < quante; i += 1) {
        const k = nuovaChiave({ io, dispositivo, tipo: 'una', firma });
        dati.una[k.keyId] = { seme: k.seme, creata: adesso };
        una.push(k.uscita);
      }
      let riserva = null;
      if (serveRiserva || daRifirmare) {  // [palacan-pq5d]
        const k = nuovaChiave({ io, dispositivo, tipo: 'riserva', firma });
        dati.riserve[k.keyId] = { seme: k.seme, creata: adesso };
        dati.riservaAttuale = k.keyId;
        riserva = k.uscita;
      }
      // pulizia: riserve vecchie oltre 30 giorni (tranne l'attuale), usa e getta locali oltre il tetto (le piu' vecchie)
      for (const [id, r] of Object.entries(dati.riserve)) {
        if (id !== dati.riservaAttuale && adesso - (r.creata || 0) > CONSERVA_RISERVA_MS) delete dati.riserve[id];
      }
      const ordinate = Object.entries(dati.una).sort((a, b) => (b[1].creata || 0) - (a[1].creata || 0));
      dati.una = Object.fromEntries(ordinate.slice(0, MAX_UNA_LOCALI));
      // prima i semi sul dispositivo, poi le chiavi sul server: mai una chiave pubblicata senza il suo seme
      await scriviArchivio(io, dati);
      await api.uploadPqKeys({ deviceId: dispositivo, una, riserva, ...(sostituisci ? { sostituisci: true } : {}) }, token);  // [palacan-pq5d] [palacan-cl2c]
      console.log(`🛡️ [PQ] chiavi post-quantum pubblicate: ${una.length} usa e getta${riserva ? ' + riserva nuova' : ''}${daRifirmare ? ' (firma ibrida)' : (sostituisci ? ' (rinnovo periodico)' : '')}`);
      segnaPqPronto(io);  // [palacan-pq4] da ora si annuncia nei messaggi Olm
      if (sostituisci || !dati.rinnovoUna) {  // [palacan-cl2c] solo dopo che il server le ha
        if (sostituisci) {
          // il server ha tolto le usa e getta vecchie: i loro semi restano CONSERVA_UNA_MS, poi togliSemiScaduti li cancella
          const nuove = new Set(una.map((u) => u.key_id));
          for (const [id, v] of Object.entries(dati.una)) {
            if (!nuove.has(id) && v && !v.ritirata) v.ritirata = adesso;
          }
        }
        dati.rinnovoUna = adesso;
        await scriviArchivio(io, dati);
      }
      if (daRifirmare) {  // [palacan-pq5d] solo dopo che il server le ha: tutte firmate in modo ibrido, si annuncia
        dati.ibride = impronta;
        dati.ibrideV2 = impronta;  // [palacan-pq7c]
        await scriviArchivio(io, dati);
      }
      if (impronta && dati.ibrideV2 === impronta) segnaPqIbridoPronto(io);  // [palacan-pq5d] [palacan-pq7c]
      return { caricate: una.length, riservaNuova: Boolean(riserva) };
    } catch (e) {
      console.warn('[PQ] chiavi post-quantum non aggiornate (si riprova piu\' tardi):', e && (e.codice || e.message));
      return { errore: (e && (e.codice || e.message)) || 'errore' };
    }
  });
}

/** Seme della chiave post-quantum "keyId" di questo dispositivo (per aprire una busta), oppure null. */
export async function semePq(io, keyId) {
  const dati = await leggiArchivio(io);
  const voce = dati.una[keyId] || dati.riserve[keyId];
  return voce ? voce.seme : null;
}

/** Dopo aver aperto una busta: il seme di una chiave usa e getta si cancella (la riserva resta). */
export function consumaSemePq(io, keyId) {
  return inEsclusiva(io, async () => {
    const dati = await leggiArchivio(io);
    if (!dati.una[keyId]) return false;
    delete dati.una[keyId];
    await scriviArchivio(io, dati);
    return true;
  });
}
