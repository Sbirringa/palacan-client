// src/utils/fiduciaContatti.js  [palacan-l4c3]
//
// Firma incrociata ibrida (L4c), lato contatti: ci si fida della PERSONA (la sua chiave principale, ed25519 +
// ML-DSA-65) e dei dispositivi che quella chiave ha firmato.
//   - TOFU sulla chiave principale: la prima vista (con autofirma valida) si ricorda; se cambia, stesso avviso di L4a
//     (e invio bloccato se il contatto era verificato). Un dispositivo nuovo FIRMATO non da' nessun avviso.
//   - Chi ha una chiave principale riceve le chiavi delle stanze solo sui dispositivi firmati; quelli non firmati si
//     contano (banner) e restano fuori. Chi non ne ha ancora una (app vecchia) segue le regole di prima (L4a).
//   - Una chiave gia' ricordata vale anche se il server smette di consegnarla o la consegna rotta: niente ritorno
//     silenzioso alle regole vecchie (attacco di "declassamento").
//   - Numero di sicurezza v2: 60 cifre dalle chiavi principali (30 per persona, SHA-512 ripetuto 5200 volte, come
//     Signal). Non cambia quando si aggiunge un dispositivo.
import { verificaChiavePrincipale, dispositivoFirmato } from './chiavePrincipale';
import { avvisaNonFirmati } from './dispositiviNonFirmati';

const t = (v) => (v == null ? '' : String(v).trim().toLowerCase());
const archivio = (io) => `palacan_principali_contatti_${t(io)}`;
const archivioVerificate = (io) => `palacan_principali_verificate_${t(io)}`;
export const ITERAZIONI_NUMERO = 5200;

