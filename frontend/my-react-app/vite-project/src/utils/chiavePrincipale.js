// src/utils/chiavePrincipale.js  [palacan-l4c2]
//
// Firma incrociata ibrida (L4c): la CHIAVE PRINCIPALE di questa persona, ed25519 + ML-DSA-65, con cui firma i propri
// dispositivi. Chi scrive verifica la persona una volta (numero di sicurezza dalle chiavi principali, L4c3) e si fida
// dei dispositivi firmati; un dispositivo non firmato si segnala e non riceve le chiavi delle stanze.
//
//   - la parte ed25519 vive in un account Olm dedicato (solo per firmare, mai per cifrare), la parte ML-DSA-65 e' un
//     seme di 32 byte: entrambe sul dispositivo cifrate con la chiave del dispositivo (chiaveDispositivo.js) e nel
//     backup delle chiavi con la passphrase, come l'account Olm. Il server vede solo le chiavi pubbliche;
//   - la si pubblica con l'AUTOFIRMA ibrida (prova che chi la pubblica ha entrambe le chiavi private) e con quella si
//     firma ogni dispositivo: testo "palacan-firma-dispositivo-v1|<utente>|<device_id>|<curve25519>";
//   - una sola chiave principale per persona: il primo dispositivo aggiornato la crea; gli altri la ricevono dal backup
//     (passphrase) oppure, senza backup, li approva un dispositivo che ce l'ha (L4c4). Mai sostituita da sola: se sul
//     server ce n'e' un'altra, questo dispositivo la adotta dal backup o aspetta l'approvazione.
// Tutte le firme si verificano con pqfirma_verifica_ibrida: valgono solo se reggono ed25519 E ML-DSA-65.

import Olm from '../crypto/olm.js';
import * as apiService from '../apiService';
import { cifraConDispositivo, decifraConDispositivo } from './chiaveDispositivo';
import { improntaDi } from './firmaPq';

export const CONTESTO_PRINCIPALE = 'principale';
export const CONTESTO_DISPOSITIVO = 'dispositivo';
export const RIFIRMA_MS = 24 * 3600 * 1000; // la firma del proprio dispositivo si ricarica ogni giorno (idempotente)
const t = (v) => (v == null ? '' : String(v).trim());
const archivio = (io) => `palacan_chiave_principale_${t(io)}`;
const etichetta = (io) => `palacan-chiave-principale:${t(io)}`;
const archivioSegno = (io) => `palacan_chiave_principale_firmato_${t(io)}`;
export const CHIAVE_ARCHIVIO_PRINCIPALE = archivio;

let mia = null; // { io, ed, pq, impronta, seme, pickle, chiavePickle } (solo se e' quella ATTUALE dell'account)
let ultimo = null; // [palacan-l4c4] { io, dispositivo, curva, stato } di questo dispositivo, dall'ultimo controllo
export const EVENTO_STATO_DISPOSITIVO = 'palacan:stato-dispositivo';

function ricordaStato(io, dispositivo, curva, stato) {
  ultimo = { io, dispositivo: t(dispositivo), curva: t(curva), stato };
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(EVENTO_STATO_DISPOSITIVO, { detail: { stato } }));
    }
  } catch (_) { /* solo interfaccia */ }
}
let daRipristinare = null; // { io, ... } arrivata dal backup
let coda = Promise.resolve();

export function testoAutofirma(utente, ed, impronta) {
  return `palacan-principale-v1|${t(utente).toLowerCase()}|${t(ed)}|${t(impronta)}`;
}

export function testoFirmaDispositivo(utente, deviceId, curva) {
  return `palacan-firma-dispositivo-v1|${t(utente).toLowerCase()}|${t(deviceId)}|${t(curva)}`;
}

function base64(byte) {
  let s = '';
  for (let i = 0; i < byte.length; i += 1) s += String.fromCharCode(byte[i]);
  return btoa(s);
}

