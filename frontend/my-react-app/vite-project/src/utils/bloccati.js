// src/utils/bloccati.js
//
// Palacan - contatti bloccati applicati dal dispositivo (metadati fase 3.4d, corretta con i periodi).
//
// Dal canale anonimo (3.4c) il server non sa chi scrive nelle chat private e non puo' piu' scartare i
// messaggi di un contatto bloccato. Li nasconde l'app di chi ha bloccato: nelle chat DIRETTE i messaggi del
// bloccato scritti DURANTE un periodo di blocco non vengono mostrati, nemmeno dopo lo sblocco (come faceva
// il server, e come WhatsApp e Signal). Quelli scritti prima e dopo restano. Chi e' bloccato non se ne accorge.

import { istanteServer } from './oraMessaggio';

let periodi = new Map(); // nome utente -> [{ da, a }] in ms; a = null se il blocco e' ancora attivo

// Accetta sia i periodi (GET /users/block-periods: blocked_at, unblocked_at) sia l'elenco dei bloccati
// attuali (GET /users/blocked, versione precedente del backend: solo blocked_at).
export function impostaBloccati(elenco) {
  const nuovi = new Map();
  for (const voce of Array.isArray(elenco) ? elenco : []) {
    if (!voce || !voce.username) continue;
    const da = voce.blocked_at ? istanteServer(voce.blocked_at) : NaN;
    const a = voce.unblocked_at ? istanteServer(voce.unblocked_at) : NaN;
    const chiave = String(voce.username).trim();
    if (!nuovi.has(chiave)) nuovi.set(chiave, []);
    nuovi.get(chiave).push({ da: Number.isNaN(da) ? 0 : da, a: Number.isNaN(a) ? null : a });
  }
  periodi = nuovi;
}

// Bloccato adesso (un periodo senza fine).
export function eBloccato(mittente) {
  const elenco = periodi.get(String(mittente || '').trim());
  return Boolean(elenco && elenco.some((p) => p.a === null));
}

// true se il messaggio non va mostrato: chat diretta, autore bloccato nel momento in cui ha scritto.
// Ora del messaggio sconosciuta: si nasconde solo se il contatto e' bloccato adesso (scelta prudente).
export function messaggioDaBloccato(mittente, oraMessaggio, chatDiretta) {
  if (!chatDiretta || !mittente) return false;
  const elenco = periodi.get(String(mittente).trim());
  if (!elenco || elenco.length === 0) return false;
  const scrittoIl = oraMessaggio ? istanteServer(oraMessaggio) : NaN;
  if (Number.isNaN(scrittoIl)) return elenco.some((p) => p.a === null);
  return elenco.some((p) => scrittoIl >= p.da && (p.a === null || scrittoIl < p.a));
}
