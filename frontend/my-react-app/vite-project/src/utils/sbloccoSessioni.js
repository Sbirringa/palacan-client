// src/utils/sbloccoSessioni.js
//
// Palacan - CORREZIONE: sblocco delle sessioni Olm incastrate (come l'"unwedging" di Matrix).
//
// Una sessione Olm 1:1 puo' incastrarsi: l'altra persona non riesce piu' a decifrare cio' che le mandiamo (per
// esempio dopo il recupero delle chiavi su un dispositivo nuovo: le sessioni Olm non vengono ripristinate, e la
// chiave usa e getta della sessione vecchia e' gia' stata consumata). La chiave di stanza non viene mai
// confermata. Il segnale di reset dell'altra parte (v1.11-AB) dall'A2 non parte piu': la busta sigillata non dice
// a quale stanza appartiene la chiave. Quindi se ne accorge chi manda: dopo l'ultimo tentativo senza conferma
// butta la sessione e ne apre una nuova, con una chiave usa e getta nuova (messaggio iniziale, sempre apribile).
// Al massimo una volta ogni 10 minuti per persona: se l'altra persona e' solo scollegata, non si consumano
// tutte le sue chiavi usa e getta.

export const PAUSA_SBLOCCO_MS = 10 * 60 * 1000;
const ultimiSblocchi = new Map(); // persona -> istante dell'ultimo sblocco

export function puoSbloccare(persona, adesso = Date.now()) {
  const nome = String(persona || '').trim().toLowerCase();
  if (!nome) return false;
  const ultimo = ultimiSblocchi.get(nome);
  if (ultimo !== undefined && adesso - ultimo < PAUSA_SBLOCCO_MS) return false;
  ultimiSblocchi.set(nome, adesso);
  return true;
}

export function dimenticaSblocchi() {
  ultimiSblocchi.clear();
}
