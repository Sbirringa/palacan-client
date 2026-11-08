// src/utils/dispositiviNonFirmati.js  [palacan-l4c3]
//
// Dispositivi di un contatto NON firmati dalla sua chiave principale: non ricevono le chiavi delle stanze (vedi
// fiduciaContatti.js). Qui solo il conteggio per l'interfaccia (banner della chat), senza dipendenze: nessuna chiave.
const t = (v) => (v == null ? '' : String(v).trim().toLowerCase());
const archivio = (io) => `palacan_non_firmati_${t(io)}`;
export const EVENTO_NON_FIRMATI = 'palacan:dispositivi-non-firmati';

function leggi(io) {
  try {
    const o = JSON.parse(localStorage.getItem(archivio(io)) || 'null');
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch (_) {
    return {};
  }
}

/** Ricorda quali dispositivi di "peer" sono stati esclusi all'ultimo invio (lista vuota = nessuno). */
export function avvisaNonFirmati(io, peer, deviceIds) {
  const me = t(io);
  const p = t(peer);
  if (!me || !p) return;
  const lista = (Array.isArray(deviceIds) ? deviceIds : []).map((x) => String(x)).filter(Boolean).sort();
  const tutti = leggi(me);
  const prima = Array.isArray(tutti[p]) ? tutti[p] : [];
  if (prima.join('|') === lista.join('|')) return;
  if (lista.length) tutti[p] = lista;
  else delete tutti[p];
  try {
    localStorage.setItem(archivio(me), JSON.stringify(tutti));
  } catch (_) { /* archivio pieno: solo un avviso grafico */ }
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(EVENTO_NON_FIRMATI, { detail: { peer: p } }));
    }
  } catch (_) { /* solo un avviso grafico */ }
}

/** Quanti dispositivi di "peer" sono esclusi perche' non firmati. */
export function contaNonFirmati(io, peer) {
  const lista = leggi(io)[t(peer)];
  return Array.isArray(lista) ? lista.length : 0;
}