function leggiJson(chiave) {
  try {
    const o = JSON.parse(localStorage.getItem(chiave) || 'null');
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch (_) {
    return {};
  }
}

function scriviJson(chiave, valore) {
  try {
    localStorage.setItem(chiave, JSON.stringify(valore));
  } catch (_) { /* archivio pieno: si ricalcola la prossima volta */ }
}

/** La chiave principale ricordata di "peer" ({ ed, pq, impronta, versione }) oppure null. */
export function principaleDelContatto(io, peer) {
  const v = leggiJson(archivio(io))[t(peer)];
  return v && v.ed && v.pq && v.impronta ? v : null;
}

function ricorda(io, peer, vista) {
  const tutte = leggiJson(archivio(io));
  tutte[t(peer)] = { ed: vista.ed, pq: vista.pq, impronta: vista.impronta, versione: vista.versione || 1, vista: Date.now() };
  scriviJson(archivio(io), tutte);
}

/** Impronta della chiave principale di "peer" che l'utente ha verificato (numero v2 o QR v2), oppure null. */
export function principaleVerificata(io, peer) {
  return leggiJson(archivioVerificate(io))[t(peer)] || null;
}

export function segnaPrincipaleVerificata(io, peer, impronta) {
  const tutte = leggiJson(archivioVerificate(io));
  tutte[t(peer)] = String(impronta || '');
  scriviJson(archivioVerificate(io), tutte);
}

/**
 * Chiave principale di "utente" da usare, dato quello che consegna il server (puo' mancare o essere rotta).
 * Restituisce { principale, stato } con stato: 'assente' (mai vista: regole vecchie), 'nuova', 'nota', 'cambiata',
 * 'mancante' o 'non_valida' (il server non la consegna o la consegna rotta: vale quella ricordata).
 */
export async function valutaPrincipale({ io, utente, principale, haVerificato, segnalaCambio }) {
  const me = t(io);
  const peer = t(utente);
  const ricordata = principaleDelContatto(me, peer);
  if (!principale) return { principale: ricordata, stato: ricordata ? 'mancante' : 'assente' };
  if (!(await verificaChiavePrincipale(peer, principale))) {
    console.warn(`⚠️ [L4c] chiave principale di ${peer} con autofirma non valida: ignorata`);
    return { principale: ricordata, stato: 'non_valida' };
  }
  const vista = { ed: principale.ed, pq: principale.pq, impronta: principale.impronta, versione: principale.versione || 1 };
  if (!ricordata) {
    ricorda(me, peer, vista);
    return { principale: vista, stato: 'nuova' };
  }
  if (ricordata.impronta === vista.impronta) return { principale: ricordata, stato: 'nota' };
  if (peer !== me && typeof segnalaCambio === 'function') {
    const verificato = principaleVerificata(me, peer) === ricordata.impronta
      || Boolean(typeof haVerificato === 'function' && haVerificato(me, peer));
    segnalaCambio(me, peer, { previousKey: ricordata.impronta, newKey: vista.impronta, tipo: 'principale', verificato });
  }
  ricorda(me, peer, vista);
  return { principale: vista, stato: 'cambiata' };
}

/**
 * Dispositivi di "utente" (bundle di /device-bundles, con .principale) che possono ricevere chiavi:
 * { ammessi, esclusi, principale }. Senza chiave principale (ne' consegnata ne' ricordata): tutti ammessi.
 */
export async function filtraDispositiviFirmati({ io, utente, bundles, haVerificato, segnalaCambio, aggiungiNote }) {
  const lista = Array.isArray(bundles) ? bundles : [];
  const { principale } = await valutaPrincipale({ io, utente, principale: bundles && bundles.principale, haVerificato, segnalaCambio });
  if (!principale) return { ammessi: lista, esclusi: [], principale: null };
  const ammessi = [];
  const esclusi = [];
  for (const b of lista) (dispositivoFirmato(utente, principale, b) ? ammessi : esclusi).push(b);
  if (typeof aggiungiNote === 'function' && ammessi.length) {
    aggiungiNote(io, utente, ammessi.map((b) => b.identity_key).filter(Boolean));
  }
  if (t(io) !== t(utente)) avvisaNonFirmati(io, utente, esclusi.map((b) => b.device_id));
  if (esclusi.length) console.warn(`⚠️ [L4c] ${esclusi.length} dispositivi di ${t(utente)} non firmati dalla chiave principale: esclusi`);
  return { ammessi, esclusi, principale };
}

/** Il dispositivo "bundle" (uno di "bundles") puo' ricevere chiavi? Vedi filtraDispositiviFirmati. */
export async function ammessoDaChiavePrincipale({ io, utente, bundle, bundles }) {
  const { ammessi } = await filtraDispositiviFirmati({ io, utente, bundles });
  return ammessi.includes(bundle);
}

function daBase64(testo) {
  const s = String(testo || '').trim();
  return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

function daEsadecimale(testo) {
  const s = String(testo || '').trim();
  const b = new Uint8Array(s.length / 2);
  for (let i = 0; i < b.length; i += 1) b[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return b;
}

async function sha512(...parti) {
  const lunghezza = parti.reduce((n, p) => n + p.length, 0);
  const tutto = new Uint8Array(lunghezza);
  let k = 0;
  for (const p of parti) {
    tutto.set(p, k);
    k += p.length;
  }
  return new Uint8Array(await crypto.subtle.digest('SHA-512', tutto));
}

const cifreCalcolate = new Map(); // "utente|ed|impronta" -> 6 gruppi (5200 hash: si calcolano una volta sola)

/** 30 cifre (6 gruppi da 5) che identificano la chiave principale di una persona. */
export async function cifrePersona(utente, principale) {
  const chiaveMemoria = `${t(utente)}|${principale.ed}|${principale.impronta}`;
  if (cifreCalcolate.has(chiaveMemoria)) return cifreCalcolate.get(chiaveMemoria).slice();
  const ed = daBase64(principale.ed);
  const pq = daEsadecimale(principale.impronta);
  let h = await sha512(new Uint8Array([0, 2]), ed, pq, new TextEncoder().encode(t(utente)));
  for (let i = 0; i < ITERAZIONI_NUMERO; i += 1) h = await sha512(h, ed, pq);
  const gruppi = [];
  for (let g = 0; g < 6; g += 1) {
    let v = 0;
    for (let j = 0; j < 5; j += 1) v = v * 256 + h[g * 5 + j];
    gruppi.push(String(v % 100000).padStart(5, '0'));
  }
  if (cifreCalcolate.size > 200) cifreCalcolate.clear();
  cifreCalcolate.set(chiaveMemoria, gruppi.slice());
  return gruppi;
}

/** Numero di sicurezza v2: 12 gruppi da 5 cifre, uguale dai due lati (prima chi ha il nome che viene prima). */
export async function numeroSicurezzaV2(io, principaleMia, peer, principaleContatto) {
  if (!principaleMia || !principaleContatto) return null;
  const a = [t(io), principaleMia];
  const b = [t(peer), principaleContatto];
  const [primo, secondo] = a[0] <= b[0] ? [a, b] : [b, a];
  const cifre = [...(await cifrePersona(primo[0], primo[1])), ...(await cifrePersona(secondo[0], secondo[1]))];
  return cifre.join(' ');
}