function daBase64(testo) {
  const s = t(testo);
  return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

function inEsclusiva(io, fn) {
  if (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function') {
    return navigator.locks.request(`palacan-chiave-principale-${io}`, fn);
  }
  const prossimo = coda.then(fn, fn);
  coda = prossimo.catch(() => {});
  return prossimo;
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
    if (valore == null) localStorage.removeItem(chiave);
    else localStorage.setItem(chiave, JSON.stringify(valore));
  } catch (_) { /* archivio pieno: si riprova la prossima volta */ }
}

function conto(materiale) {
  const a = new Olm.Account();
  a.unpickle(daBase64(materiale.chiavePickle), materiale.pickle);
  return a;
}

function liberaConto(a) {
  try {
    if (a && typeof a.free === 'function') a.free();
  } catch (_) { /* gia' liberato */ }
}

/** Materiale nuovo: account Olm dedicato (ed25519) + seme ML-DSA-65. */
export async function nuovaChiavePrincipale() {
  const a = new Olm.Account();
  a.create();
  try {
    const chiavePickle = base64(crypto.getRandomValues(new Uint8Array(32)));
    const ed = JSON.parse(a.identity_keys()).ed25519;
    const seme = Olm.pqfirma_nuovo_seme();
    const pq = Olm.pqfirma_chiave_pubblica(seme);
    return { ed, pq, impronta: await improntaDi(pq), seme, pickle: a.pickle(daBase64(chiavePickle)), chiavePickle };
  } finally {
    liberaConto(a);
  }
}

/** Firma ibrida con la chiave principale: { fe, fq }. */
export function firmaConPrincipale(materiale, contesto, messaggio) {
  const a = conto(materiale);
  try {
    const fe = a.sign(Olm.pqfirma_testo_ibrido(contesto, materiale.ed, materiale.pq, messaggio));
    const fq = Olm.pqfirma_firma(materiale.seme, contesto, materiale.ed, messaggio);
    return { fe, fq };
  } finally {
    liberaConto(a);
  }
}

function verifica(contesto, ed, pq, messaggio, fe, fq) {
  try {
    return Olm.pqfirma_verifica_ibrida(t(contesto), t(ed), t(pq), String(messaggio ?? ''), t(fe), t(fq)) === true;
  } catch (_) {
    return false;
  }
}

/** La chiave principale di "utente" com'e' arrivata dal server: vera solo se impronta e autofirma ibrida reggono. */
export async function verificaChiavePrincipale(utente, vista) {
  if (!vista || !t(vista.ed) || !t(vista.pq) || !t(vista.impronta)) return false;
  try {
    if ((await improntaDi(vista.pq)) !== t(vista.impronta)) return false;
  } catch (_) {
    return false;
  }
  return verifica(CONTESTO_PRINCIPALE, vista.ed, vista.pq, testoAutofirma(utente, vista.ed, vista.impronta), vista.firma_ed, vista.firma_pq);
}

/**
 * Il dispositivo (bundle di /device-bundles: device_id, identity_key, firma_principale) e' firmato dalla chiave
 * principale "principale" (gia' verificata) di "utente"? Solo se l'impronta coincide e la firma ibrida regge.
 */
export function dispositivoFirmato(utente, principale, bundle) {
  const f = bundle && bundle.firma_principale;
  if (!principale || !f || t(f.impronta) !== t(principale.impronta)) return false;
  return verifica(CONTESTO_DISPOSITIVO, principale.ed, principale.pq,
    testoFirmaDispositivo(utente, bundle.device_id, bundle.identity_key), f.firma_ed, f.firma_pq);
}

async function leggiLocale(io) {
  let grezzo = null;
  try {
    grezzo = localStorage.getItem(archivio(io));
  } catch (_) {
    return null;
  }
  if (!grezzo) return null;
  const dati = JSON.parse(await decifraConDispositivo(grezzo, etichetta(io))); // CHIAVE_BLOCCATA: si propaga
  return dati && t(dati.ed) && t(dati.pq) && t(dati.seme) && t(dati.pickle) && t(dati.chiavePickle) ? dati : null;
}

