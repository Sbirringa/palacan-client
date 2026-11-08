// src/utils/gruppiPrivati.js
//
// Palacan - METADATI A3.2a: creare un gruppo senza mandare il nome al server.
//
// Per i gruppi PRIVATI il server non riceve piu' il nome: resta sui dispositivi dei membri (nomiStanze.js) e
// viaggia dentro le chiavi di stanza (A3.1). Le stanze AZIENDALI invece hanno il nome sul server (area
// amministratore, audit): dove l'app non sa se l'account e' aziendale, si prova senza nome e, SOLO se il server
// risponde "Nome stanza obbligatorio" (succede solo per le stanze aziendali), si riprova con il nome.

import * as apiService from '../apiService';
import { imparaNomeStanza } from './nomiStanze';

export async function creaStanzaSenzaNome(nome, password, token, reparto = false, crea = apiService.createRoom) {
  const resto = reparto ? [password, token, reparto] : [password, token]; // stessa forma di chiamata di prima
  let stanza;
  try {
    stanza = await crea('', ...resto);
  } catch (errore) {
    const testo = String(errore?.message || errore?.detail || '');
    if (!nome || !/nome stanza obbligatorio/i.test(testo)) throw errore;
    stanza = await crea(nome, ...resto);
  }
  if (stanza?.id && nome && !(stanza.is_corporate || stanza.isCorporate)) imparaNomeStanza(stanza.id, nome);
  return stanza;
}
