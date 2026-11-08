// src/utils/oraMessaggio.js
//
// Palacan - ora esatta dentro il messaggio cifrato (metadati fase 3.4a).
//
// Il server arrotonda l'orario che conserva (fase 3.4e): l'ora precisa viaggia quindi DENTRO il
// contenuto cifrato ("ts"), leggibile solo dai partecipanti.
// L'ora dentro il messaggio la sceglie chi scrive: viene accettata solo se e' vicina all'ora del
// server (entro 2 ore, margine sufficiente anche con l'orario arrotondato all'ora); altrimenti si
// mostra l'ora del server. I messaggi senza "ts" (quelli vecchi) mostrano l'ora del server.
//
// Correzione: il server lavora sempre in UTC. Un suo orario scritto SENZA fuso (es. "2026-09-27T22:00:00")
// va letto come UTC: il browser altrimenti lo leggerebbe come ora locale (in Italia due ore di differenza),
// scartando per errore l'ora esatta del messaggio.

const TOLLERANZA_MS = 2 * 60 * 60 * 1000;
const HA_FUSO = /(Z|[+-]\d{2}:?\d{2})$/i;

// Orario del server come istante preciso (UTC se il fuso manca); NaN se non leggibile.
export function istanteServer(oraServer) {
  if (!oraServer) return NaN;
  if (oraServer instanceof Date) return oraServer.getTime();
  const testo = String(oraServer).trim().replace(' ', 'T');
  return Date.parse(HA_FUSO.test(testo) ? testo : `${testo}Z`);
}

// Aggiunge l'ora di invio a un contenuto oggetto (non la sovrascrive se c'e' gia').
export function aggiungiOra(contenuto) {
  if (!contenuto || typeof contenuto !== 'object' || Array.isArray(contenuto) || contenuto.ts != null) {
    return contenuto;
  }
  return { ...contenuto, ts: new Date().toISOString() };
}

// Ora da mostrare per un messaggio decifrato (sempre in formato ISO con fuso, quando leggibile).
export function oraMessaggio(contenuto, oraServer) {
  const server = istanteServer(oraServer);
  const dichiarata = contenuto && typeof contenuto === 'object' && typeof contenuto.ts === 'string'
    ? Date.parse(contenuto.ts)
    : NaN;
  if (!Number.isNaN(dichiarata)) {
    if (Number.isNaN(server) || Math.abs(dichiarata - server) <= TOLLERANZA_MS) {
      return new Date(dichiarata).toISOString();
    }
  }
  // orario del server gia' con fuso: restituito com'e'; senza fuso: riscritto come UTC esplicito
  if (!Number.isNaN(server) && !HA_FUSO.test(String(oraServer).trim())) return new Date(server).toISOString();
  return oraServer || null;
}