async function scriviLocale(io, dati) {
  if (!dati) {
    try { localStorage.removeItem(archivio(io)); } catch (_) { /* niente da togliere */ }
    return;
  }
  localStorage.setItem(archivio(io), await cifraConDispositivo(JSON.stringify(dati), etichetta(io)));
}

function materialeValido(m) {
  return Boolean(m && t(m.ed) && t(m.pq) && t(m.seme) && t(m.pickle) && t(m.chiavePickle));
}

async function leggiDalServer(api, io, token) {
  try {
    return await api.getChiavePrincipale(io, token);
  } catch (e) {
    if (e && (e.status === 404 || /404|non trovat|not found/i.test(String(e.message || '')))) return null;
    throw e;
  }
}

/**
 * Assicura che questo dispositivo sia firmato dalla chiave principale dell'account (creandola e pubblicandola se
 * l'account non ne ha ancora una). Non lancia mai. Restituisce { stato, impronta }:
 *   'firmato'        dispositivo firmato con la chiave principale attuale (e chiave pronta per il backup);
 *   'da_approvare'   l'account ha una chiave principale che questo dispositivo non possiede: arrivera' dal backup
 *                    o con l'approvazione da un altro dispositivo (L4c4);
 *   'errore'         rete o server: si riprova piu' tardi.
 */
export function assicuraChiavePrincipale({ io, token, dispositivo, curva, api = apiService, ora = () => Date.now() }) {
  const me = t(io);
  if (!me || !token || !t(dispositivo) || !t(curva)) return Promise.resolve({ stato: 'errore', errore: 'dati mancanti' });
  return inEsclusiva(me, async () => {
    try {
      let locale = await leggiLocale(me);
      const ripristino = daRipristinare && daRipristinare.io === me ? daRipristinare : null;
      const sulServer = await leggiDalServer(api, me, token);
      if (sulServer && !(await verificaChiavePrincipale(me, sulServer))) {
        console.warn('⚠️ [L4c] la chiave principale sul server non regge la sua autofirma: ignorata');
        return { stato: 'errore', errore: 'chiave principale non valida sul server' };
      }
      // dal backup: si adotta solo se e' quella ATTUALE dell'account (o se l'account non ne ha ancora una)
      if (ripristino && materialeValido(ripristino.materiale) && (!sulServer || t(sulServer.impronta) === t(ripristino.materiale.impronta))) {
        if (!locale || locale.impronta !== ripristino.materiale.impronta) {
          locale = { ...ripristino.materiale };
          await scriviLocale(me, locale);
        }
      }
      daRipristinare = null;
      if (locale && sulServer && locale.impronta !== t(sulServer.impronta)) {
        // un altro dispositivo ha pubblicato un'altra chiave (o l'account e' stato ripristinato): quella locale non vale
        await scriviLocale(me, null);
        locale = null;
      }
      if (!locale && sulServer) {
        mia = null;
        // [palacan-l4c4] approvato da un altro dispositivo? La firma si controlla sulla chiave VERA di questo
        // dispositivo (curva), mai su quella che dice il server: se regge, riceve i messaggi anche senza la chiave.
        let approvato = false;
        if (typeof api.getMyDevices === 'function') {
          try {
            const miei = await api.getMyDevices(token);
            const questo = (Array.isArray(miei) ? miei : []).find((d) => d && d.device_id === t(dispositivo) && !d.revoked_at);
            approvato = Boolean(questo) && dispositivoFirmato(me, sulServer, {
              device_id: t(dispositivo), identity_key: t(curva), firma_principale: questo.firma_principale,
            });
          } catch (_) {
            approvato = false;
          }
        }
        const statoL4c4 = approvato ? 'approvato' : 'da_approvare';
        ricordaStato(me, dispositivo, curva, statoL4c4);
        return { stato: statoL4c4, impronta: t(sulServer.impronta) };
      }
      if (!locale) {
        locale = await nuovaChiavePrincipale();
        await scriviLocale(me, locale); // prima sul dispositivo, poi sul server: mai una chiave pubblicata senza privata
      }
      if (!sulServer) {
        const auto = firmaConPrincipale(locale, CONTESTO_PRINCIPALE, testoAutofirma(me, locale.ed, locale.impronta));
        try {
          await api.putChiavePrincipale({ ed: locale.ed, pq: locale.pq, firma_ed: auto.fe, firma_pq: auto.fq }, token);
        } catch (e) {
          if (e && e.status === 409) {
            // un altro dispositivo e' arrivato prima: si riprova da capo (si adottera' la sua dal backup)
            await scriviLocale(me, null);
            mia = null;
            ricordaStato(me, dispositivo, curva, 'da_approvare');  // [palacan-l4c4]
            return { stato: 'da_approvare', impronta: null };
          }
          throw e;
        }
        console.log('🛡️ [L4c] chiave principale (ed25519 + ML-DSA-65) pubblicata');
      }
      mia = { io: me, ...locale };
      const segno = leggiJson(archivioSegno(me));
      const per = `${t(dispositivo)}|${t(curva)}|${locale.impronta}`;
      if (!segno || segno.per !== per || ora() - (Number(segno.quando) || 0) > RIFIRMA_MS) {
        const f = firmaConPrincipale(locale, CONTESTO_DISPOSITIVO, testoFirmaDispositivo(me, dispositivo, curva));
        await api.putFirmaDispositivo(t(dispositivo), { impronta_principale: locale.impronta, firma_ed: f.fe, firma_pq: f.fq }, token);
        scriviJson(archivioSegno(me), { per, quando: ora() });
        console.log('🛡️ [L4c] questo dispositivo e\' firmato dalla chiave principale');
      }
      ricordaStato(me, dispositivo, curva, 'firmato');  // [palacan-l4c4]
      return { stato: 'firmato', impronta: locale.impronta };
    } catch (e) {
      console.warn('[L4c] chiave principale non pronta (si riprova piu\' tardi):', e && (e.status || e.codice || e.message));
      return { stato: 'errore', errore: (e && (e.codice || e.message)) || 'errore' };
    }
  });
}

