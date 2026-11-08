// src/utils/idProvvisorio.js  [palacan-m1c]
//
// Identificativo provvisorio di un messaggio (o reazione) in invio. Prima era `${Date.now()}-${Math.random()}`:
// il server lo salva come client_msg_id e riceveva cosi' l'istante esatto di ogni invio, al millesimo.
// Ora e' casuale: "c" + 32 cifre esadecimali. Non contiene l'ora e non si confonde con un UUID del server
// (che ha i trattini). La forma vecchia resta riconosciuta (isOptimisticPendingId) per i messaggi gia' in coda.

export const ID_PROVVISORIO = /^c[0-9a-f]{32}$/;

export function nuovoIdProvvisorio() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return `c${c.randomUUID().replace(/-/g, '')}`;
  const byte = new Uint8Array(16);
  c.getRandomValues(byte);
  return `c${Array.from(byte, (x) => x.toString(16).padStart(2, '0')).join('')}`;
}