/** Firma un ALTRO proprio dispositivo (approvazione, L4c4). Serve la chiave principale su questo dispositivo. */
export function firmaAltroDispositivo({ io, token, deviceId, curva, api = apiService }) {
  const me = t(io);
  if (!mia || mia.io !== me || !t(deviceId) || !t(curva)) return Promise.resolve(false);
  const f = firmaConPrincipale(mia, CONTESTO_DISPOSITIVO, testoFirmaDispositivo(me, deviceId, curva));
  return api.putFirmaDispositivo(t(deviceId), { impronta_principale: mia.impronta, firma_ed: f.fe, firma_pq: f.fq }, token)
    .then(() => true, () => false);
}

/** Impronta della chiave principale di questo account se questo dispositivo la possiede, oppure null. */
export function improntaPrincipale(io) {
  return mia && mia.io === t(io) ? mia.impronta : null;
}

/** Per il backup delle chiavi (con l'account Olm): solo la chiave principale ATTUALE, oppure null. */
export function chiavePrincipalePerBackup(io) {
  if (!mia || mia.io !== t(io)) return null;
  const { ed, pq, impronta, seme, pickle, chiavePickle } = mia;
  return { ed, pq, impronta, seme, pickle, chiavePickle };
}

/** Dal backup (ripristino o backup unito di un altro dispositivo): si adotta al prossimo assicuraChiavePrincipale. */
export function ripristinaChiavePrincipaleDaBackup(io, voce) {
  if (t(io) && materialeValido(voce)) daRipristinare = { io: t(io), materiale: { ...voce } };
}

/** [palacan-l4c4] { io, dispositivo, curva, stato } di questo dispositivo ('firmato', 'approvato', 'da_approvare'). */
export function statoQuestoDispositivo(io) {
  if (!ultimo) return null;
  if (io && ultimo.io !== t(io)) return null;
  return { ...ultimo };
}

// Solo per i test.
export function _azzeraChiavePrincipale() {
  mia = null;
  ultimo = null;
  daRipristinare = null;
  coda = Promise.resolve();
}
